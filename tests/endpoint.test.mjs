import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
let handler;
globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?'https://db.test':'server-secret'},serve:fn=>{handler=fn}};
const source=fs.readFileSync(new URL('../supabase/functions/nfl-stats/index.ts',import.meta.url),'utf8')
  .replace("'./scoring.mjs'",JSON.stringify(new URL('../supabase/functions/nfl-stats/scoring.mjs',import.meta.url).href));
await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const schedule=JSON.parse(fs.readFileSync(new URL('../verification/schedule-2026.json',import.meta.url)));
const request=()=>new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer user-token'},body:JSON.stringify({season:2026,week:1,league_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'})});
test('authenticated integration, caching, failure retention and membership enforcement',async()=>{
  let saved,stats={},old=[],member=true,auth=true;
  globalThis.fetch=async(target,options={})=>{
    let data;
    if(target.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'user-1'}),{status:auth?200:401});
    if(target.includes('league_members?'))data=member?[{user_id:'user-1'}]:[];
    else if(target.includes('nfl_week_stats?on_conflict')){saved=JSON.parse(options.body);data=[saved]}
    else if(target.includes('nfl_week_stats?'))data=old;
    else if(target.includes('/stats/nfl/'))data=stats;
    else if(target.includes('/schedule/nfl/'))data=schedule;
    else throw new Error('Unexpected URL '+target);
    return new Response(JSON.stringify(data),{status:200});
  };
  assert.equal((await handler(request())).status,200);
  assert.equal(saved.week_complete,false);
  assert.deepEqual(saved.points,{});
  stats={'4984':{pass_yd:394,pass_td:2,rush_yd:30,rush_td:2}};saved=null;
  assert.equal((await handler(request())).status,200);
  assert.equal(saved.points['4984'].fantasyPoints,41.76);
  old=[saved];saved=null;
  assert.equal((await (await handler(request())).json()).cached,true);
  assert.equal(saved,null);
  old[0].fetched_at='2026-01-01T00:00:00Z';stats={};
  assert.equal((await handler(request())).status,503);
  assert.equal(saved,null);
  member=false;
  assert.equal((await handler(request())).status,403);
  auth=false;
  assert.equal((await handler(request())).status,401);
});

