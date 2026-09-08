export const TEAMS = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' '));
export const RULES_VERSION = 'ppr-bonus-v1';
export function isSunday(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
}
export function fantasyPoints(stats, defense = false) {
  const n = key => {
    const value = stats[key] ?? 0;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid stat: ${key}`);
    return value;
  };
  let score;
  if (defense) {
    // `td` in team rows is NOT defensive touchdowns. Never count it here.
    score = n('sack') + 2*(n('int')+n('fum_rec')+n('safe')+n('blk_kick'))
      + 6*(n('def_td')+n('def_st_td')) + 2*n('def_st_fum_rec');
    if (Object.hasOwn(stats, 'pts_allow')) {
      const allowed = n('pts_allow');
      score += allowed === 0 ? 10 : allowed <= 6 ? 7 : allowed <= 13 ? 4 : allowed <= 20 ? 1 : allowed <= 27 ? 0 : allowed <= 34 ? -1 : -4;
    }
  } else {
    score = n('pass_yd')*.04 + n('pass_td')*4 - n('pass_int')
      + (n('rush_yd')+n('rec_yd'))*.1 + (n('rush_td')+n('rec_td')+n('st_td'))*6
      + n('rec') - n('fum_lost') + 2*(n('pass_2pt')+n('rush_2pt')+n('rec_2pt'))
      + (n('pass_yd')>=300?3:0) + (n('rush_yd')>=100?3:0) + (n('rec_yd')>=100?3:0);
  }
  return Math.round(score*100)/100;
}
export function normalizeStats(raw) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new Error('Invalid stats payload');
  return Object.fromEntries(Object.entries(raw).map(([id, stats]) => {
    if (!stats || Array.isArray(stats) || typeof stats !== 'object') throw new Error('Invalid player stats');
    return [id, {fantasyPoints:fantasyPoints(stats, TEAMS.has(id)), stats}];
  }));
}
export function inspectSchedule(raw, week, previousGames = []) {
  if (!Array.isArray(raw)) throw new Error('Invalid schedule payload');
  const active = raw.filter(g => g.status !== 'canceled');
  // The regular season must contain all 272 games and 17 appearances per team.
  // Cancelled placeholders are excluded, but missing/rescheduled games fail closed.
  const counts = new Map();
  for (const g of active) for (const team of [g.home,g.away]) counts.set(team,(counts.get(team)||0)+1);
  const valid = active.length === 272 && new Set(active.map(g=>g.game_id)).size === 272
    && [...TEAMS].every(t=>counts.get(t)===17) && counts.size === 32
    && active.every(g=>Number.isInteger(g.week)&&g.week>=1&&g.week<=18&&g.home!==g.away&&/^\d{4}-\d{2}-\d{2}$/.test(g.date));
  // This contest is Sunday-only. Thursday, Friday, Saturday and Monday games
  // are intentionally absent from scoring, locking and reveal decisions.
  const games = active.filter(g=>g.week===week && isSunday(g.date));
  const teams = games.flatMap(g=>[g.home,g.away]);
  const retained = previousGames.filter(old=>isSunday(old.date)).every(old=>games.some(g=>g.game_id===old.game_id));
  const verified = valid && retained && games.length>=1 && new Set(teams).size===teams.length;
  return {games, verified, complete:verified && games.every(g=>g.status==='complete'),
    lockAt: verified ? games[0].date+'T00:00:00Z' : null};
}

