-- Second Gemini key (30 Sep 2026, PMO's instruction).
-- The key itself is in Vault as `gemini_api_key_2` (a separate Google AI Studio
-- project, free tier, so it has its own quota). Order of use, in `ask` and
-- `epdd-sync`: 3.5 Flash Lite on key 1, then on key 2, then 3.1 Flash Lite on
-- key 1, then on key 2 (then Groq, in `ask` only).
-- get_gemini_key() is kept as it is.
create or replace function public.get_gemini_keys()
returns text[]
language sql stable security definer
set search_path = public, vault
as $$
  select array_remove(array[
    (select decrypted_secret from vault.decrypted_secrets where name = 'gemini_api_key'   limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'gemini_api_key_2' limit 1)
  ], null);
$$;
revoke all on function public.get_gemini_keys() from public, anon, authenticated;
grant execute on function public.get_gemini_keys() to service_role;
