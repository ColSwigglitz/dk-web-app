import fs from 'node:fs';
import vm from 'node:vm';

const [slatePath, sleeperPath] = process.argv.slice(2);
if (!slatePath || !sleeperPath) throw new Error('Pass the generated slate and Sleeper player JSON paths.');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(slatePath, 'utf8'), sandbox);
const slate = sandbox.window.DK_NFL_SLATE;
const sleeper = JSON.parse(fs.readFileSync(sleeperPath, 'utf8'));
const normalizeName = (value) => {
  const name = String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { 'hollywood brown': 'marquise brown' }[name] || name;
};
const normalizeTeam = (value) => ({ JAC: 'JAX', WSH: 'WAS' }[String(value || '').toUpperCase()] || String(value || '').toUpperCase());
const dkKeys = new Set(slate.players.map((p) => p.position === 'DST' ? `DST|${normalizeTeam(p.team)}` : `${normalizeName(p.name)}|${normalizeTeam(p.team)}|${p.position}`));
const sleeperKeys = new Set(Object.values(sleeper).flatMap((p) => {
  const positions = [p.position, ...(p.fantasy_positions || [])].map((position) => String(position || '').toUpperCase()).map((position) => position === 'DEF' ? 'DST' : position);
  const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.player_id;
  return positions.flatMap((position) => position === 'DST' ? [`DST|${normalizeTeam(p.team)}`] : [`${normalizeName(name)}|${normalizeTeam(p.team)}|${position}`, `${normalizeName(name)}|${position}`]);
}));
const unmatched = slate.players.filter((p) => !sleeperKeys.has(p.position === 'DST' ? `DST|${normalizeTeam(p.team)}` : `${normalizeName(p.name)}|${normalizeTeam(p.team)}|${p.position}`) && !sleeperKeys.has(`${normalizeName(p.name)}|${p.position}`));
const matched = slate.players.length - unmatched.length;
const summary = Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'DST'].map((position) => [position, {
  total: slate.players.filter((p) => p.position === position).length,
  unmatched: unmatched.filter((p) => p.position === position).length,
}]));
console.log(JSON.stringify({ draftGroupId: slate.draftGroupId, total: slate.players.length, matched, unmatched: unmatched.length, summary, unmatchedPlayers: unmatched.map((p) => `${p.name} (${p.position}, ${p.team})`) }, null, 2));
