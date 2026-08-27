# Weekly NFL Draft MVP

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
