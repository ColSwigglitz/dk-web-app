# Weekly NFL Draft

## Live stats integration

The app now uses Supabase accounts and shared weekly rosters, with actual server-calculated Sleeper stats on the leaderboard. Other rosters remain private until the entire NFL week is verified complete. Scores refresh every minute while the page is visible; failures retain the last successful scores and display a delayed-data notice.

The initial deadline is 00:00 UTC on the week's first game date because the verified schedule lacks kickoff times. Read [STATS-INTEGRATION.md](STATS-INTEGRATION.md) for scoring rules, verified endpoints, deployment, tests and limitations.

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

The DraftKings CSV importer supports common columns such as:
- Position
- Name or Name + ID
- ID
- Roster Position
- Salary
- Game Info
- TeamAbbrev
- AvgPointsPerGame

