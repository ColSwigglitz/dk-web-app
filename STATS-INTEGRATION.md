# Live NFL stats integration

Verified 8 September 2026. The app uses its existing Supabase project and Sleeper player IDs. No paid data subscription is required. League members receive server-calculated totals; full opponent rosters and their breakdowns are withheld until the full regular-season week is verified complete.

## Verified endpoints

| Endpoint | Observation |
| --- | --- |
| `https://api.sleeper.app/v1/state/nfl` | HTTP 200; 2026 regular season, week 1 |
| `https://api.sleeper.app/v1/players/nfl` | Existing player directory integration; saved roster IDs already use Sleeper IDs, including `MIN` for DST |
| `https://api.sleeper.app/v1/stats/nfl/regular/2025/1` | HTTP 200; 2,312 player/team rows with raw numeric stats |
| `https://api.sleeper.app/v1/stats/nfl/regular/2026/1` | HTTP 200; empty object before first kickoff, not a feed error |
| `https://api.sleeper.com/stats/nfl/2025/1?season_type=regular` | HTTP 200; alternative array-shaped response. Verified but not used as an automatic fallback |
| `https://api.sleeper.com/schedule/nfl/regular/2025` | HTTP 200; all 272 regular-season games, with `complete` statuses |
| `https://api.sleeper.com/schedule/nfl/regular/2026` | HTTP 200; 272 active fixtures plus one cancelled placeholder; current week has 16 pregame fixtures |

Appending a week to the season schedule endpoint did not work. ESPN's public scoreboard returned Access Denied in this environment, so it is not a working fallback.

[Sleeper documentation](https://docs.sleeper.com/) covers player IDs, NFL state, usage limits and non-commercial use. The raw stats and schedule endpoints above are **undocumented**: schemas, uptime, update latency and correction timing are not guaranteed. Historical data verified the calculation path; in-game latency has not yet been measured because week 1 has not started. Commercial use requires checking Sleeper licensing.

## Scoring: `ppr-bonus-v1`

This first explicit scoring configuration uses full PPR: passing yards 0.04, passing TD 4, interception -1; rushing/receiving yards 0.1; rushing/receiving/individual return TD 6; reception 1; lost fumble -1; two-point conversion 2. Bonuses: 300 passing yards, 100 rushing yards, or 100 receiving yards each add 3. Points round to two decimals.

DST: sack 1; interception, fumble recovery, safety and blocked kick 2; defensive/special-teams TD 6; special-teams fumble recovery 2. Points allowed: 0 → 10, 1–6 → 7, 7–13 → 4, 14–20 → 1, 21–27 → 0, 28–34 → -1, 35+ → -4. A missing points-allowed stat never earns a shutout bonus. Sleeper's team `td` field is deliberately excluded; defensive TDs use `def_td`. No precomputed Sleeper fantasy total is used because its scoring differs.

Example: Josh Allen's 2025 week 1 raw stats (394 passing yards, 2 passing TD, 30 rushing yards, 2 rushing TD) produce **41.76** including the 300-yard bonus. Buffalo DST produces **0**, rather than crediting its offensive `td` field.

## Refresh and privacy

- `nfl-stats` validates the user's bearer token through Supabase Auth and checks league membership. The platform JWT gate is disabled specifically because authentication is implemented inside the function; anonymous requests are rejected.
- The Edge Function fetches stats and the full schedule, computes player points, and stores a trusted snapshot in `nfl_week_stats`. Only the service role can write snapshots. No secret is shipped in the website.
- Open, visible app sessions refresh every 60 seconds. A shared snapshot suppresses normal upstream refreshes for 60 seconds. Concurrent cold refreshes can still duplicate requests; this is suitable for a small friends league, not a high-traffic service.
- There is no background scheduler in this release. If nobody has the app open, refresh/reveal occurs when someone returns. A reload selects the latest NFL week; the current page keeps its selected week fixed to avoid saving a roster into a newly rolled week.
- The privileged aggregate function lives in `private`, checks membership, and exposes only totals/completion before reveal. An invoker wrapper provides the public RPC. Row-level security independently prevents direct opponent lineup reads, including salary and projection columns.
- Reveal requires a complete 272-game regular-season schedule, 17 appearances per team, unique games, unique weekly teams, preservation of previously seen weekly games, and every game in the requested week marked `complete`. Final team stats must also be present. Cancelled placeholders are excluded only while the remaining schedule still passes the complete-season checks. A cancelled actual game or incomplete schedule keeps reveal blocked.
- Missing/invalid feeds, removed stat records and unexpected empty responses retain the previous snapshot. The UI labels delayed data with its last successful timestamp. A last-known verified final snapshot remains revealed. No random scores or projections substitute for real scoring.

## Current limitations

- **Deadline:** Sleeper supplies game dates, not kickoff timestamps. The first release locks the entire week's roster at **00:00 UTC on the first game date**. The UI displays this deadline; a database trigger also blocks writes/deletes. Per-player kickoff locking requires another verified time feed. A missing verified schedule blocks edits.
- Regular season only (weeks 1–18); no postseason competition support or historical week selector yet.
- Existing Sleeper IDs map directly, including team abbreviations for DST. Legacy `dk26-*` IDs are flagged as needing mapping and score zero; no ambiguous name matching is performed. A valid player with no stat row scores zero, which can represent pregame, DNP, or feed omission. The provider does not supply enough information here to distinguish those reliably.
- Scores are provisional and can change on later corrections. Raw scoring keys remain available in the post-week breakdown. Rule changes need a new scoring version and explicit recalculation.
- Existing salary/position validation remains primarily in the roster builder; this integration is not a full server-side salary/eligibility validator.
- No automatic paid/ESPN/nflverse fallback is enabled. Recovery is last-known-good data and retry; a replacement adapter must satisfy the same scoring/schedule validation contract.

## Deployment and verification

Backend schema: `supabase/stats-schema.sql`; function: `supabase/functions/nfl-stats/index.ts` and `scoring.mjs`. Frontend: `live-stats.js` loaded after existing auth overrides. Supabase project: `lafgqijdnuemykhscuqe` (Weekly NFL Draft). Schema applied as `live_nfl_stats_and_private_rosters`; initial week 1 and existing week 3 schedules seeded from verified data.

Run `node --test tests/*.test.mjs` with Node 24. `tests/privacy.sql` runs in a transaction and rolls back every synthetic user/league/lineup. It verifies private direct reads, aggregate scoring independent of client projections, outsider denial, denied snapshot mutation, final reveal, and locked deletion.

Security advisor reports no new integration findings. Existing notices remain for the intentionally privileged join-by-code function and disabled leaked-password protection. See [function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

