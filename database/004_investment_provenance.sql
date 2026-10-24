-- Additive integrity constraint: clients cannot forge documentary verification
-- through the public save RPC, including nested investment observations.
begin;
alter table public.private_projects add constraint investment_no_forged_verification
check (not jsonb_path_exists(payload, '$.investment.observations[*] ? (@.status == "verified")'));
commit;
