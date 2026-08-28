const SALARY_CAP=50000;
const SLOT_ORDER=['QB','RB1','RB2','WR1','WR2','WR3','TE','FLEX','DST'];
const SLEEPER_PLAYERS='https://api.sleeper.app/v1/players/nfl';
const SLEEPER_STATE='https://api.sleeper.app/v1/state/nfl';
const SUPABASE_URL='https://lafgqijdnuemykhscuqe.supabase.co';
const SUPABASE_KEY='sb_publishable_fUaOx71GRO944jHPRBt4tg_nRl4Nl-b';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.sessionStorage}});

const state={
  players:[],lineup:Object.fromEntries(SLOT_ORDER.map(s=>[s,null])),activePosition:'ALL',search:'',submitted:false,liveStats:{},
  nflState:null,user:null,profile:null,league:null,members:[],leagueLineups:[]
};
const FALLBACK_PLAYERS=(window.WEEK1_2026_PLAYERS||[]).map(p=>({...p,source:'fallback'}));

function money(n){return '$'+Number(n||0).toLocaleString('en-US')}
function lineupPlayers(){return SLOT_ORDER.map(s=>state.lineup[s]).filter(Boolean)}
function salaryUsed(){return lineupPlayers().reduce((t,p)=>t+p.salary,0)}
function projected(){return lineupPlayers().reduce((t,p)=>t+(Number(p.avg)||0),0)}
function currentFantasyPoints(player){return Number(state.liveStats[player.id]?.fantasyPoints||0)}
function seasonWeek(){return{season:Number(state.nflState?.season||2026),week:Number(state.nflState?.week||1)}}
function setText(id,text){const el=document.getElementById(id);if(el)el.textContent=text}
function showStatus(id,text,type=''){const el=document.getElementById(id);if(!el)return;el.textContent=text;el.className=(id==='authStatus'?'auth-status':'db-status')+(type?' '+type:'')}

function playerImageCandidates(player){
  if(player.position==='DST')return[];
  const urls=[];
  if(player.espnId)urls.push(`https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(player.espnId)}.png`);
  if(player.id)urls.push(`https://sleepercdn.com/content/nfl/players/${encodeURIComponent(player.id)}.jpg`);
  if(player.id)urls.push(`https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(player.id)}.jpg`);
  return urls;
}
function playerVisual(player,size='normal'){
  if(player.position==='DST')return `<div class="player-avatar ${size==='small'?'player-avatar-small':''}">DST</div>`;
  const urls=playerImageCandidates(player);
  if(!urls.length)return `<div class="player-avatar ${size==='small'?'player-avatar-small':''}">${escapeHtml(player.position)}</div>`;
  return `<div class="player-photo-wrap ${size==='small'?'player-photo-wrap-small':''}"><img class="player-photo" src="${escapeAttr(urls[0])}" data-image-sources="${escapeAttr(JSON.stringify(urls))}" data-image-index="0" alt="${escapeAttr(player.name)}" loading="lazy"><div class="player-avatar player-photo-fallback ${size==='small'?'player-avatar-small':''}">${escapeHtml(player.position)}</div></div>`;
}
function handleImageError(img){let sources=[];try{sources=JSON.parse(img.dataset.imageSources||'[]')}catch(e){}const next=Number(img.dataset.imageIndex||0)+1;if(next<sources.length){img.dataset.imageIndex=String(next);img.src=sources[next];return}img.style.display='none';const fallback=img.nextElementSibling;if(fallback)fallback.style.display='grid'}
function bindImageFallbacks(root=document){root.querySelectorAll('img.player-photo:not([data-error-bound])').forEach(img=>{img.dataset.errorBound='1';img.addEventListener('error',()=>handleImageError(img))})}

function round100(n){return Math.round(n/100)*100}
function generatedSalary(position,rank,total){const ranges={QB:[4000,8000],RB:[4000,9000],WR:[3500,9000],TE:[3000,7000],DST:[2500,4000]};const [min,max]=ranges[position];const pct=total<=1?1:1-rank/(total-1);const curve=Math.pow(Math.max(0,pct),.72);return Math.max(min,Math.min(max,round100(min+(max-min)*curve)))}
function generatedProjection(position,salary){const base={QB:8,RB:5,WR:4,TE:3,DST:4}[position]||3;const factor={QB:.0022,RB:.00215,WR:.0021,TE:.002,DST:.0014}[position]||.002;return Math.round((base+(salary-2500)*factor)*10)/10}
function sleeperName(p,position){if(position==='DST')return p.full_name||p.team||p.player_id;return p.full_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||p.player_id}
function sleeperRank(p){const r=Number(p.search_rank);return Number.isFinite(r)&&r>0?r:99999}
function buildSleeperPool(raw){
  const groups={QB:[],RB:[],WR:[],TE:[],DST:[]};
  Object.values(raw||{}).forEach(p=>{let pos=String(p.position||'').toUpperCase();if(pos==='DEF')pos='DST';if(!groups[pos]||!p.team)return;if(pos!=='DST'&&p.active===false)return;groups[pos].push(p)});
  const limits={QB:40,RB:90,WR:120,TE:60,DST:32},out=[];
  Object.entries(groups).forEach(([pos,items])=>{items.sort((a,b)=>sleeperRank(a)-sleeperRank(b)||String(a.last_name||'').localeCompare(String(b.last_name||'')));const chosen=items.slice(0,limits[pos]);chosen.forEach((p,i)=>{const salary=generatedSalary(pos,i,chosen.length);out.push({id:String(p.player_id),espnId:p.espn_id?String(p.espn_id):'',name:sleeperName(p,pos),position:pos,team:p.team,opp:'',salary,avg:generatedProjection(pos,salary),game:'Schedule TBC',source:'Sleeper',rank:i+1,status:p.injury_status||'',searchRank:sleeperRank(p)})})});
  return out;
}
async function syncSleeper(force=false){
  const status=document.getElementById('sleeperStatus');if(status)status.textContent='Refreshing free NFL player data from Sleeper…';
  try{const [playersRes,stateRes]=await Promise.all([fetch(SLEEPER_PLAYERS,{cache:force?'reload':'default'}),fetch(SLEEPER_STATE,{cache:'no-store'})]);if(!playersRes.ok)throw new Error(`Sleeper player request failed (${playersRes.status})`);const raw=await playersRes.json();const nflState=stateRes.ok?await stateRes.json():null;const pool=buildSleeperPool(raw);if(pool.length<100)throw new Error('Sleeper returned an unexpectedly small player pool.');state.players=pool;state.nflState=nflState;renderAll();updateWeekLabels();if(status)status.innerHTML=`<span class="success">Loaded ${pool.length} NFL players from Sleeper.</span>`}
  catch(err){state.players=FALLBACK_PLAYERS;renderAll();if(status)status.innerHTML=`<span class="danger">Sleeper refresh failed: ${escapeHtml(err.message)}. Using fallback data.</span>`}
}
function updateWeekLabels(){const {season,week}=seasonWeek();document.querySelectorAll('[data-week-label]').forEach(e=>e.textContent=`WEEK ${week}`);setText('heroWeek',`WEEK ${week} · ${season}`)}

async function signUp(){
  const display=document.getElementById('displayNameInput').value.trim(),email=document.getElementById('emailInput').value.trim(),password=document.getElementById('passwordInput').value;
  if(!display||!email||password.length<6){showStatus('authStatus','Enter a display name, valid email and password of at least 6 characters.','danger');return}
  showStatus('authStatus','Creating account…');
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:display}}});
  if(error){showStatus('authStatus',error.message,'danger');return}
  if(data.session){await onSignedIn(data.user);showStatus('authStatus','Account created.','success')}
  else showStatus('authStatus','Account created. Check your email to confirm it, then return here and sign in.','success');
}
async function signIn(){
  const email=document.getElementById('emailInput').value.trim(),password=document.getElementById('passwordInput').value;
  showStatus('authStatus','Signing in…');
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){showStatus('authStatus',error.message,'danger');return}
  await onSignedIn(data.user);
}
async function signOut(){await sb.auth.signOut();state.user=null;state.profile=null;state.league=null;state.members=[];state.lineup=Object.fromEntries(SLOT_ORDER.map(s=>[s,null]));state.submitted=false;document.getElementById('authScreen').classList.remove('hidden');document.getElementById('appShell').classList.add('auth-locked')}

async function onSignedIn(user){
  state.user=user;document.getElementById('authScreen').classList.add('hidden');document.getElementById('appShell').classList.remove('auth-locked');
  const {data:profile}=await sb.from('profiles').select('id,display_name').eq('id',user.id).single();state.profile=profile||{id:user.id,display_name:user.email?.split('@')[0]||'Player'};
  setText('userChip',state.profile.display_name);setText('lineupOwnerName',state.profile.display_name);
  await loadAccessibleLeague();renderAll();
}
async function loadAccessibleLeague(preferredId=null){
  const {data,error}=await sb.from('leagues').select('id,name,owner_id,invite_code,created_at').order('created_at',{ascending:true});
  if(error){showStatus('leagueStatus',error.message,'danger');return}
  const leagues=data||[];state.league=preferredId?leagues.find(l=>l.id===preferredId)||leagues[0]||null:leagues[0]||null;
  document.getElementById('leagueSetup').classList.toggle('hidden',!!state.league);
  if(!state.league){state.members=[];state.leagueLineups=[];state.lineup=Object.fromEntries(SLOT_ORDER.map(s=>[s,null]));state.submitted=false;updateLeagueUI();renderAll();return}
  await Promise.all([loadMembers(),loadCurrentLineup(),loadLeagueLineups()]);updateLeagueUI();renderAll();
}
function makeInviteCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:7},()=>chars[Math.floor(Math.random()*chars.length)]).join('')}
async function createLeague(){
  const name=document.getElementById('newLeagueName').value.trim();if(!name){showStatus('leagueStatus','Enter a league name.','danger');return}
  showStatus('leagueStatus','Creating league…');
  let created=null,error=null;
  for(let i=0;i<3&&!created;i++){
    const result=await sb.from('leagues').insert({name,owner_id:state.user.id,invite_code:makeInviteCode()}).select().single();created=result.data;error=result.error;if(error?.code!=='23505')break;
  }
  if(error||!created){showStatus('leagueStatus',error?.message||'Could not create league.','danger');return}
  const memberResult=await sb.from('league_members').insert({league_id:created.id,user_id:state.user.id});
  if(memberResult.error){showStatus('leagueStatus',memberResult.error.message,'danger');return}
  await loadAccessibleLeague(created.id);showStatus('leagueStatus','League created. Share the invite code with your friends.','success');
}
async function joinLeague(codeInputId='joinLeagueCode',statusId='leagueStatus'){
  const code=document.getElementById(codeInputId).value.trim();if(!code){showStatus(statusId,'Enter an invite code.','danger');return}
  showStatus(statusId,'Joining league…');const {data,error}=await sb.rpc('join_league_by_code',{code});if(error){showStatus(statusId,error.message,'danger');return}await loadAccessibleLeague(data);showStatus(statusId,'League joined.','success');
}
async function loadMembers(){
  if(!state.league)return;const {data,error}=await sb.from('league_members').select('user_id,joined_at').eq('league_id',state.league.id);if(error){state.members=[];return}const ids=(data||[]).map(x=>x.user_id);let profiles=[];if(ids.length){const r=await sb.from('profiles').select('id,display_name').in('id',ids);profiles=r.data||[]}
  state.members=(data||[]).map(m=>({user_id:m.user_id,joined_at:m.joined_at,display_name:profiles.find(p=>p.id===m.user_id)?.display_name||'Player'}));
}
async function loadCurrentLineup(){
  if(!state.league||!state.user)return;const {season,week}=seasonWeek();const {data,error}=await sb.from('weekly_lineups').select('lineup,submitted').eq('league_id',state.league.id).eq('user_id',state.user.id).eq('season',season).eq('week',week).maybeSingle();
  if(error){showStatus('dbStatus',error.message,'danger');return}
  state.lineup=Object.fromEntries(SLOT_ORDER.map(s=>[s,null]));if(data?.lineup&&typeof data.lineup==='object')state.lineup={...state.lineup,...data.lineup};state.submitted=!!data?.submitted;
}
async function saveLineup(){
  if(!state.user||!state.league)return;const {season,week}=seasonWeek();const payload={league_id:state.league.id,user_id:state.user.id,season,week,lineup:state.lineup,salary_used:salaryUsed(),projected:projected(),submitted:state.submitted,submitted_at:state.submitted?new Date().toISOString():null,updated_at:new Date().toISOString()};
  const {error}=await sb.from('weekly_lineups').upsert(payload,{onConflict:'league_id,user_id,season,week'});if(error)showStatus('dbStatus',error.message,'danger');else showStatus('dbStatus','Saved to shared database.','success');await loadLeagueLineups();renderLeaderboard();
}
async function loadLeagueLineups(){if(!state.league)return;const {season,week}=seasonWeek();const {data}=await sb.from('weekly_lineups').select('user_id,projected,submitted,salary_used').eq('league_id',state.league.id).eq('season',season).eq('week',week);state.leagueLineups=data||[]}
function updateLeagueUI(){
  const has=!!state.league;setText('leagueHeroName',has?state.league.name:'Weekly NFL Draft');setText('leagueNameTitle',has?state.league.name:'No league selected');
  const current=document.getElementById('currentLeagueInfo'),info=document.getElementById('leagueInviteInfo');if(has){current.innerHTML=`Invite code: <span class="invite-code">${escapeHtml(state.league.invite_code)}</span>`;info.innerHTML=`Share this invite code with friends: <span class="invite-code">${escapeHtml(state.league.invite_code)}</span>`}else{current.textContent='Create or join a league to begin.';info.textContent='Create or join a league to begin.'}
  const list=document.getElementById('leagueMembers');list.innerHTML=state.members.map(m=>`<div class="league-member"><strong>${escapeHtml(m.display_name)}${m.user_id===state.user?.id?' · YOU':''}</strong><span>${m.user_id===state.league?.owner_id?'Owner':'Member'}</span></div>`).join('');setText('entryCount',String(state.members.length));
}

function getEligibleSlots(p){if(p.position==='QB')return['QB'];if(p.position==='RB')return['RB1','RB2','FLEX'];if(p.position==='WR')return['WR1','WR2','WR3','FLEX'];if(p.position==='TE')return['TE','FLEX'];if(p.position==='DST')return['DST'];return[]}
async function addPlayer(p){if(!state.league){message('Create or join a league first.','danger');return}if(state.submitted){message('Lineup is submitted. Clear it to make changes.','danger');return}if(lineupPlayers().some(x=>x.id===p.id))return;if(salaryUsed()+p.salary>SALARY_CAP){message('That player would take you over the $50,000 salary cap.','danger');return}const slot=getEligibleSlots(p).find(s=>!state.lineup[s]);if(!slot){message('No eligible lineup slot is available for that player.','danger');return}state.lineup[slot]=p;renderAll();await saveLineup()}
async function removeSlot(slot){if(state.submitted)return;state.lineup[slot]=null;renderAll();await saveLineup()}
function message(text,type=''){const el=document.getElementById('lineupMessage');if(!el)return;el.textContent=text;el.className='lineup-message '+type}
function renderPlayers(){const body=document.getElementById('playerTableBody');if(!body)return;const q=state.search.toLowerCase(),selected=new Set(lineupPlayers().map(p=>p.id));const filtered=state.players.filter(p=>(state.activePosition==='ALL'||p.position===state.activePosition)&&(!q||`${p.name} ${p.team}`.toLowerCase().includes(q))).sort((a,b)=>b.salary-a.salary||a.name.localeCompare(b.name));body.innerHTML=filtered.map(p=>`<tr><td><div class="player-main">${playerVisual(p)}<div><div class="player-name">${escapeHtml(p.name)}</div><div class="player-meta">${p.position} · ${p.team}${p.status?' · '+escapeHtml(p.status):''}</div></div></div></td><td><div class="matchup">${escapeHtml(p.game||'Schedule TBC')}</div></td><td><div class="avg">${Number(p.avg||0).toFixed(1)}</div></td><td><div class="salary">${money(p.salary)}</div></td><td><button class="add-btn" data-add="${escapeAttr(p.id)}" ${selected.has(p.id)||state.submitted||!state.league?'disabled':''}>+</button></td></tr>`).join('')||'<tr><td colspan="5" class="avg">No players match this filter.</td></tr>';bindImageFallbacks(body)}
function renderLineup(){const wrap=document.getElementById('lineupSlots');if(!wrap)return;wrap.innerHTML=SLOT_ORDER.map(slot=>{const p=state.lineup[slot],label=slot.replace(/\d/g,'');return `<div class="lineup-slot"><div class="slot-label">${label}</div>${p?`<div class="slot-player-with-photo">${playerVisual(p,'small')}<div class="slot-player"><strong>${escapeHtml(p.name)}</strong><span>${p.position} · ${p.team}</span></div></div><div><div class="slot-salary">${money(p.salary)}</div><button class="slot-remove" data-remove="${slot}" ${state.submitted?'disabled':''}>×</button></div>`:'<div class="slot-empty">Select a player</div><div></div>'}</div>`}).join('');bindImageFallbacks(wrap);const used=salaryUsed();setText('salaryUsed',money(used));setText('salaryRemaining',money(SALARY_CAP-used));setText('projectionTotal',projected().toFixed(1));const b=document.getElementById('submitLineupBtn');b.textContent=state.submitted?'LINEUP SUBMITTED':'SUBMIT LINEUP';b.disabled=state.submitted||!state.league}
function renderMyTeam(){const list=document.getElementById('myTeamList'),players=lineupPlayers();list.innerHTML=players.length?SLOT_ORDER.filter(s=>state.lineup[s]).map(slot=>{const p=state.lineup[slot],stat=state.liveStats[p.id]||{};return `<div class="team-row"><strong class="slot-label">${slot.replace(/\d/g,'')}</strong><div class="team-player-with-photo">${playerVisual(p,'small')}<div><strong>${escapeHtml(p.name)}</strong><div class="player-meta">${p.team} · ${stat.summary||'Not started'}</div></div></div><div class="game-state ${stat.status==='LIVE'?'live':''}">${stat.status||'NS'}</div><div class="live-points">${currentFantasyPoints(p).toFixed(1)}</div></div>`}).join(''):'<div class="admin-note">No players selected yet.</div>';bindImageFallbacks(list);setText('myLiveScore',players.reduce((t,p)=>t+currentFantasyPoints(p),0).toFixed(1));setText('playersLive',String(players.filter(p=>state.liveStats[p.id]?.status==='LIVE').length));setText('playersFinished',String(players.filter(p=>state.liveStats[p.id]?.status==='FINAL').length));setText('teamSalaryUsed',money(salaryUsed()))}
function renderLeaderboard(){const rows=state.members.map(m=>{const l=state.leagueLineups.find(x=>x.user_id===m.user_id);return{name:m.display_name,score:Number(l?.projected||0),submitted:!!l?.submitted,me:m.user_id===state.user?.id}}).sort((a,b)=>b.score-a.score);document.getElementById('leaderboard').innerHTML=rows.length?rows.map((r,i)=>`<div class="leader-row"><div class="leader-rank">${i+1}</div><div class="leader-name"><strong>${escapeHtml(r.name)}${r.me?' · YOU':''}</strong><span>${r.submitted?'Lineup submitted':'Building lineup'}</span></div><div class="leader-live">${r.submitted?'LOCKED':''}</div><div class="leader-score">${r.score.toFixed(1)}</div></div>`).join(''):'<div class="panel-note">No league members yet.</div>'}
function renderAll(){renderPlayers();renderLineup();renderMyTeam();renderLeaderboard();updateLeagueUI()}
async function submitLineup(){if(lineupPlayers().length!==SLOT_ORDER.length){message(`Your lineup needs ${SLOT_ORDER.length-lineupPlayers().length} more players.`,'danger');return}if(salaryUsed()>SALARY_CAP){message('Lineup is over the salary cap.','danger');return}state.submitted=true;renderAll();await saveLineup();message('Lineup submitted and saved to the league.','success')}
async function clearLineup(){state.lineup=Object.fromEntries(SLOT_ORDER.map(s=>[s,null]));state.submitted=false;state.liveStats={};renderAll();await saveLineup();message('Lineup cleared.','success')}
function simulateUpdate(){const players=lineupPlayers();if(!players.length)return;players.forEach((p,i)=>{const current=state.liveStats[p.id]?.fantasyPoints||0,gain=Math.round((Math.random()*5+.5)*10)/10;state.liveStats[p.id]={fantasyPoints:Math.min(Number(p.avg||15)*1.35,current+gain),status:i%4===0&&current>12?'FINAL':'LIVE',summary:randomSummary(p)}});renderAll()}
function randomSummary(p){if(p.position==='QB')return`${Math.floor(120+Math.random()*180)} pass yds · ${Math.floor(Math.random()*3)} TD`;if(p.position==='DST')return`${Math.floor(Math.random()*4)} sacks · ${Math.floor(Math.random()*3)} TO`;return`${Math.floor(25+Math.random()*90)} yds · ${Math.floor(Math.random()*7)} rec`}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
function escapeAttr(v){return escapeHtml(v)}

function bind(){
  document.getElementById('loginBtn').addEventListener('click',signIn);document.getElementById('signupBtn').addEventListener('click',signUp);document.getElementById('logoutBtn').addEventListener('click',signOut);
  document.getElementById('createLeagueBtn').addEventListener('click',createLeague);document.getElementById('joinLeagueBtn').addEventListener('click',()=>joinLeague());document.getElementById('joinLeagueSecondaryBtn').addEventListener('click',()=>joinLeague('leagueJoinCodeSecondary','leagueManageStatus'));
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));document.getElementById('view-'+btn.dataset.view).classList.add('active-view')}));
  document.getElementById('positionTabs').addEventListener('click',e=>{const b=e.target.closest('[data-position]');if(!b)return;state.activePosition=b.dataset.position;document.querySelectorAll('.position-tab').forEach(x=>x.classList.toggle('active',x===b));renderPlayers()});document.getElementById('playerSearch').addEventListener('input',e=>{state.search=e.target.value;renderPlayers()});document.getElementById('playerTableBody').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(!b)return;const p=state.players.find(x=>String(x.id)===String(b.dataset.add));if(p)addPlayer(p)});document.getElementById('lineupSlots').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b)removeSlot(b.dataset.remove)});document.getElementById('submitLineupBtn').addEventListener('click',submitLineup);document.getElementById('clearLineupBtn').addEventListener('click',clearLineup);document.getElementById('simulateBtn').addEventListener('click',simulateUpdate);document.getElementById('syncSleeperBtn').addEventListener('click',()=>syncSleeper(true));
}
async function init(){bind();state.players=FALLBACK_PLAYERS;renderAll();await syncSleeper(false);const {data:{user}}=await sb.auth.getUser();if(user)await onSignedIn(user);sb.auth.onAuthStateChange(async(event,session)=>{if(event==='SIGNED_IN'&&session?.user&&state.user?.id!==session.user.id)await onSignedIn(session.user);if(event==='SIGNED_OUT')await signOut()})}
init();
