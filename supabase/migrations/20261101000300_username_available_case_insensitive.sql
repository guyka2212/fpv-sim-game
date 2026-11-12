-- Names are unique ignoring case (citext). Inside this function the search path is empty, so the
-- citext "=" operator isn't found and the comparison fell back to case-sensitive text: "clan"
-- looked free when "Clan" existed. Compare lower-cased text explicitly.
create or replace function public.username_available(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select trim(p_name) ~ '^[A-Za-z0-9 ._|-]{2,20}$'
     and not exists (select 1 from public.profiles where lower(username::text) = lower(trim(p_name)));
$$;

grant execute on function public.username_available(text) to anon, authenticated;
