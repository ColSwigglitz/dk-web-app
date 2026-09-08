import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fantasyPoints,normalizeStats,inspectSchedule} from '../supabase/functions/nfl-stats/scoring.mjs';
const prior=JSON.parse(fs.readFileSync(new URL('../verification/schedule-sleeper.json',import.meta.url)));
const current=JSON.parse(fs.readFileSync(new URL('../verification/schedule-2026.json',import.meta.url)));
test('full PPR, bonuses, turnovers and conversions',()=>{
  assert.equal(fantasyPoints({pass_yd:300,pass_td:2,pass_int:1,rush_yd:100,rush_td:1,rec:4,rec_yd:100,rec_td:1,fum_lost:1,pass_2pt:1}),65);
  assert.equal(fantasyPoints({pass_yd:394,pass_td:2,rush_yd:30,rush_td:2}),41.76);
  assert.equal(fantasyPoints({rush_yd:-12,fum_lost:1}),-2.2);
});
test('DST does not count offensive TD field; shutout only with explicit points allowed',()=>{
  assert.equal(fantasyPoints({sack:2,fum_rec:1,pts_allow:40,td:5},true),0);
  assert.equal(fantasyPoints({},true),0);
  assert.equal(fantasyPoints({pts_allow:0,def_td:1,blk_kick:1},true),18);
});
test('input validation and empty pregame stats',()=>{
  assert.deepEqual(normalizeStats({}),{});
  assert.throws(()=>normalizeStats([]));
  assert.throws(()=>normalizeStats({'1':{pass_yd:'300'}}));
});
test('verified historical final week reveals; current week stays private',()=>{
  const historical=inspectSchedule(prior,1),upcoming=inspectSchedule(current,1);
  assert.equal(historical.complete,true);
  assert.equal(historical.games.length,13);
  assert.equal(historical.games.every(g=>new Date(g.date+'T12:00:00Z').getUTCDay()===0),true);
  assert.equal(upcoming.verified,true);
  assert.equal(upcoming.complete,false);
  assert.equal(upcoming.games.length,13);
  assert.equal(upcoming.lockAt,'2026-09-13T00:00:00Z');
});
test('last game, postponed game, unknown state, missing games and truncated feed fail closed',()=>{
  for(const status of ['in_progress','postponed','unknown','pre_game']){
    const s=structuredClone(prior);s.find(g=>g.week===1).status=status;
    assert.equal(inspectSchedule(s,1).complete,false);
  }
  assert.equal(inspectSchedule([],1).complete,false);
  assert.equal(inspectSchedule(prior.slice(1),1).complete,false);
  assert.equal(inspectSchedule(prior,1,[{game_id:'missing',date:'2025-09-07'}]).complete,false);
});
test('cancelled placeholder does not prevent a valid complete 272-game schedule',()=>{
  const s=structuredClone(current);s.forEach(g=>{if(g.status!=='canceled')g.status='complete'});
  assert.equal(inspectSchedule(s,6).complete,true);
});
test('Thursday, Friday, Saturday and Monday games do not affect reveal',()=>{
  const s=structuredClone(prior);
  s.filter(g=>g.week===1&&new Date(g.date+'T12:00:00Z').getUTCDay()!==0).forEach(g=>g.status='pre_game');
  assert.equal(inspectSchedule(s,1).complete,true);
});

