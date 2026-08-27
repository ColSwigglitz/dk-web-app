const SALARY_CAP = 50000;
const SLOT_ORDER = ['QB','RB1','RB2','WR1','WR2','WR3','TE','FLEX','DST'];
const state = {
  players: [],
  lineup: Object.fromEntries(SLOT_ORDER.map(s => [s, null])),
  activePosition: 'ALL',
  search: '',
  submitted: false,
  liveStats: {},
};

const mockPlayers = [
  ['1001','Josh Allen','QB','BUF','BAL',8200,24.8],['1002','Lamar Jackson','QB','BAL','BUF',8000,23.9],['1003','Jalen Hurts','QB','PHI','DAL',7800,22.7],['1004','Joe Burrow','QB','CIN','CLE',7400,21.8],
  ['2001','Bijan Robinson','RB','ATL','TB',8100,20.4],['2002','Saquon Barkley','RB','PHI','DAL',8500,22.1],['2003','Jahmyr Gibbs','RB','DET','GB',7600,19.6],['2004','Breece Hall','RB','NYJ','NE',6900,16.8],['2005','James Cook','RB','BUF','BAL',6400,15.9],
  ['3001','Ja\'Marr Chase','WR','CIN','CLE',8700,23.0],['3002','Justin Jefferson','WR','MIN','CHI',8500,21.9],['3003','Amon-Ra St. Brown','WR','DET','GB',7900,20.2],['3004','CeeDee Lamb','WR','DAL','PHI',7800,19.7],['3005','Nico Collins','WR','HOU','IND',7100,17.6],['3006','Drake London','WR','ATL','TB',6500,16.4],['3007','George Pickens','WR','DAL','PHI',5800,14.2],
  ['4001','Brock Bowers','TE','LV','LAC',6300,16.7],['4002','Trey McBride','TE','ARI','SF',6100,15.9],['4003','George Kittle','TE','SF','ARI',5700,14.7],['4004','Sam LaPorta','TE','DET','GB',5200,12.9],
  ['5001','Eagles','DST','PHI','DAL',3800,8.4],['5002','Bills','DST','BUF','BAL',3500,7.9],['5003','49ers','DST','SF','ARI',3400,7.6],['5004','Lions','DST','DET','GB',3200,7.1]
].map(([id,name,position,team,opp,salary,avg]) => ({id,name,position,team,opp,salary,avg,game:`${team} vs ${opp}`}));

function money(n){return '$'+Number(n||0).toLocaleString('en-US')}
function lineupPlayers(){return SLOT_ORDER.map(s=>state.lineup[s]).filter(Boolean)}
function salaryUsed(){return lineupPlayers().reduce((t,p)=>t+p.salary,0)}
function projected(){return lineupPlayers().reduce((t,p)=>t+(Number(p.avg)||0),0)}
function currentFantasyPoints(player){return Number(state.liveStats[player.id]?.fantasyPoints || 0)}

function save(){
  localStorage.setItem('weeklyNFLDraftMVP', JSON.stringify({players:state.players,lineup:state.lineup,submitted:state.submitted,liveStats:state.liveStats}));
}
function load(){
  try{
    const saved=JSON.parse(localStorage.getItem('weeklyNFLDraftMVP'));
    if(saved){state.players=saved.players?.length?saved.players:mockPlayers;state.lineup={...state.lineup,...saved.lineup};state.submitted=!!saved.submitted;state.liveStats=saved.liveStats||{};return}
  }catch(e){}
  state.players=mockPlayers;
}

function getEligibleSlots(player){
  if(player.position==='QB') return ['QB'];
  if(player.position==='RB') return ['RB1','RB2','FLEX'];
  if(player.position==='WR') return ['WR1','WR2','WR3','FLEX'];
  if(player.position==='TE') return ['TE','FLEX'];
  if(player.position==='DST') return ['DST'];
  return [];
}

function addPlayer(player){
  if(state.submitted){message('Lineup is submitted. Clear it to make changes.','danger');return}
  if(lineupPlayers().some(p=>p.id===player.id)) return;
  if(salaryUsed()+player.salary>SALARY_CAP){message('That player would take you over the $50,000 salary cap.','danger');return}
  const slot=getEligibleSlots(player).find(s=>!state.lineup[s]);
  if(!slot){message(`No available ${player.position === 'RB' || player.position === 'WR' || player.position === 'TE' ? player.position + '/FLEX' : player.position} slot.`,'danger');return}
  state.lineup[slot]=player;save();renderAll();
}
function removeSlot(slot){if(state.submitted)return;state.lineup[slot]=null;save();renderAll()}
function message(text,type=''){const el=document.getElementById('lineupMessage');el.textContent=text;el.className='lineup-message '+type}

function renderPlayers(){
  const body=document.getElementById('playerTableBody');
  const q=state.search.toLowerCase();
  const selectedIds=new Set(lineupPlayers().map(p=>p.id));
  const filtered=state.players.filter(p=>(state.activePosition==='ALL'||p.position===state.activePosition)&&(!q||`${p.name} ${p.team} ${p.opp}`.toLowerCase().includes(q)))
    .sort((a,b)=>b.salary-a.salary);
  body.innerHTML=filtered.map(p=>`<tr>
    <td><div class="player-main"><div class="player-avatar">${p.position}</div><div><div class="player-name">${escapeHtml(p.name)}</div><div class="player-meta">${p.position} · ${p.team}</div></div></div></td>
    <td><div class="matchup">${escapeHtml(p.game||`${p.team} vs ${p.opp||''}`)}</div></td>
    <td><div class="avg">${Number(p.avg||0).toFixed(1)}</div></td>
    <td><div class="salary">${money(p.salary)}</div></td>
    <td><button class="add-btn" data-add="${escapeAttr(p.id)}" ${selectedIds.has(p.id)||state.submitted?'disabled':''}>+</button></td>
  </tr>`).join('') || `<tr><td colspan="5" class="avg">No players match this filter.</td></tr>`;
}

function renderLineup(){
  const wrap=document.getElementById('lineupSlots');
  wrap.innerHTML=SLOT_ORDER.map(slot=>{
    const p=state.lineup[slot]; const label=slot.replace(/\d/g,'');
    return `<div class="lineup-slot"><div class="slot-label">${label}</div>${p?`<div class="slot-player"><strong>${escapeHtml(p.name)}</strong><span>${p.position} · ${p.team}</span></div><div><div class="slot-salary">${money(p.salary)}</div><button class="slot-remove" data-remove="${slot}" ${state.submitted?'disabled':''}>×</button></div>`:`<div class="slot-empty">Select a player</div><div></div>`}</div>`
  }).join('');
  const used=salaryUsed();document.getElementById('salaryUsed').textContent=money(used);document.getElementById('salaryRemaining').textContent=money(SALARY_CAP-used);document.getElementById('projectionTotal').textContent=projected().toFixed(1);
  document.getElementById('submitLineupBtn').textContent=state.submitted?'LINEUP SUBMITTED':'SUBMIT LINEUP';
  document.getElementById('submitLineupBtn').disabled=state.submitted;
}

function renderMyTeam(){
  const list=document.getElementById('myTeamList'); const players=lineupPlayers();
  list.innerHTML=players.length?SLOT_ORDER.filter(s=>state.lineup[s]).map(slot=>{const p=state.lineup[slot],stat=state.liveStats[p.id]||{};return `<div class="team-row"><strong class="slot-label">${slot.replace(/\d/g,'')}</strong><div><strong>${escapeHtml(p.name)}</strong><div class="player-meta">${p.team} · ${stat.summary||'Not started'}</div></div><div class="game-state ${stat.status==='LIVE'?'live':''}">${stat.status||'NS'}</div><div class="live-points">${currentFantasyPoints(p).toFixed(1)}</div></div>`}).join(''):`<div class="admin-note">No players selected yet.</div>`;
  const live=players.filter(p=>state.liveStats[p.id]?.status==='LIVE').length, final=players.filter(p=>state.liveStats[p.id]?.status==='FINAL').length;
  document.getElementById('myLiveScore').textContent=players.reduce((t,p)=>t+currentFantasyPoints(p),0).toFixed(1);document.getElementById('playersLive').textContent=live;document.getElementById('playersFinished').textContent=final;document.getElementById('teamSalaryUsed').textContent=money(salaryUsed());
}

function renderLeaderboard(){
  const myScore=lineupPlayers().reduce((t,p)=>t+currentFantasyPoints(p),0);
  const others=[{name:'Pete',score:Math.max(0,82.4+mockTick('pete')),active:4},{name:'Dave',score:Math.max(0,76.1+mockTick('dave')),active:3}];
  const rows=[{name:'Andy',score:myScore,active:lineupPlayers().filter(p=>state.liveStats[p.id]?.status==='LIVE').length,me:true},...others].sort((a,b)=>b.score-a.score);
  document.getElementById('leaderboard').innerHTML=rows.map((r,i)=>`<div class="leader-row"><div class="leader-rank">${i+1}</div><div class="leader-name"><strong>${r.name}${r.me?' · YOU':''}</strong><span>${r.active} players live</span></div><div class="leader-live">${r.active?'● LIVE':''}</div><div class="leader-score">${r.score.toFixed(1)}</div></div>`).join('');
}
function mockTick(k){return Number(localStorage.getItem('mock-'+k)||0)}

function renderAll(){renderPlayers();renderLineup();renderMyTeam();renderLeaderboard();document.getElementById('entryCount').textContent='3'}

function submitLineup(){
  if(lineupPlayers().length!==SLOT_ORDER.length){message(`Your lineup needs ${SLOT_ORDER.length-lineupPlayers().length} more player${SLOT_ORDER.length-lineupPlayers().length===1?'':'s'}.`,'danger');return}
  if(salaryUsed()>SALARY_CAP){message('Lineup is over the salary cap.','danger');return}
  state.submitted=true;save();message('Lineup submitted and locked for this MVP.','success');renderAll();
}
function clearLineup(){state.lineup=Object.fromEntries(SLOT_ORDER.map(s=>[s,null]));state.submitted=false;state.liveStats={};save();message('Lineup cleared.');renderAll()}

function simulateUpdate(){
  const players=lineupPlayers(); if(!players.length){document.getElementById('importStatus').textContent='Add players to your lineup before simulating live scoring.';return}
  players.forEach((p,i)=>{
    const current=state.liveStats[p.id]?.fantasyPoints||0;
    const gain=Math.round((Math.random()*5+0.5)*10)/10;
    state.liveStats[p.id]={fantasyPoints:Math.min(Number(p.avg||15)*1.35,current+gain),status:i%4===0&&current>12?'FINAL':'LIVE',summary:randomSummary(p)};
  });
  localStorage.setItem('mock-pete',String(mockTick('pete')+Math.random()*4));localStorage.setItem('mock-dave',String(mockTick('dave')+Math.random()*4));
  save();renderAll();
}
function randomSummary(p){
  if(p.position==='QB') return `${Math.floor(120+Math.random()*180)} pass yds · ${Math.floor(Math.random()*3)} TD`;
  if(p.position==='DST') return `${Math.floor(Math.random()*4)} sacks · ${Math.floor(Math.random()*3)} TO`;
  return `${Math.floor(25+Math.random()*90)} yds · ${Math.floor(Math.random()*7)} rec`;
}

function parseCSV(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(quoted&&n==='"'){field+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(field);field='';if(row.some(v=>v.trim()!==''))rows.push(row);row=[]}else field+=c}
  if(field||row.length){row.push(field);rows.push(row)} return rows;
}
function norm(s){return String(s||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'')}
function importDraftKingsCSV(text){
  const rows=parseCSV(text); if(rows.length<2) throw new Error('CSV does not contain player rows.');
  const headers=rows[0].map(norm); const find=(...names)=>{for(const n of names){const i=headers.indexOf(norm(n));if(i>=0)return i}return -1};
  const ix={pos:find('Position'),name:find('Name','Name + ID'),id:find('ID'),roster:find('Roster Position'),salary:find('Salary'),game:find('Game Info'),team:find('TeamAbbrev','Team'),avg:find('AvgPointsPerGame','Avg Points Per Game')};
  if(ix.name<0||ix.salary<0) throw new Error('Could not find DraftKings Name and Salary columns.');
  const imported=rows.slice(1).map((r,index)=>{
    let name=(r[ix.name]||'').trim(); let id=ix.id>=0?(r[ix.id]||'').trim():'';
    if(ix.id<0){const m=name.match(/\s*\((\d+)\)\s*$/);if(m){id=m[1];name=name.replace(/\s*\(\d+\)\s*$/,'')}}
    let position=ix.pos>=0?(r[ix.pos]||'').trim().toUpperCase():''; if(position==='D/ST')position='DST';
    const roster=ix.roster>=0?(r[ix.roster]||'').toUpperCase():''; if(!position&&roster.includes('DST'))position='DST';
    const salary=Number(String(r[ix.salary]||'').replace(/[^0-9.]/g,'')); const game=ix.game>=0?(r[ix.game]||'').trim():''; const team=ix.team>=0?(r[ix.team]||'').trim().toUpperCase():'';
    let opp='';const gm=game.match(/([A-Z]{2,3})@([A-Z]{2,3})/);if(gm)opp=gm[1]===team?gm[2]:gm[1];
    return {id:id||`csv-${index}-${name}`,name,position,team,opp,salary,avg:ix.avg>=0?Number(r[ix.avg])||0:0,game};
  }).filter(p=>p.name&&p.salary&&['QB','RB','WR','TE','DST'].includes(p.position));
  if(!imported.length) throw new Error('No supported NFL players were found in the CSV.');
  state.players=imported;state.lineup=Object.fromEntries(SLOT_ORDER.map(s=>[s,null]));state.submitted=false;state.liveStats={};save();renderAll();return imported.length;
}

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
function escapeAttr(v){return escapeHtml(v)}

function bind(){
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));document.getElementById('view-'+btn.dataset.view).classList.add('active-view')}));
  document.getElementById('positionTabs').addEventListener('click',e=>{const b=e.target.closest('[data-position]');if(!b)return;state.activePosition=b.dataset.position;document.querySelectorAll('.position-tab').forEach(x=>x.classList.toggle('active',x===b));renderPlayers()});
  document.getElementById('playerSearch').addEventListener('input',e=>{state.search=e.target.value;renderPlayers()});
  document.getElementById('playerTableBody').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(!b)return;const p=state.players.find(x=>String(x.id)===String(b.dataset.add));if(p)addPlayer(p)});
  document.getElementById('lineupSlots').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b)removeSlot(b.dataset.remove)});
  document.getElementById('submitLineupBtn').addEventListener('click',submitLineup);document.getElementById('clearLineupBtn').addEventListener('click',clearLineup);document.getElementById('simulateBtn').addEventListener('click',simulateUpdate);
  const input=document.getElementById('csvInput'),zone=document.getElementById('uploadZone'),status=document.getElementById('importStatus');
  document.getElementById('chooseCsvBtn').addEventListener('click',()=>input.click());input.addEventListener('change',()=>input.files[0]&&handleFile(input.files[0]));
  ['dragenter','dragover'].forEach(evt=>zone.addEventListener(evt,e=>{e.preventDefault();zone.classList.add('dragover')}));['dragleave','drop'].forEach(evt=>zone.addEventListener(evt,e=>{e.preventDefault();zone.classList.remove('dragover')}));zone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)handleFile(f)});
  function handleFile(file){const reader=new FileReader();reader.onload=()=>{try{const count=importDraftKingsCSV(reader.result);status.innerHTML=`<span class="success">Imported ${count} players from ${escapeHtml(file.name)}.</span>`}catch(err){status.innerHTML=`<span class="danger">${escapeHtml(err.message)}</span>`}};reader.readAsText(file)}
}

load();bind();renderAll();
