-- New isolated aggregate; does not modify the mission-1 tables or demo.
begin;
create table public.private_projects (
 id uuid primary key,
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 payload jsonb not null,
 version integer not null default 1 check(version > 0),
 updated_at timestamptz not null default now(),
 check(payload->>'id' = id::text),
 check(jsonb_typeof(payload->'facts') = 'object'),
 check(not jsonb_path_exists(payload, '$.facts.* ? (@.status == "verified")'))
);
create index private_projects_owner on public.private_projects(owner_id);
alter table public.private_projects enable row level security;
alter table public.private_projects force row level security;
revoke all on public.private_projects from public, anon, authenticated;
grant select,delete on public.private_projects to authenticated;
create policy own_projects on public.private_projects for all to authenticated
 using(owner_id = (select auth.uid())) with check(owner_id = (select auth.uid()));
-- Invoker can only read/delete directly; writes must pass validation and version checks.
create function public.save_private_project(project_id uuid, expected_version integer, project_payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_version integer; f jsonb; k text;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if project_payload->>'id' is distinct from project_id::text
 or length(project_payload::text)>60000
 or jsonb_typeof(project_payload->'url') is distinct from 'string'
 or project_payload->>'url' !~ '^https?://'
 or length(project_payload->>'url')>8000
 or jsonb_typeof(project_payload->'facts') is distinct from 'object'
 or (select count(*) from jsonb_object_keys(project_payload->'facts')) <> 6
 then raise check_violation; end if;
 foreach k in array array['title','city','price','area','rooms','description'] loop
 f := project_payload->'facts'->k;
 if f is null or jsonb_typeof(f->'value') is distinct from 'string'
 or jsonb_typeof(f->'source') is distinct from 'string'
 or f->>'status' is null or f->>'status' not in ('missing','estimated','listing','conflicting')
 or length(f->>'value')>4000 or length(f->>'source')>2000
 or (f->>'status'='missing' and f->>'value'<>'')
 or (f->>'status'<>'missing' and (length(trim(f->>'value'))=0 or length(trim(f->>'source'))=0))
 then raise check_violation; end if;
 end loop;
 if expected_version=0 then
   insert into public.private_projects(id,owner_id,payload) values(project_id,auth.uid(),project_payload);
   return 1;
 end if;
 update public.private_projects set payload=project_payload,version=version+1,updated_at=now()
 where id=project_id and owner_id=auth.uid() and version=expected_version returning version into next_version;
 if next_version is null then raise exception 'conflict' using errcode='40001'; end if;
 return next_version;
end $$;
revoke all on function public.save_private_project(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_private_project(uuid,integer,jsonb) to authenticated;
commit;
