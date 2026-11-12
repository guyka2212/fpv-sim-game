-- FPV Sim accounts and the Flight Path.
-- profiles: one per user (username + XP). rewards: what each Pilot Level unlocks. claims: what a
-- user has claimed. Nobody writes these tables directly: XP and claims only change through the
-- security-definer functions below, which cap XP per minute and check levels on the server.

create extension if not exists citext with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique check (username::text ~ '^[A-Za-z0-9 ._-]{2,20}$'),
  xp bigint not null default 0 check (xp >= 0),
  xp_window_start timestamptz not null default now(),
  xp_window_amount integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.rewards (
  id text primary key,
  kind text not null check (kind in ('drone', 'skin')),
  ref text not null,
  level integer not null check (level between 1 and 50)
);

create table public.claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward_id text not null references public.rewards (id),
  claimed_at timestamptz not null default now(),
  primary key (user_id, reward_id)
);

alter table public.profiles enable row level security;
alter table public.rewards enable row level security;
alter table public.claims enable row level security;

-- Usernames and levels are public (multiplayer shows them); the XP rate-limit columns are not.
create policy "profiles are readable" on public.profiles for select to anon, authenticated using (true);
create policy "rewards are readable" on public.rewards for select to anon, authenticated using (true);
create policy "own claims are readable" on public.claims for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select (id, username, xp, created_at) on public.profiles to anon, authenticated;
revoke all on public.rewards from anon, authenticated;
grant select on public.rewards to anon, authenticated;
revoke all on public.claims from anon, authenticated;
grant select on public.claims to authenticated;

-- Same curve as src/progress/flightPath.ts: XP to reach level L = 250 (L-1) + 50 (L-1)^2.
create or replace function public.level_for_xp(p_xp bigint)
returns integer language plpgsql immutable set search_path = '' as $$
declare lv integer := 1;
begin
  while lv < 50 and p_xp >= 250 * lv + 50 * lv * lv loop
    lv := lv + 1;
  end loop;
  return lv;
end $$;

-- A profile for every new account, with the username given at sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uname text := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if uname !~ '^[A-Za-z0-9 ._-]{2,20}$' then
    raise exception 'invalid username';
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select trim(p_name) ~ '^[A-Za-z0-9 ._-]{2,20}$'
     and not exists (select 1 from public.profiles where username = trim(p_name)::extensions.citext);
$$;

-- XP from tricks. At most 5,000 per call and 8,000 per minute, so a hacked client can't jump to
-- level 50. Returns the new total and level.
create or replace function public.add_xp(p_amount integer)
returns table (xp bigint, level integer)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  grant_amount integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'no profile'; end if;
  if now() - p.xp_window_start > interval '60 seconds' then
    p.xp_window_start := now();
    p.xp_window_amount := 0;
  end if;
  grant_amount := greatest(0, least(coalesce(p_amount, 0), 5000, 8000 - p.xp_window_amount));
  update public.profiles
     set xp = profiles.xp + grant_amount,
         xp_window_start = p.xp_window_start,
         xp_window_amount = p.xp_window_amount + grant_amount
   where id = uid
  returning profiles.xp into p.xp;
  return query select p.xp, public.level_for_xp(p.xp);
end $$;

-- Claim a reward your level has reached.
create or replace function public.claim_reward(p_reward text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  need integer;
  have bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select level into need from public.rewards where id = p_reward;
  if need is null then raise exception 'unknown reward'; end if;
  select xp into have from public.profiles where id = uid;
  if public.level_for_xp(coalesce(have, 0)) < need then raise exception 'level % needed', need; end if;
  insert into public.claims (user_id, reward_id) values (uid, p_reward) on conflict do nothing;
  return true;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_xp(integer) from public, anon;
revoke execute on function public.claim_reward(text) from public, anon;
grant execute on function public.add_xp(integer) to authenticated;
grant execute on function public.claim_reward(text) to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.level_for_xp(bigint) to anon, authenticated;

insert into public.rewards (id, kind, ref, level) values
('drone:whoop75','drone','whoop75',2),
('drone:whoop85','drone','whoop85',4),
('drone:cinewhoop25','drone','cinewhoop25',6),
('drone:cinewhoop35','drone','cinewhoop35',9),
('drone:toothpick3','drone','toothpick3',3),
('drone:freestyle35','drone','freestyle35',7),
('drone:freestyle4','drone','freestyle4',10),
('drone:freestyle5lite','drone','freestyle5lite',5),
('drone:freestyle5hd','drone','freestyle5hd',12),
('drone:squashed5','drone','squashed5',14),
('drone:freestyle6','drone','freestyle6',18),
('drone:racer5pro','drone','racer5pro',16),
('drone:racer4','drone','racer4',8),
('drone:racer3','drone','racer3',11),
('drone:longrange4','drone','longrange4',13),
('drone:longrange5','drone','longrange5',15),
('drone:longrange10','drone','longrange10',25),
('drone:xclass','drone','xclass',30),
('drone:cinelifter8','drone','cinelifter8',22),
('drone:goldrush5','drone','goldrush5',40),
('skin:midnight','skin','midnight',1),
('skin:toxic','skin','toxic',3),
('skin:sunset','skin','sunset',5),
('skin:ice','skin','ice',7),
('skin:racing-red','skin','racing-red',9),
('skin:ocean','skin','ocean',11),
('skin:bumblebee','skin','bumblebee',13),
('skin:camo','skin','camo',15),
('skin:neon-pink','skin','neon-pink',17),
('skin:lava','skin','lava',19),
('skin:arctic','skin','arctic',21),
('skin:cyber','skin','cyber',23),
('skin:galaxy','skin','galaxy',26),
('skin:chrome','skin','chrome',29),
('skin:emerald','skin','emerald',32),
('skin:ghost','skin','ghost',35),
('skin:gold','skin','gold',38),
('skin:diamond','skin','diamond',45),
('skin:legend','skin','legend',50);
