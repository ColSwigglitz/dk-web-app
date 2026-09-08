import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../draftkings-week1-2026-151307.js', import.meta.url), 'utf8'), sandbox);
const slate = sandbox.window.DK_NFL_SLATE;

test('official Week 1 DraftKings Sunday Classic salary snapshot', () => {
  assert.equal(slate.season, 2026);
  assert.equal(slate.week, 1);
  assert.equal(slate.draftGroupId, 151307);
  assert.equal(slate.players.length, 744);
  assert.equal(slate.players.filter((player) => player.position === 'DST').length, 24);
  assert.equal(slate.players.find((player) => player.name === 'Jahmyr Gibbs')?.salary, 8000);
  assert.equal(slate.players.find((player) => player.name === "Ja'Marr Chase")?.salary, 7800);
  assert.equal(slate.players.find((player) => player.name === 'Josh Allen')?.salary, 7000);
  assert.ok(slate.players.every((player) => /@/.test(player.game)));
  assert.ok(slate.players.every((player) => /2026-09-13/.test(player.startTime)));
});
