-- Transactional integration test: all synthetic users, leagues and stats roll back.
begin;
create temporary table fixture_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() outsider,gen_random_uuid() league;
grant select on fixture_ids to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select a,a||'@example.invalid','{"display_name":"Stats test A"}'::jsonb from fixture_ids
union all select b,b||'@example.invalid','{"display_name":"Stats test B"}'::jsonb from fixture_ids
union all select outsider,outsider||'@example.invalid','{"display_name":"Stats outsider"}'::jsonb from fixture_ids;
insert into public.leagues(id,owner_id,name,invite_code) select league,a,'Stats privacy test',left(league::text,8) from fixture_ids;
insert into public.league_members(league_id,user_id) select league,a from fixture_ids union all select league,b from fixture_ids;
insert into public.nfl_week_stats(season,week,points,games,schedule_verified,week_complete,lock_at,fetched_at,rules_version)
values(2099,1,'{"4984":{"fantasyPoints":41.76,"stats":{"pass_yd":394}}}','[]',true,false,now()+interval '1 day',now(),'test');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.weekly_lineups(league_id,user_id,season,week,lineup,projected)
select league,b,2099,1,'{"QB":{"id":"4984","name":"Test Player","position":"QB","salary":7000}}',9999 from fixture_ids;
select set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true) from fixture_ids;
set local role authenticated;
do $$ declare rows jsonb; begin
  if (select count(*) from public.weekly_lineups where season=2099)<>0 then raise exception 'Private roster leaked'; end if;
  select public.nfl_leaderboard(league,2099,1) into rows from fixture_ids;
  if exists(select 1 from jsonb_array_elements(rows) r where r->>'lineup' is not null) then raise exception 'RPC leaked roster'; end if;
  if not exists(select 1 from jsonb_array_elements(rows) r where (r->>'score')::numeric=41.76) then raise exception 'Incorrect server total'; end if;
  begin
    update public.nfl_week_stats set week_complete=true where season=2099;
    raise exception 'User changed trusted snapshot';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',outsider,'role','authenticated')::text,true) from fixture_ids;
do $$ begin
  begin perform public.nfl_leaderboard((select league from fixture_ids),2099,1); raise exception 'Outsider read totals';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.nfl_week_stats set week_complete=true,lock_at=now()-interval '1 day' where season=2099;
select set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true) from fixture_ids;
set local role authenticated;
do $$ declare rows jsonb; begin
  if (select count(*) from public.weekly_lineups where season=2099)<>1 then raise exception 'Final roster not revealed'; end if;
  select public.nfl_leaderboard(league,2099,1) into rows from fixture_ids;
  if not exists(select 1 from jsonb_array_elements(rows) r where r->'lineup'->'QB'->>'id'='4984') then raise exception 'Final RPC missing roster'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true) from fixture_ids;
do $$ begin
  begin delete from public.weekly_lineups where season=2099; raise exception 'Locked roster deletion allowed';
  exception when raise_exception then if sqlerrm<>'This NFL week is locked' then raise; end if; end;
end $$;
reset role;
select 'PASS: private rows, aggregate totals, final reveal, outsider denial, trusted stats writes and locked deletes' as result;
rollback;

