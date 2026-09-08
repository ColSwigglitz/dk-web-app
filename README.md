# Weekly NFL Draft

## Live stats integration

The app now uses Supabase accounts and shared weekly rosters, with actual server-calculated Sleeper stats on the leaderboard. Only Sunday games count. Other rosters remain private until every Sunday game is verified complete. Scores refresh every minute while the page is visible; failures retain the last successful scores and display a delayed-data notice.

The deadline is 00:00 UTC on Sunday because the verified schedule lacks kickoff times. Thursday, Friday, Saturday and Monday fixtures are excluded from the player pool, scoring, deadline and reveal state. Read [STATS-INTEGRATION.md](STATS-INTEGRATION.md) for scoring rules, verified endpoints, deployment, tests and limitations.

Run tests with Node 24: `node --test tests/*.test.mjs`. Database tests in `tests/privacy.sql` roll back every fixture.

## Original prototype notes (superseded)

A private, points-only weekly NFL drafting game inspired by DFS interfaces.

## What works
- Draft screen with salary cap and positional lineup rules
- 1 QB / 2 RB / 3 WR / 1 TE / 1 FLEX / 1 DST
- $50,000 salary cap
- Search and position filters
- DraftKings-style salary CSV import
- Local browser persistence via localStorage
- Submit/lock lineup behaviour
- My Team view
- Live leaderboard shell
- Mock live scoring updates for development
- Responsive mobile layout

## Run it
Open `index.html` directly in a browser, or serve the folder with any static web server.

For example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000

## Next development step
Replace `simulateUpdate()` with a server-side NFL stats adapter. The browser should not hold API credentials. Recommended shape:

`NFL stats provider -> backend endpoint -> normalized player stats -> fantasy scoring engine -> frontend leaderboard`

The Week 1 player pool now uses the official DraftKings NFL Classic Sunday draft group (`151307`), generated on 8 September 2026. DraftKings salary records are matched to Sleeper IDs so the existing live scoring adapter continues to work. The checked-in generator accepts the same draftables JSON returned by DraftKings:

```bash
node scripts/build-draftkings-slate.mjs draftables.json week1-2026-data.js 2026 1 151307
```

The DraftKings feed is undocumented and may change or become unavailable. The supported fallback is the slate's unmodified `DKSalaries.csv` export. Its common columns are:
- Position
- Name or Name + ID
- ID
- Roster Position
- Salary
- Game Info
- TeamAbbrev
- AvgPointsPerGame
