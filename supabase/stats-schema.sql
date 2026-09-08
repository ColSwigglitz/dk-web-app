-- Reproducible schema for the first regular-season stats integration.
begin;
create table if not exists public.nfl_week_stats (
  season integer not null, week integer not null check (week between 1 and 18),
  points jsonb not null default '{}', games jsonb not null default '[]',
  schedule_verified boolean not null default false, week_complete boolean not null default false,
  lock_at timestamptz, fetched_at timestamptz not null, rules_version text not null,
  primary key(season,week), check (not week_complete or schedule_verified)
);
alter table public.nfl_week_stats enable row level security;
revoke all on public.nfl_week_stats from anon, authenticated;
grant select on public.nfl_week_stats to authenticated;
grant all on public.nfl_week_stats to service_role;
create policy stats_read on public.nfl_week_stats for select to authenticated using(true);

-- Privacy is enforced even if a client requests every column directly.
drop policy if exists lineups_select_league_members on public.weekly_lineups;
create policy lineups_select_private_or_final on public.weekly_lineups for select to authenticated
using (user_id=(select auth.uid()) or (
  private.is_league_member(league_id,(select auth.uid())) and exists(
    select 1 from public.nfl_week_stats s where s.season=weekly_lineups.season and s.week=weekly_lineups.week
    and s.schedule_verified and s.week_complete)));

-- Aggregate privileged reads live in an unexposed schema, with explicit membership checks.
create or replace function private.nfl_leaderboard(p_league uuid,p_season integer,p_week integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not private.is_league_member(p_league,auth.uid()) then
    raise exception 'League membership required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',m.user_id,'display_name',p.display_name,'submitted',coalesce(l.submitted,false),
    'selected_count',coalesce(t.selected,0),'score',case when s.season is null then null else coalesce(t.score,0) end,
    'unmapped_count',coalesce(t.unmapped,0),'week_complete',coalesce(s.week_complete,false),
    'lineup',case when s.week_complete and s.schedule_verified then l.lineup else null end
  )),'[]'::jsonb) into result
  from public.league_members m join public.profiles p on p.id=m.user_id
  left join public.weekly_lineups l on l.league_id=m.league_id and l.user_id=m.user_id and l.season=p_season and l.week=p_week
  left join public.nfl_week_stats s on s.season=p_season and s.week=p_week
  left join lateral (
    select count(*) selected,
      sum(coalesce((s.points->players.id->>'fantasyPoints')::numeric,0)) score,
      count(*) filter(where players.id !~ '^[0-9]+$' and players.id not in ('ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS')) unmapped
    from (select distinct value->>'id' id from jsonb_each(coalesce(l.lineup,'{}')) where value <> 'null'::jsonb) players
  ) t on true where m.league_id=p_league;
  return result;
end $$;
revoke all on function private.nfl_leaderboard(uuid,integer,integer) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.nfl_leaderboard(uuid,integer,integer) to authenticated;
create or replace function public.nfl_leaderboard(p_league uuid,p_season integer,p_week integer)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nfl_leaderboard(p_league,p_season,p_week);
$$;
revoke all on function public.nfl_leaderboard(uuid,integer,integer) from public,anon;
grant execute on function public.nfl_leaderboard(uuid,integer,integer) to authenticated;

-- Schedule supplies dates, not kickoff times. The initial release locks the whole
-- week at 00:00 UTC on its first game date, including direct API writes/deletes.
create or replace function private.guard_nfl_lineup() returns trigger
language plpgsql security definer set search_path='' as $$
declare target public.weekly_lineups; snapshot public.nfl_week_stats;
begin
  if current_user='service_role' or auth.role()='service_role' then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if TG_OP='DELETE' then target:=old; else target:=new; end if;
  if auth.uid() is null or target.user_id<>auth.uid() or not private.is_league_member(target.league_id,auth.uid()) then
    raise exception 'You may only save your own league roster';
  end if;
  if TG_OP='UPDATE' and (new.league_id,new.user_id,new.season,new.week) is distinct from (old.league_id,old.user_id,old.season,old.week) then
    raise exception 'Roster identity cannot change';
  end if;
  select * into snapshot from public.nfl_week_stats where season=target.season and week=target.week;
  if not found or not snapshot.schedule_verified or snapshot.lock_at is null then raise exception 'Refresh the NFL schedule before editing'; end if;
  if now()>=snapshot.lock_at then raise exception 'This NFL week is locked'; end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.guard_nfl_lineup() from public,anon,authenticated;
create trigger guard_nfl_lineup before insert or update or delete on public.weekly_lineups
for each row execute function private.guard_nfl_lineup();
commit;

