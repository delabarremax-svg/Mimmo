-- Migration prévue pour Supabase PostgreSQL. Non appliquée, non testée contre un serveur.
-- À exécuter uniquement après configuration réelle de Supabase Auth.
begin;
create table public.properties (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 listing_url text not null check (listing_url ~ '^https?://'),
 created_at timestamptz not null default now()
);
create table public.property_facts (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.properties(id) on delete cascade,
 field_key text not null check (field_key in ('title','city','price','area','rooms','description')),
 value text,
 status text not null check(status in ('missing','estimated','listing','verified','conflicting')),
 source_reference text,
 document_id uuid,
 updated_at timestamptz not null default now(),
 unique(property_id,field_key),
 check ((status='missing' and value is null) or
        (status<>'missing' and value is not null and source_reference is not null and length(trim(value))>0 and length(trim(source_reference))>0)),
 check(status<>'verified' or document_id is not null)
);
create table public.documents (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.properties(id) on delete cascade,
 object_key text not null unique,
 media_type text not null,
 byte_size bigint not null check(byte_size>0),
 scan_status text not null default 'pending' check(scan_status in ('pending','clean','rejected')),
 created_at timestamptz not null default now(),
 unique(id,property_id)
);
alter table public.property_facts add constraint fact_document_same_property
 foreign key(document_id,property_id) references public.documents(id,property_id);
create index on public.properties(owner_id);
create index on public.documents(property_id);
alter table public.properties enable row level security;
alter table public.property_facts enable row level security;
alter table public.documents enable row level security;
revoke all on public.properties,public.property_facts,public.documents from anon;
grant select,insert,update,delete on public.properties to authenticated;
grant select,insert,update,delete on public.property_facts to authenticated;
grant select on public.documents to authenticated;
create policy owner_properties on public.properties for all to authenticated
 using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy read_facts on public.property_facts for select to authenticated
 using(exists(select 1 from public.properties p where p.id=property_id and p.owner_id=auth.uid()));
-- Un client ne peut jamais déclarer une vérification documentaire.
create policy insert_facts on public.property_facts for insert to authenticated
 with check(status<>'verified' and exists(select 1 from public.properties p where p.id=property_id and p.owner_id=auth.uid()));
create policy update_facts on public.property_facts for update to authenticated
 using(status<>'verified' and exists(select 1 from public.properties p where p.id=property_id and p.owner_id=auth.uid()))
 with check(status<>'verified' and exists(select 1 from public.properties p where p.id=property_id and p.owner_id=auth.uid()));
create policy delete_facts on public.property_facts for delete to authenticated
 using(status<>'verified' and exists(select 1 from public.properties p where p.id=property_id and p.owner_id=auth.uid()));
create policy read_documents on public.documents for select to authenticated
 using(exists(select 1 from public.properties p where p.id=property_id and p.owner_id=auth.uid()));
-- Création de documents et validation de faits : service serveur autorisé uniquement.
commit;
