-- Reuse Leone Consulting's existing mail-provider credential through Vault.
-- Provision the encrypted secret separately; no credential belongs in Git.
grant usage on schema vault to service_role;
grant select on vault.decrypted_secrets to service_role;
create function public.point_mail_provider_key() returns text
language sql security invoker set search_path='' stable as $$
 select decrypted_secret from vault.decrypted_secrets where name='point_brevo_api_key';
$$;
revoke all on function public.point_mail_provider_key() from public,anon,authenticated;
grant execute on function public.point_mail_provider_key() to service_role;
