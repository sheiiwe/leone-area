-- Run after point-mail-delivery.sql. Everything is rolled back; no email is sent.
begin;
update public.point_mail_outbox set stato='suppressed';
set local role anon;
insert into public.point_richieste(servizio_id,ragione_sociale,referente,email,telefono,consenso)
 select id,'QA Conflavoro transazioni','QA Interno','qa@example.invalid','5551234567',true
 from public.point_servizi where attivo and not da_verificare order by id limit 1;
insert into public.point_richieste(servizio_id,ragione_sociale,referente,email,telefono,consenso)
 select id,'QA Conflavoro transazioni','QA Interno','qa@example.invalid','5551234567',true
 from public.point_servizi where attivo and not da_verificare order by id limit 1;
do $$ begin
 if exists(select 1 from public.point_servizi where id='p4') then raise exception 'Internal service visible to anon'; end if;
 begin
  insert into public.point_richieste(servizio_id,ragione_sociale,referente,email,telefono,consenso)
  values('p4','QA servizio interno','QA Interno','qa@example.invalid','5551234567',true);
  raise exception 'Internal request unexpectedly accepted' using errcode='ZX001';
 exception when sqlstate 'ZX001' then raise; when others then null;
 end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.point_richieste where ragione_sociale='QA Conflavoro transazioni')<>2 then raise exception 'Missing test requests'; end if;
 if (select count(*) from public.point_mail_outbox o join public.point_richieste r on r.id=o.richiesta_id where r.ragione_sociale='QA Conflavoro transazioni')<>4 then raise exception 'Each request must have two independent messages'; end if;
 if (select count(*) from public.point_mail_outbox o join public.point_richieste r on r.id=o.richiesta_id where r.ragione_sociale='QA Conflavoro transazioni' and o.tipo='cliente' and o.stato='suppressed')<>1 then raise exception 'Duplicate customer receipt was not suppressed'; end if;
 if (select count(*) from public.point_mail_outbox o join public.point_richieste r on r.id=o.richiesta_id where r.ragione_sociale='QA Conflavoro transazioni' and o.tipo='amministrazione' and o.stato='pending' and o.destinatario='amministrazione@leoneconsultingitalia.it')<>2 then raise exception 'Admin must receive every request'; end if;
 if has_table_privilege('anon','public.point_mail_outbox','select') then raise exception 'Anonymous outbox read'; end if;
 if has_column_privilege('authenticated','public.point_mail_config','dispatch_token','select') then raise exception 'Dispatch token exposed'; end if;
 if has_function_privilege('anon','public.point_claim_confirmation()','execute') then raise exception 'Public mail dispatch'; end if;
end $$;
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}';
do $$ begin
 if exists(select richiesta_id from public.point_mail_outbox) then raise exception 'Non-admin can see outbox'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare a public.point_mail_outbox; b public.point_mail_outbox; c public.point_mail_outbox;
begin
 select * into a from public.point_claim_confirmation();
 select * into b from public.point_claim_confirmation();
 if a.tipo<>'amministrazione' or b.tipo<>'amministrazione' or a.richiesta_id=b.richiesta_id then raise exception 'Admin priority / duplicate claim failure'; end if;
 select * into c from public.point_claim_confirmation();
 if c.tipo<>'cliente' then raise exception 'Client confirmation missing'; end if;
 if exists(select 1 from public.point_claim_confirmation()) then raise exception 'Same row claimed twice'; end if;
 update public.point_mail_outbox set updated_at=now()-interval '3 minutes',first_attempt_at=now()-interval '3 minutes'
 where richiesta_id=a.richiesta_id and tipo=a.tipo;
 select * into b from public.point_claim_confirmation();
 if b.richiesta_id<>a.richiesta_id or b.idempotency_key<>a.idempotency_key or b.tentativi<>2 then raise exception 'Retry did not preserve message identity'; end if;
 update public.point_mail_outbox set updated_at=now()-interval '3 minutes',first_attempt_at=now()-interval '20 minutes'
 where richiesta_id=a.richiesta_id and tipo=a.tipo;
 if exists(select 1 from public.point_claim_confirmation()) then raise exception 'Ambiguous old send must not be retried'; end if;
 if not exists(select 1 from public.point_mail_outbox where richiesta_id=a.richiesta_id and tipo=a.tipo and stato='failed' and tentativi=3) then raise exception 'Expired uncertain send not flagged'; end if;
end $$;
reset role;
rollback;
