-- The automatic-RLS event-trigger helper doesn't need to be callable through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
create index if not exists claims_reward_id_idx on public.claims (reward_id);
