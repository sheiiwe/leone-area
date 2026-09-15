begin;
-- Transactional outbox: created together with the request, never from the browser.
create table public.point_mail_config (
 id boolean primary key default true check(id),
 dispatch_token text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
alter table public.point_mail_config enable row level security;
revoke all on public.point_mail_config from public,anon,authenticated;
grant select on public.point_mail_config to service_role;
create policy point_mail_config_service_only on public.point_mail_config for select to service_role using(true);
insert into public.point_mail_config(id) values(true);
create table public.point_mail_outbox (
 richiesta_id uuid primary key references public.point_richieste(id) on delete cascade,
 destinatario text not null,
 servizio text not null,
 partner text not null,
 stato text not null default 'pending' check(stato in ('pending','sending','sent','failed','suppressed')),
 tentativi integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 sent_at timestamptz,
 last_error text
);
alter table public.point_mail_outbox enable row level security;
revoke all on public.point_mail_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.point_mail_outbox to service_role;
create policy point_mail_outbox_service_only on public.point_mail_outbox for all to service_role using(true) with check(true);
create index point_mail_pending_idx on public.point_mail_outbox(stato,updated_at) where stato in ('pending','failed');
create index point_mail_recipient_idx on public.point_mail_outbox(destinatario,created_at);

-- Anonymous form submissions intentionally invoke this internal trigger. It cannot
-- be called as a public RPC; recipient and service come exclusively from NEW.
create function private.point_enqueue_confirmation() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient text := lower(trim(new.email)); duplicate_recent boolean;
begin
 if tg_op <> 'INSERT' or tg_table_schema <> 'public' or tg_table_name <> 'point_richieste' or new.consenso is not true then
  raise exception 'Invalid confirmation event';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(recipient,0));
 select exists(select 1 from public.point_mail_outbox
  where destinatario=recipient and servizio=new.titolo_richiesto
  and created_at > now()-interval '5 minutes') into duplicate_recent;
 insert into public.point_mail_outbox(richiesta_id,destinatario,servizio,partner,stato)
 values(new.id,recipient,new.titolo_richiesto,new.partner_richiesto,
 case when duplicate_recent then 'suppressed' else 'pending' end);
 return new;
end $$;
revoke all on function private.point_enqueue_confirmation() from public,anon,authenticated,service_role;
create trigger point_confirmation_after_insert after insert on public.point_richieste
for each row execute function private.point_enqueue_confirmation();

create function public.point_claim_confirmation() returns setof public.point_mail_outbox
language sql security invoker set search_path='' as $$
 update public.point_mail_outbox o set stato='sending',tentativi=o.tentativi+1,updated_at=now()
 where o.richiesta_id in (
 select richiesta_id from public.point_mail_outbox
 where stato='pending' or (stato='failed' and tentativi<3 and updated_at<now()-interval '5 minutes')
 order by created_at for update skip locked limit 1
 ) returning o.*;
$$;
revoke all on function public.point_claim_confirmation() from public,anon,authenticated;
grant execute on function public.point_claim_confirmation() to service_role;

create function private.point_dispatch_confirmation() returns bigint
language plpgsql security invoker set search_path='' as $$
declare request_id bigint;
begin
 if exists(select 1 from public.point_mail_outbox where stato='pending' or
 (stato='failed' and tentativi<3 and updated_at<now()-interval '5 minutes')) then
 select net.http_post(
 url:='https://uljdbdbkiulbcquuhfwd.supabase.co/functions/v1/point-confirmation',
 headers:=jsonb_build_object('Content-Type','application/json','x-point-token',(select dispatch_token from public.point_mail_config where id)),
 body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 end if;
 return request_id;
end $$;
revoke all on function private.point_dispatch_confirmation() from public,anon,authenticated,service_role;
select cron.schedule('point-client-confirmations','* * * * *','select private.point_dispatch_confirmation();');
comment on table public.point_mail_outbox is 'Conferme transazionali Point: una per richiesta, niente invii retroattivi. SMTP gestito da point-confirmation.';
commit;
