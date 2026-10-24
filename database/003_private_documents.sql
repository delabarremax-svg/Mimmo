-- Additive migration. No existing bucket or object is changed or deleted.
begin;
do $$ begin
 if exists(select 1 from storage.buckets where id='mimmo-documents' and public) then
  raise exception 'Existing bucket is public; review required';
 end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mimmo-documents','mimmo-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy mimmo_documents_read on storage.objects for select to authenticated
using(bucket_id='mimmo-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.private_projects p where p.id::text=(storage.foldername(name))[2] and p.owner_id=(select auth.uid())));
create policy mimmo_documents_insert on storage.objects for insert to authenticated
with check(bucket_id='mimmo-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
 and array_length(storage.foldername(name),1)=2
 and exists(select 1 from public.private_projects p where p.id::text=(storage.foldername(name))[2] and p.owner_id=(select auth.uid())));
-- No upsert, update, anonymous access, public URL or broad deletion grant.
commit;
