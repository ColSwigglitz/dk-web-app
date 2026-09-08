// Loaded before app initialization completes. All competitor totals come from the server.
let statsBusy=false;
// Keep the selected contest fixed for this page session, even when Admin refreshes players.
const originalSeasonWeek=seasonWeek;
let selectedContest=null;
seasonWeek=function(){
  if(!selectedContest && state.nflState)selectedContest=originalSeasonWeek();
  return selectedContest||originalSeasonWeek();
};
function weekLocked(){return !state.statsSnapshot?.schedule_verified || !state.statsSnapshot.lock_at || Date.now()>=Date.parse(state.statsSnapshot.lock_at)}
function sundayTeam(team){return !!state.statsSnapshot?.games?.some(g=>g.home===team||g.away===team)}
async function refreshLiveStats(){
  if(statsBusy||!state.user||!state.league)return;
  statsBusy=true;
  const userId=state.user.id,leagueId=state.league.id,{season,week}=seasonWeek();
  try {
    const result=await sb.functions.invoke('nfl-stats',{body:{season,week,league_id:leagueId}});
    const {data,error}=await sb.from('nfl_week_stats').select('*').eq('season',season).eq('week',week).maybeSingle();
    if(state.user?.id!==userId||state.league?.id!==leagueId)return;
    if(error)throw error;
    if(data){
      state.statsSnapshot=data;
      for(const player of state.players){const game=data.games.find(g=>g.home===player.team||g.away===player.team);player.game=game?`${game.away} at ${game.home} · ${game.date}`:'Bye / schedule unavailable'}
      state.liveStats=Object.fromEntries(Object.entries(data.points).map(([id,p])=>[id,{...p,status:'STATS',summary:'Sunday stats received'}]));
      for(const player of lineupPlayers()){
        const game=data.games.find(g=>g.home===player.team||g.away===player.team);
        if(!game){state.liveStats[player.id]={fantasyPoints:0,status:'IGNORED',summary:'Not a Sunday game'};continue}
        const stat=state.liveStats[player.id];
        if(stat){stat.status=game?.status==='complete'?'FINAL':game?.status==='in_progress'?'LIVE':'STATS';stat.summary=player.position==='DST'?`${Number(stat.stats.sack||0)} sacks · ${Number(stat.stats.int||0)+Number(stat.stats.fum_rec||0)} takeaways`:`${Number(stat.stats.pass_yd||0)} pass · ${Number(stat.stats.rush_yd||0)} rush · ${Number(stat.stats.rec_yd||0)} receiving yards`}
      }
      const stale=!!result.error||Date.now()-Date.parse(data.fetched_at)>180000;
      setText('statsStatus',`${stale?'Feed delayed · last successful update':'Updated'} ${new Date(data.fetched_at).toLocaleString()} · ${data.week_complete?'All Sunday games final — rosters revealed':'Other rosters stay private until every Sunday game is final'}`);
      setText('contestStatus',data.week_complete?'FINAL':weekLocked()?'LOCKED':'OPEN');
      setText('lockNotice',`Sunday-only contest · roster deadline: ${new Date(data.lock_at).toLocaleString()} (00:00 UTC on Sunday). Thursday, Friday, Saturday and Monday games are ignored.`);
    }else{
      state.statsSnapshot=null;state.liveStats={};setText('statsStatus','Stats unavailable. Rosters remain private. Retry shortly.');
    }
    await loadLeagueLineups();renderAll();
  }catch(error){setText('statsStatus','Refresh failed; keeping last successful scores. '+error.message)}
  finally{statsBusy=false}
}
loadLeagueLineups=async function(){
  if(!state.league)return;
  const leagueId=state.league.id,userId=state.user?.id,{season,week}=seasonWeek();
  const {data,error}=await sb.rpc('nfl_leaderboard',{p_league:leagueId,p_season:season,p_week:week});
  if(state.league?.id!==leagueId||state.user?.id!==userId)return;
  if(error){state.leagueLineups=[];setText('statsStatus','Leaderboard unavailable: '+error.message);return}
  state.leagueLineups=data||[];
};
renderLeaderboard=function(){
  const rows=[...state.leagueLineups].sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity)||a.display_name.localeCompare(b.display_name));
  document.getElementById('leaderboard').innerHTML=rows.length?rows.map((r,i)=>`<div class="leader-row"><div class="leader-rank">${i+1}</div><div class="leader-name"><strong>${escapeHtml(r.display_name)}${r.user_id===state.user?.id?' · YOU':''}</strong><span>${r.sunday_selected_count===9?'Sunday roster complete':`${r.sunday_selected_count}/9 Sunday players`}${r.excluded_count?' · Non-Sunday picks ignored':''}${r.unmapped_count?' · Player mapping needed':''}</span></div><div class="leader-live">${r.week_complete?'FINAL':'PRIVATE'}</div><div class="leader-score">${r.score==null?'—':Number(r.score).toFixed(2)}</div></div>${r.week_complete&&r.lineup?`<details class="panel-note"><summary>${escapeHtml(r.display_name)} — roster and scoring breakdown</summary>${SLOT_ORDER.filter(slot=>r.lineup[slot]).map(slot=>{const p=r.lineup[slot],eligible=sundayTeam(p.team),stat=eligible?state.statsSnapshot?.points[p.id]:null;return `<p>${escapeHtml(slot)} · ${escapeHtml(p.name)} · ${eligible&&stat?Number(stat.fantasyPoints).toFixed(2):'0.00'} pts${eligible?'':' · ignored (not Sunday)'}</p>${eligible?`<small>${escapeHtml(JSON.stringify(stat?.stats||{}))}</small>`:''}`}).join('')}</details>`:''}`).join(''):'<div class="panel-note">No scores available yet.</div>';
};
const originalSaveLineup=saveLineup;
saveLineup=async function(){
  if(weekLocked()){message('This week is locked or the schedule is unavailable.','danger');await loadCurrentLineup();renderAll();return}
  return await originalSaveLineup();
};
const originalLiveRender=renderAll;
renderAll=function(){
  originalLiveRender();
  document.querySelectorAll('#playerTableBody tr').forEach(row=>{const button=row.querySelector('[data-add]');if(button){const player=state.players.find(p=>String(p.id)===String(button.dataset.add));if(player&&!sundayTeam(player.team))row.remove()}});
  document.querySelectorAll('#lineupSlots [data-remove]').forEach(button=>{const player=state.lineup[button.dataset.remove];if(player&&!sundayTeam(player.team))button.closest('.lineup-slot')?.classList.add('non-sunday-pick')});
  if(!state.statsSnapshot){setText('myLiveScore','—');document.querySelectorAll('#myTeamList .live-points').forEach(el=>el.textContent='—')}
  if(weekLocked())document.querySelectorAll('[data-add],[data-remove],#submitLineupBtn,#clearLineupBtn').forEach(b=>b.disabled=true);
  else document.getElementById('clearLineupBtn').disabled=false;
};
const originalAddPlayer=addPlayer;
addPlayer=async function(player){if(!sundayTeam(player.team)){message('Only players in Sunday games are eligible.','danger');return}await originalAddPlayer(player)};
const originalLiveSignIn=onSignedIn;
onSignedIn=async function(user){await originalLiveSignIn(user);await refreshLiveStats()};
const originalLiveLeagueLoad=loadAccessibleLeague;
loadAccessibleLeague=async function(preferredId){
  state.statsSnapshot=null;state.liveStats={};state.leagueLineups=[];
  await originalLiveLeagueLoad(preferredId);await refreshLiveStats();
};
document.getElementById('refreshStatsBtn').addEventListener('click',refreshLiveStats);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLiveStats()});
setInterval(()=>{if(!document.hidden)refreshLiveStats()},60000);

