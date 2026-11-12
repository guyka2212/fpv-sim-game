-- User names may also contain "|" (e.g. "Clan | Pilot").
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check check (username::text ~ '^[A-Za-z0-9 ._|-]{2,20}$');

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uname text := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if uname !~ '^[A-Za-z0-9 ._|-]{2,20}$' then
    raise exception 'invalid username';
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  return new;
end $$;

create or replace function public.username_available(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select trim(p_name) ~ '^[A-Za-z0-9 ._|-]{2,20}$'
     and not exists (select 1 from public.profiles where username = trim(p_name)::extensions.citext);
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
