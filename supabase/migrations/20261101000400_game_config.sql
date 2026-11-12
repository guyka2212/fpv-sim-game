-- All Flight Path balance lives here, so it can be tuned in Supabase without a game update.
-- The game reads this row (and public.rewards) when it starts; the functions below use it too.
--   XP to reach level L = xp_base * (L-1) + xp_growth * (L-1)^2
--   per_day_cap makes finishing take at least total XP / per_day_cap days.
create table public.game_config (
  id integer primary key default 1 check (id = 1),
  max_level integer not null default 50 check (max_level between 2 and 200),
  xp_base integer not null default 1000 check (xp_base >= 0),
  xp_growth integer not null default 335 check (xp_growth >= 0),
  per_call_cap integer not null default 5000 check (per_call_cap > 0),
  per_minute_cap integer not null default 8000 check (per_minute_cap > 0),
  per_day_cap integer not null default 120000 check (per_day_cap > 0),
  -- Points per trick and the combo / multiplayer factors (see src/progress/tricks.ts).
  trick_points jsonb not null default '{
    "flip": 100, "roll": 100, "multi_bonus": 50, "power_loop": 300, "split_s": 250, "spin": 80,
    "gap": 150, "dive_base": 100, "dive_per_m": 6, "proximity_per_s": 70, "inverted_per_s": 80,
    "combo_step": 0.25, "combo_max": 3, "multiplayer_bonus": 1.25, "xp_scale": 1
  }'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.game_config (id) values (1);
alter table public.game_config enable row level security;
create policy "game config is readable" on public.game_config for select to anon, authenticated using (true);
revoke all on public.game_config from anon, authenticated;
grant select on public.game_config to anon, authenticated;

-- Daily XP counter.
alter table public.profiles add column xp_day date not null default current_date;
alter table public.profiles add column xp_day_amount integer not null default 0;

create or replace function public.level_for_xp(p_xp bigint)
returns integer language plpgsql stable set search_path = '' as $$
declare
  c public.game_config%rowtype;
  lv integer := 1;
begin
  select * into c from public.game_config where id = 1;
  while lv < c.max_level and p_xp >= c.xp_base::bigint * lv + c.xp_growth::bigint * lv * lv loop
    lv := lv + 1;
  end loop;
  return lv;
end $$;

-- XP from tricks, capped per call, per minute and per day (all from game_config).
drop function if exists public.add_xp(integer);
create function public.add_xp(p_amount integer)
returns table (xp bigint, level integer, granted integer, day_left integer)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.game_config%rowtype;
  p public.profiles%rowtype;
  g integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into c from public.game_config where id = 1;
  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'no profile'; end if;
  if now() - p.xp_window_start > interval '60 seconds' then
    p.xp_window_start := now();
    p.xp_window_amount := 0;
  end if;
  if p.xp_day <> current_date then
    p.xp_day := current_date;
    p.xp_day_amount := 0;
  end if;
  g := greatest(0, least(coalesce(p_amount, 0), c.per_call_cap, c.per_minute_cap - p.xp_window_amount, c.per_day_cap - p.xp_day_amount));
  update public.profiles
     set xp = profiles.xp + g,
         xp_window_start = p.xp_window_start,
         xp_window_amount = p.xp_window_amount + g,
         xp_day = p.xp_day,
         xp_day_amount = p.xp_day_amount + g
   where id = uid
  returning profiles.xp into p.xp;
  return query select p.xp, public.level_for_xp(p.xp), g, greatest(0, c.per_day_cap - p.xp_day_amount - g);
end $$;

-- How much XP you can still earn today (shown in the game).
create or replace function public.xp_today()
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0, c.per_day_cap - case when p.xp_day = current_date then p.xp_day_amount else 0 end)
  from public.profiles p, public.game_config c
  where p.id = auth.uid() and c.id = 1;
$$;

revoke execute on function public.add_xp(integer) from public, anon;
grant execute on function public.add_xp(integer) to authenticated;
revoke execute on function public.xp_today() from public, anon;
grant execute on function public.xp_today() to authenticated;
grant execute on function public.level_for_xp(bigint) to anon, authenticated;
