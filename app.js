const SALARY_CAP=50000;
const SLOT_ORDER=['QB','RB1','RB2','WR1','WR2','WR3','TE','FLEX','DST'];
const STORAGE_KEY='weeklyNFLDraftMVP-v2';
const SLEEPER_PLAYERS='https://api.sleeper.app/v1/players/nfl';
const SLEEPER_STATE='https://api.sleeper.app/v1/state/nfl';
const DAY=24*60*60*1000;
const state={players:[],lineup:Object.fromEntries(SLOT_ORDER.map(s=>[s,null])),activePosition:'ALL',search:'',submitted:false,liveStats:{},lastSleeperSync:0,nflState:null};

const FALLBACK_PLAYERS=(window.WEEK1_2026_PLAYERS||[]).map(p=>({...p,source:'fallback'}));

function money(n){return '$'+Number(n||0).toLocaleString('en-US')}
function lineupPlayers(){return SLOT_ORDER.map(s=>state.lineup[s]).filter(Boolean)}
function salaryUsed(){return lineupPlayers().reduce((t,p)=>t+p.salary,0)}
function projected(){return lineupPlayers().reduce((t,p)=>t+(Number(p.avg)||0),0)}
function currentFantasyPoints(player){return Number(state.liveStats[player.id]?.fantasyPoints||0)}
function sleeperHeadshot(player){return player.position==='DST'?'':(player.image||`https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(player.id)}.jpg`)}
function playerVisual(player,size='normal'){
  if(player.position==='DST')return `<div class="player-avatar ${size==='small'?'player-avatar-small':''}">DST</div>`;
  const src=sleeperHeadshot(player);
  return `<div class="player-photo-wrap ${size==='small'?'player-photo-wrap-small':''}"><img class="player-photo" src="${escapeAttr(src)}" alt="${escapeAttr(player.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="player-avatar player-photo-fallback ${size==='small'?'player-avatar-small':''}">${escapeHtml(player.position)}</div></div>`;
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify({players:state.players,lineup:state.lineup,submitted:state.submitted,liveStats:state.liveStats,lastSleeperSync:state.lastSleeperSync,nflState:state.nflState}))}
function load(){try{const s=JSON.parse(localStorage.getItem(STORAGE_KEY));if(s){Object.assign(state,s);state.lineup={...Object.fromEntries(SLOT_ORDER.map(x=>[x,null])),...(s.lineup||{})};return}}catch(e){} state.players=FALLBACK_PLAYERS}

function round100(n){return Math.round(n/100)*100}
function generatedSalary(position,rank,total){
  const ranges={QB:[4000,8000],RB:[4000,9000],WR:[3500,9000],TE:[3000,7000],DST:[2500,4000]};
  const [min,max]=ranges[position];
  const pct=total<=1?1:1-(rank/(total-1));
  const curve=Math.pow(Math.max(0,pct),0.72);
  return Math.max(min,Math.min(max,round100(min+(max-min)*curve)));
}
function generatedProjection(position,salary){
  const base={QB:8,RB:5,WR:4,TE:3,DST:4}[position]||3;
  const factor={QB:0.0022,RB:0.00215,WR:0.0021,TE:0.002,DST:0.0014}[position]||0.002;
  return Math.round((base+(salary-2500)*factor)*10)/10;
}
function sleeperName(p,position){if(position==='DST')return p.full_name||p.team||p.player_id;return p.full_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||p.player_id}
function sleeperRank(p){const r=Number(p.search_rank);return Number.isFinite(r)&&r>0?r:99999}
function buildSleeperPool(raw){
  const groups={QB:[],RB:[],WR:[],TE:[],DST:[]};
  Object.values(raw||{}).forEach(p=>{
    let pos=String(p.position||'').toUpperCase(); if(pos==='DEF')pos='DST';
    if(!groups[pos]||!p.team)return;
    if(pos!=='DST'&&p.active===false)return;
    groups[pos].push(p);
  });
  const limits={QB:40,RB:90,WR:120,TE:60,DST:32};
  const out=[];
  Object.entries(groups).forEach(([pos,items])=>{
    items.sort((a,b)=>sleeperRank(a)-sleeperRank(b)||String(a.last_name||'').localeCompare(String(b.last_name||'')));
    const chosen=items.slice(0,limits[pos]);
    chosen.forEach((p,i)=>{
      const salary=generatedSalary(pos,i,chosen.length);
      const id=String(p.player_id);
      out.push({id,name:sleeperName(p,pos),position:pos,team:p.team,opp:'',salary,avg:generatedProjection(pos,salary),game:'Schedule TBC',source:'Sleeper',rank:i+1,status:p.injury_status||'',searchRank:sleeperRank(p),image:pos==='DST'?'':`https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(id)}.jpg`});
    });
  });
  return out;
}
async function syncSleeper(force=false){
  const status=document.getElementById('sleeperStatus');
  if(!force&&state.players.length&&Date.now()-Number(state.lastSleeperSync||0)<DAY)return;
  if(status)status.textContent='Refreshing free NFL player data from Sleeper…';
  try{
    const [playersRes,stateRes]=await Promise.all([fetch(SLEEPER_PLAYERS,{cache:'no-store'}),fetch(SLEEPER_STATE,{cache:'no-store'})]);
    if(!playersRes.ok)throw new Error(`Sleeper player request failed (${playersRes.status})`);
    const raw=await playersRes.json(); const nflState=stateRes.ok?await stateRes.json():null;
    const pool=buildSleeperPool(raw); if(pool.length<100)throw new Error('Sleeper returned an unexpectedly small player pool.');
    state.players=pool; state.lastSleeperSync=Date.now(); state.nflState=nflState; save(); renderAll(); updateWeekLabels();
    if(status)status.innerHTML=`<span class="success">Loaded ${pool.length} NFL players from Sleeper. Salaries generated locally. Last sync: ${new Date().toLocaleString()}.</span>`;
  }catch(err){
    if(!state.players.length)state.players=FALLBACK_PLAYERS;
    renderAll(); if(status)status.innerHTML=`<span class="danger">Sleeper refresh failed: ${escapeHtml(err.message)}. Using cached/fallback data.</span>`;
  }
}
function updateWeekLabels(){
  const season=state.nflState?.season||'2026',week=state.nflState?.week||1;
  document.querySelectorAll('[data-week-label]').forEach(e=>e.textContent=`WEEK ${week}`);
  const hero=document.getElementById('heroWeek'); if(hero)hero.textContent=`WEEK ${week} · ${season}`;
}

function getEligibleSlots(p){if(p.position==='QB')return['QB'];if(p.position==='RB')return['RB1','RB2','FLEX'];if(p.position==='WR')return['WR1','WR2','WR3','FLEX'];if(p.position==='TE')return['TE','FLEX'];if(p.position==='DST')return['DST'];return[]}
function addPlayer(p){if(state.submitted){message('Lineup is submitted. Clear it to make changes.','danger');return}if(lineupPlayers().some(x=>x.id===p.id))return;if(salaryUsed()+p.salary>SALARY_CAP){message('That player would take you over the $50,000 salary cap.','danger');return}const slot=getEligibleSlots(p).find(s=>!state.lineup[s]);if(!slot){message('No eligible lineup slot is available for that player.','danger');return}state.lineup[slot]=p;save();renderAll()}
function removeSlot(slot){if(state.submitted)return;state.lineup[slot]=null;save();renderAll()}
function message(text,type=''){const el=document.getElementById('lineupMessage');if(!el)return;el.textContent=text;el.className='lineup-message '+type}

function renderPlayers(){const body=document.getElementById('playerTableBody');if(!body)return;const q=state.search.toLowerCase(),selected=new Set(lineupPlayers().map(p=>p.id));const filtered=state.players.filter(p=>(state.activePosition==='ALL'||p.position===state.activePosition)&&(!q||`${p.name} ${p.team}`.toLowerCase().includes(q))).sort((a,b)=>b.salary-a.salary||a.name.localeCompare(b.name));body.innerHTML=filtered.map(p=>`<tr><td><div class="player-main">${playerVisual(p)}<div><div class="player-name">${escapeHtml(p.name)}</div><div class="player-meta">${p.position} · ${p.team}${p.status?' · '+escapeHtml(p.status):''}</div></div></div></td><td><div class="matchup">${escapeHtml(p.game||'Schedule TBC')}</div></td><td><div class="avg">${Number(p.avg||0).toFixed(1)}</div></td><td><div class="salary">${money(p.salary)}</div></td><td><button class="add-btn" data-add="${escapeAttr(p.id)}" ${selected.has(p.id)||state.submitted?'disabled':''}>+</button></td></tr>`).join('')||'<tr><td colspan="5" class="avg">No players match this filter.</td></tr>'}
function renderLineup(){const wrap=document.getElementById('lineupSlots');if(!wrap)return;wrap.innerHTML=SLOT_ORDER.map(slot=>{const p=state.lineup[slot],label=slot.replace(/\d/g,'');return `<div class="lineup-slot"><div class="slot-label">${label}</div>${p?`<div class="slot-player-with-photo">${playerVisual(p,'small')}<div class="slot-player"><strong>${escapeHtml(p.name)}</strong><span>${p.position} · ${p.team}</span></div></div><div><div class="slot-salary">${money(p.salary)}</div><button class="slot-remove" data-remove="${slot}" ${state.submitted?'disabled':''}>×</button></div>`:'<div class="slot-empty">Select a player</div><div></div>'}</div>`}).join('');const used=salaryUsed();document.getElementById('salaryUsed').textContent=money(used);document.getElementById('salaryRemaining').textContent=money(SALARY_CAP-used);document.getElementById('projectionTotal').textContent=projected().toFixed(1);const b=document.getElementById('submitLineupBtn');b.textContent=state.submitted?'LINEUP SUBMITTED':'SUBMIT LINEUP';b.disabled=state.submitted}
function renderMyTeam(){const list=document.getElementById('myTeamList'),players=lineupPlayers();list.innerHTML=players.length?SLOT_ORDER.filter(s=>state.lineup[s]).map(slot=>{const p=state.lineup[slot],stat=state.liveStats[p.id]||{};return `<div class="team-row"><strong class="slot-label">${slot.replace(/\d/g,'')}</strong><div class="team-player-with-photo">${playerVisual(p,'small')}<div><strong>${escapeHtml(p.name)}</strong><div class="player-meta">${p.team} · ${stat.summary||'Not started'}</div></div></div><div class="game-state ${stat.status==='LIVE'?'live':''}">${stat.status||'NS'}</div><div class="live-points">${currentFantasyPoints(p).toFixed(1)}</div></div>`}).join(''):'<div class="admin-note">No players selected yet.</div>';document.getElementById('myLiveScore').textContent=players.reduce((t,p)=>t+currentFantasyPoints(p),0).toFixed(1);document.getElementById('playersLive').textContent=players.filter(p=>state.liveStats[p.id]?.status==='LIVE').length;document.getElementById('playersFinished').textContent=players.filter(p=>state.liveStats[p.id]?.status==='FINAL').length;document.getElementById('teamSalaryUsed').textContent=money(salaryUsed())}
function mockTick(k){return Number(localStorage.getItem('mock-'+k)||0)}
function renderLeaderboard(){const myScore=lineupPlayers().reduce((t,p)=>t+currentFantasyPoints(p),0);const rows=[{name:'Andy',score:myScore,active:lineupPlayers().filter(p=>state.liveStats[p.id]?.status==='LIVE').length,me:true},{name:'Pete',score:Math.max(0,82.4+mockTick('pete')),active:4},{name:'Dave',score:Math.max(0,76.1+mockTick('dave')),active:3}].sort((a,b)=>b.score-a.score);document.getElementById('leaderboard').innerHTML=rows.map((r,i)=>`<div class="leader-row"><div class="leader-rank">${i+1}</div><div class="leader-name"><strong>${r.name}${r.me?' · YOU':''}</strong><span>${r.active} players live</span></div><div class="leader-live">${r.active?'● LIVE':''}</div><div class="leader-score">${r.score.toFixed(1)}</div></div>`).join('')}
function renderAll(){renderPlayers();renderLineup();renderMyTeam();renderLeaderboard();document.getElementById('entryCount').textContent='3'}
function submitLineup(){if(lineupPlayers().length!==SLOT_ORDER.length){message(`Your lineup needs ${SLOT_ORDER.length-lineupPlayers().length} more players.`,'danger');return}if(salaryUsed()>SALARY_CAP){message('Lineup is over the salary cap.','danger');return}state.submitted=true;save();message('Lineup submitted and locked.','success');renderAll()}
function clearLineup(){state.lineup=Object.fromEntries(SLOT_ORDER.map(s=>[s,null]));state.submitted=false;state.liveStats={};save();message('Lineup cleared.');renderAll()}
function simulateUpdate(){const players=lineupPlayers();if(!players.length){const s=document.getElementById('sleeperStatus');if(s)s.textContent='Add players before simulating live scoring.';return}players.forEach((p,i)=>{const current=state.liveStats[p.id]?.fantasyPoints||0,gain=Math.round((Math.random()*5+.5)*10)/10;state.liveStats[p.id]={fantasyPoints:Math.min(Number(p.avg||15)*1.35,current+gain),status:i%4===0&&current>12?'FINAL':'LIVE',summary:randomSummary(p)}});localStorage.setItem('mock-pete',String(mockTick('pete')+Math.random()*4));localStorage.setItem('mock-dave',String(mockTick('dave')+Math.random()*4));save();renderAll()}
function randomSummary(p){if(p.position==='QB')return`${Math.floor(120+Math.random()*180)} pass yds · ${Math.floor(Math.random()*3)} TD`;if(p.position==='DST')return`${Math.floor(Math.random()*4)} sacks · ${Math.floor(Math.random()*3)} TO`;return`${Math.floor(25+Math.random()*90)} yds · ${Math.floor(Math.random()*7)} rec`}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
function escapeAttr(v){return escapeHtml(v)}
function bind(){document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));document.getElementById('view-'+btn.dataset.view).classList.add('active-view')}));document.getElementById('positionTabs').addEventListener('click',e=>{const b=e.target.closest('[data-position]');if(!b)return;state.activePosition=b.dataset.position;document.querySelectorAll('.position-tab').forEach(x=>x.classList.toggle('active',x===b));renderPlayers()});document.getElementById('playerSearch').addEventListener('input',e=>{state.search=e.target.value;renderPlayers()});document.getElementById('playerTableBody').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(!b)return;const p=state.players.find(x=>String(x.id)===String(b.dataset.add));if(p)addPlayer(p)});document.getElementById('lineupSlots').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b)removeSlot(b.dataset.remove)});document.getElementById('submitLineupBtn').addEventListener('click',submitLineup);document.getElementById('clearLineupBtn').addEventListener('click',clearLineup);document.getElementById('simulateBtn').addEventListener('click',simulateUpdate);document.getElementById('syncSleeperBtn')?.addEventListener('click',()=>syncSleeper(true))}
load();bind();renderAll();updateWeekLabels();syncSleeper(false);
