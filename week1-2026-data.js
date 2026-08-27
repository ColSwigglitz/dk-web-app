// Verified public DraftKings Week 1 2026 salary seed.
// Source: DraftKings Network, published 31 July 2026.
// This is a curated public subset, not the complete DKSalaries.csv export.
(() => {
  const DATA_VERSION = 'dk-week1-2026-public-seed-v1';
  if (localStorage.getItem('weeklyNFLDraftDataVersion') === DATA_VERSION) return;

  const players = [
    ['dk26-qb-allen','Josh Allen','QB','BUF','HOU',7000],
    ['dk26-qb-burrow','Joe Burrow','QB','CIN','TB',6900],
    ['dk26-qb-jackson','Lamar Jackson','QB','BAL','IND',6800],
    ['dk26-qb-hurts','Jalen Hurts','QB','PHI','WAS',6600],
    ['dk26-qb-daniels','Jayden Daniels','QB','WAS','PHI',6500],
    ['dk26-qb-mendoza','Fernando Mendoza','QB','LV','MIA',5000],

    ['dk26-rb-gibbs','Jahmyr Gibbs','RB','DET','NO',8000],
    ['dk26-rb-robinson','Bijan Robinson','RB','ATL','PIT',7700],
    ['dk26-rb-taylor','Jonathan Taylor','RB','IND','BAL',7300],
    ['dk26-rb-cook','James Cook','RB','BUF','HOU',7200],
    ['dk26-rb-brown','Chase Brown','RB','CIN','TB',7100],
    ['dk26-rb-love','Jeremiyah Love','RB','ARI','LAC',6400],

    ['dk26-wr-chase','Ja’Marr Chase','WR','CIN','TB',7800],
    ['dk26-wr-stbrown','Amon-Ra St. Brown','WR','DET','NO',7500],
    ['dk26-wr-jefferson','Justin Jefferson','WR','MIN','GB',7300],
    ['dk26-wr-collins','Nico Collins','WR','HOU','BUF',7000],
    ['dk26-wr-olave','Chris Olave','WR','NO','DET',6700],
    ['dk26-wr-tate','Carnell Tate','WR','TEN','NYJ',5300],
    ['dk26-wr-tyson','Jordyn Tyson','WR','NO','DET',5100],
    ['dk26-wr-lemon','Makai Lemon','WR','PHI','WAS',5100],

    ['dk26-te-bowers','Brock Bowers','TE','LV','MIA',6900],
    ['dk26-te-mcbride','Trey McBride','TE','ARI','LAC',6800],
    ['dk26-te-loveland','Colston Loveland','TE','CHI','CAR',5300],
    ['dk26-te-warren','Tyler Warren','TE','IND','BAL',4900],
    ['dk26-te-pitts','Kyle Pitts Sr.','TE','ATL','PIT',4700],

    ['dk26-dst-lac','Los Angeles Chargers','DST','LAC','ARI',3500],
    ['dk26-dst-jax','Jacksonville Jaguars','DST','JAX','CAR',3400],
    ['dk26-dst-pit','Pittsburgh Steelers','DST','PIT','ATL',3300],
    ['dk26-dst-phi','Philadelphia Eagles','DST','PHI','WAS',3100],
    ['dk26-dst-buf','Buffalo Bills','DST','BUF','HOU',3000]
  ].map(([id,name,position,team,opp,salary]) => ({
    id,
    name,
    position,
    team,
    opp,
    salary,
    avg: 0,
    game: `${team} vs ${opp}`,
    source: 'DraftKings Network — Week 1 2026'
  }));

  localStorage.setItem('weeklyNFLDraftMVP', JSON.stringify({
    players,
    lineup: {QB:null,RB1:null,RB2:null,WR1:null,WR2:null,WR3:null,TE:null,FLEX:null,DST:null},
    submitted: false,
    liveStats: {}
  }));
  localStorage.setItem('weeklyNFLDraftDataVersion', DATA_VERSION);
})();
