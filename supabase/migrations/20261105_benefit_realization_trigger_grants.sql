-- Trigger functions are not meant to be called through the API (advisor, 5 Nov 2026).
revoke execute on function public.log_benefit_realization() from public, anon, authenticated;
revoke execute on function public.trg_benefit_realization_stamp() from public, anon, authenticated;
