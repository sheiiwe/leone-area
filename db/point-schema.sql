begin;
create table public.point_servizi (
 id text primary key, slug text not null unique check(slug ~ '^[a-z0-9-]+$'),
 titolo text not null check(length(titolo) between 2 and 180), partner text not null,
 categoria text not null, tipo text not null default 'Servizio' check(tipo in ('Servizio','Convenzione')),
 descrizione text not null, requisiti text not null default '',
 fonte_url text not null, attivo boolean not null default true,
 da_verificare boolean not null default false, ordinamento integer not null default 0,
 verificato_il date not null default current_date, updated_at timestamptz not null default now()
);
create table public.point_richieste (
 id uuid primary key default gen_random_uuid(), servizio_id text not null references public.point_servizi(id),
 ragione_sociale text not null check(length(trim(ragione_sociale)) between 2 and 180),
 referente text not null check(length(trim(referente)) between 2 and 120),
 email text not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 telefono text not null check(length(telefono) between 6 and 30),
 partita_iva text not null default '' check(partita_iva='' or partita_iva ~ '^[0-9]{11}$'),
 citta text not null default '' check(length(citta)<=100),
 messaggio text not null default '' check(length(messaggio)<=2000),
 partner_richiesto text not null default '', titolo_richiesto text not null default '',
 consenso boolean not null check(consenso=true),
 privacy_version text not null default 'point-2026-09-15-v1' check(privacy_version='point-2026-09-15-v1'),
 stato text not null default 'Nuova' check(stato in ('Nuova','Da segnalare','Segnalata','Ricontattata','Conclusa','Archiviata')),
 note_admin text not null default '' check(length(note_admin)<=5000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.point_request_snapshot() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 select partner,titolo into new.partner_richiesto,new.titolo_richiesto from public.point_servizi where id=new.servizio_id and attivo and not da_verificare;
 if new.partner_richiesto is null then raise exception 'Servizio non disponibile'; end if;
 return new;
end;
$$;
revoke all on function public.point_request_snapshot() from public,anon,authenticated;
create trigger point_request_snapshot before insert on public.point_richieste for each row execute function public.point_request_snapshot();
create index point_richieste_servizio_idx on public.point_richieste(servizio_id);
create index point_richieste_date_idx on public.point_richieste(created_at desc);
alter table public.point_servizi enable row level security;
alter table public.point_richieste enable row level security;
revoke all on public.point_servizi,public.point_richieste from anon,authenticated;
grant select on public.point_servizi to anon,authenticated;
grant insert,update on public.point_servizi to authenticated;
grant insert(servizio_id,ragione_sociale,referente,email,telefono,partita_iva,citta,messaggio,consenso,privacy_version) on public.point_richieste to anon,authenticated;
grant select on public.point_richieste to authenticated;
grant update(stato,note_admin,updated_at) on public.point_richieste to authenticated;
create policy point_catalogo_pubblico on public.point_servizi for select to anon,authenticated using(attivo and not da_verificare);
create policy point_catalogo_admin_select on public.point_servizi for select to authenticated using((select public.is_admin()));
create policy point_catalogo_admin_insert on public.point_servizi for insert to authenticated with check((select public.is_admin()));
create policy point_catalogo_admin_update on public.point_servizi for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy point_richieste_invio on public.point_richieste for insert to anon,authenticated with check(
 consenso and stato='Nuova' and note_admin='' and privacy_version='point-2026-09-15-v1'
 and exists(select 1 from public.point_servizi s where s.id=servizio_id and s.attivo and not s.da_verificare)
);
create policy point_richieste_admin_read on public.point_richieste for select to authenticated using((select public.is_admin()));
create policy point_richieste_admin_update on public.point_richieste for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
comment on table public.point_servizi is 'Catalogo Conflavoro Point Leone Consulting; nessuna provvigione o informazione riservata.';
comment on table public.point_richieste is 'Richieste di ricontatto: leggibili e gestibili soltanto dall amministrazione Leone Consulting.';
commit;
