-- Upgrade the existing Point outbox; apply once, with its cron job paused.
alter table public.point_mail_config add column admin_email text not null
 default 'amministrazione@leoneconsultingitalia.it';
alter table public.point_mail_outbox
 add column tipo text not null default 'cliente' check (tipo in ('cliente','amministrazione')),
 add column idempotency_key uuid not null default gen_random_uuid(),
 add column first_attempt_at timestamptz,
 add column provider_message_id text;
alter table public.point_mail_outbox drop constraint point_mail_outbox_pkey;
alter table public.point_mail_outbox add primary key (richiesta_id,tipo);

-- This trigger is internal, not a public RPC. Public forms cannot select their
-- notification recipient or read the server-only configuration/outbox.
create or replace function private.point_enqueue_confirmation() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient text := lower(trim(new.email)); duplicate_recent boolean; admin_recipient text;
begin
 if tg_op <> 'INSERT' or tg_table_schema <> 'public' or tg_table_name <> 'point_richieste' or new.consenso is not true then
  raise exception 'Invalid confirmation event';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(recipient,0));
 select exists(select 1 from public.point_mail_outbox
  where tipo='cliente' and destinatario=recipient and servizio=new.titolo_richiesto
  and created_at > now()-interval '5 minutes') into duplicate_recent;
 insert into public.point_mail_outbox(richiesta_id,tipo,destinatario,servizio,partner,stato)
 values(new.id,'cliente',recipient,new.titolo_richiesto,new.partner_richiesto,
 case when duplicate_recent then 'suppressed' else 'pending' end);
 select admin_email into strict admin_recipient from public.point_mail_config where id;
 insert into public.point_mail_outbox(richiesta_id,tipo,destinatario,servizio,partner)
 values(new.id,'amministrazione',admin_recipient,new.titolo_richiesto,new.partner_richiesto);
 return new;
end $$;
revoke all on function private.point_enqueue_confirmation() from public,anon,authenticated,service_role;

create or replace function public.point_claim_confirmation() returns setof public.point_mail_outbox
language plpgsql security invoker set search_path='' as $$
begin
 -- Never blindly resend an uncertain message after the deduplication window.
 update public.point_mail_outbox set stato='failed',tentativi=3,
  last_error='Esito invio non verificabile: controllo necessario',updated_at=now()
 where stato='sending' and updated_at<now()-interval '2 minutes'
 and (first_attempt_at is null or first_attempt_at<=now()-interval '10 minutes' or tentativi>=3);
 return query
 with candidate as (
  select richiesta_id,tipo from public.point_mail_outbox
  where stato='pending'
   or (stato='failed' and tentativi<3 and updated_at<now()-interval '2 minutes')
   or (stato='sending' and tentativi<3 and updated_at<now()-interval '2 minutes'
       and first_attempt_at>now()-interval '10 minutes')
  order by (tipo='amministrazione') desc,created_at
  for update skip locked limit 1
 )
 update public.point_mail_outbox o set stato='sending',tentativi=o.tentativi+1,
  first_attempt_at=coalesce(o.first_attempt_at,now()),updated_at=now()
 from candidate c where o.richiesta_id=c.richiesta_id and o.tipo=c.tipo returning o.*;
end $$;
revoke all on function public.point_claim_confirmation() from public,anon,authenticated;
grant execute on function public.point_claim_confirmation() to service_role;

create or replace function private.point_dispatch_confirmation() returns bigint
language plpgsql security invoker set search_path='' as $$
declare request_id bigint;
begin
 if exists(select 1 from public.point_mail_outbox where stato='pending' or
  (stato='failed' and tentativi<3 and updated_at<now()-interval '2 minutes') or
  (stato='sending' and updated_at<now()-interval '2 minutes')) then
 select net.http_post(
  url:='https://uljdbdbkiulbcquuhfwd.supabase.co/functions/v1/point-confirmation',
  headers:=jsonb_build_object('Content-Type','application/json','x-point-token',(select dispatch_token from public.point_mail_config where id)),
  body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 end if;
 return request_id;
end $$;
revoke all on function private.point_dispatch_confirmation() from public,anon,authenticated,service_role;

-- Administrators can see notification outcomes, never the dispatch token.
grant select(richiesta_id,tipo,stato,sent_at,last_error) on public.point_mail_outbox to authenticated;
create policy point_mail_admin_read on public.point_mail_outbox for select to authenticated
 using((select public.is_admin()));

-- Recover administrator notifications missing from existing requests.
insert into public.point_mail_outbox(richiesta_id,tipo,destinatario,servizio,partner)
 select r.id,'amministrazione',c.admin_email,r.titolo_richiesto,r.partner_richiesto
 from public.point_richieste r cross join public.point_mail_config c where c.id
 on conflict(richiesta_id,tipo) do nothing;

update public.point_servizi set attivo=false,updated_at=now()
 where id='p4' and slug='ebiasp-ente-bilaterale';
comment on table public.point_mail_outbox is
 'Conflavoro Point: conferma cliente e notifica amministrazione indipendenti; sent indica accettazione Brevo, non consegna in casella.';
