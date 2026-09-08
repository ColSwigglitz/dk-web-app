begin;
create or replace function private.nfl_leaderboard(p_league uuid,p_season integer,p_week integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not private.is_league_member(p_league,auth.uid()) then
    raise exception 'League membership required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',m.user_id,'display_name',p.display_name,'submitted',coalesce(l.submitted,false),
    'selected_count',coalesce(t.selected,0),'sunday_selected_count',coalesce(t.sunday_selected,0),
    'excluded_count',coalesce(t.excluded,0),'score',case when s.season is null then null else coalesce(t.score,0) end,
    'unmapped_count',coalesce(t.unmapped,0),'week_complete',coalesce(s.week_complete,false),
    'lineup',case when s.week_complete and s.schedule_verified then l.lineup else null end
  )),'[]'::jsonb) into result
  from public.league_members m join public.profiles p on p.id=m.user_id
  left join public.weekly_lineups l on l.league_id=m.league_id and l.user_id=m.user_id and l.season=p_season and l.week=p_week
  left join public.nfl_week_stats s on s.season=p_season and s.week=p_week
  left join lateral (
    select count(*) selected, count(*) filter(where players.eligible) sunday_selected,
      sum(case when players.eligible then coalesce((s.points->players.id->>'fantasyPoints')::numeric,0) else 0 end) score,
      count(*) filter(where not players.eligible) excluded,
      count(*) filter(where players.id !~ '^[0-9]+$' and players.id not in ('ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS')) unmapped
    from (select distinct player->>'id' id,player->>'team' team,
      exists(select 1 from jsonb_array_elements(coalesce(s.games,'[]')) g
        where player->>'team' in (g->>'home',g->>'away')) eligible
      from jsonb_each(coalesce(l.lineup,'{}')) entry(slot,player) where player <> 'null'::jsonb) players
  ) t on true where m.league_id=p_league;
  return result;
end $$;
revoke all on function private.nfl_leaderboard(uuid,integer,integer) from public,anon;
grant execute on function private.nfl_leaderboard(uuid,integer,integer) to authenticated;
commit;

