import {normalizeStats, inspectSchedule, RULES_VERSION} from './scoring.mjs';

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json','Cache-Control':'no-store'};
const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function jsonFetch(target: string, options: RequestInit = {}) {
  const response = await fetch(target, {...options, signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error(`Upstream request failed (${response.status})`);
  return response.json();
}
async function db(path:string, options:RequestInit={}) {
  return jsonFetch(url+'/rest/v1/'+path, {...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers}});
}
Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return new Response('{}',{status:405,headers:cors});
  // Custom authentication: validate the bearer token with Supabase Auth on every request.
  const authorization=req.headers.get('Authorization')||'';
  let user;
  try { user=await jsonFetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization}}); }
  catch { return new Response(JSON.stringify({error:'Sign in to refresh scores.'}),{status:401,headers:cors}); }
  try {
    const {season,week,league_id}=await req.json();
    if(!Number.isInteger(season)||season<2021||season>new Date().getUTCFullYear()+1||!Number.isInteger(week)||week<1||week>18||typeof league_id!=='string'||!/^[\da-f-]{36}$/i.test(league_id)) throw new Error('Invalid regular-season week');
    const members=await db(`league_members?league_id=eq.${league_id}&user_id=eq.${user.id}&select=user_id`);
    if(!members.length) return new Response(JSON.stringify({error:'League membership required.'}),{status:403,headers:cors});
    const old=(await db(`nfl_week_stats?season=eq.${season}&week=eq.${week}`))[0];
    if(old && Date.now()-Date.parse(old.fetched_at)<60000) return new Response(JSON.stringify({cached:true,fetched_at:old.fetched_at}),{headers:cors});
    const [raw,schedule]=await Promise.all([
      jsonFetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`),
      jsonFetch(`https://api.sleeper.com/schedule/nfl/regular/${season}`)
    ]);
    const check=inspectSchedule(schedule,week,old?.games||[]);
    if(!check.verified) throw new Error('Schedule incomplete or changed; keeping previous scores and rosters private.');
    const points=normalizeStats(raw);
    if(check.complete && check.games.some(g=>[g.home,g.away].some(team=>!Object.hasOwn(raw[team]||{},'pts_allow')))) throw new Error('Final Sunday team stats incomplete; retaining previous scores');
    // Empty stats are normal before games, but must never erase an existing scoring snapshot.
    if(!Object.keys(points).length && (Object.keys(old?.points||{}).length || check.games.some(g=>g.status==='complete'))) throw new Error('Stats temporarily unavailable');
    if(old && Object.keys(old.points||{}).some(id=>!Object.hasOwn(points,id))) throw new Error('Incomplete stats response; retaining previous scores');
    const snapshot={season,week,points,games:check.games,schedule_verified:true,week_complete:check.complete,
      lock_at:check.lockAt,fetched_at:new Date().toISOString(),rules_version:RULES_VERSION};
    await db('nfl_week_stats?on_conflict=season,week',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(snapshot)});
    return new Response(JSON.stringify({fetched_at:snapshot.fetched_at,week_complete:check.complete}),{headers:cors});
  } catch(error) {
    return new Response(JSON.stringify({error:String(error.message||error)}),{status:503,headers:cors});
  }
});

