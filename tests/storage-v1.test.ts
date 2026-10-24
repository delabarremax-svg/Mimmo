// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect, beforeAll, afterAll } from "vitest";
let db: PGlite;
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  project = "33333333-3333-4333-8333-333333333333";
async function asUser(id: string, query: string, args: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  return db.query(query, args);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role authenticated; create role anon; create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; create table public.private_projects(id uuid,owner_id uuid); insert into public.private_projects values('${project}','${alice}'); grant select on public.private_projects to authenticated; alter table public.private_projects enable row level security; create policy own on public.private_projects to authenticated using(owner_id=auth.uid()); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id integer generated always as identity,bucket_id text,name text); create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$; alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant execute on function storage.foldername(text) to authenticated,anon; grant select,insert on storage.objects to authenticated; grant usage on sequence storage.objects_id_seq to authenticated;`,
  );
  await db.exec(readFileSync("database/003_private_documents.sql", "utf8"));
}, 30000);
afterAll(async () => db.close());
it("creates only a private bounded bucket", async () => {
  const r = await db.query(
    "select public,file_size_limit from storage.buckets",
  );
  expect(r.rows).toEqual([{ public: false, file_size_limit: 10485760 }]);
});
it("Alice uploads and reads a document under her own project", async () => {
  await asUser(
    alice,
    "insert into storage.objects(bucket_id,name) values($1,$2)",
    ["mimmo-documents", alice + "/" + project + "/test.pdf"],
  );
  expect(
    (await asUser(alice, "select * from storage.objects")).rows,
  ).toHaveLength(1);
});
it("Bob cannot read Alice files", async () => {
  expect(
    (await asUser(bob, "select * from storage.objects")).rows,
  ).toHaveLength(0);
});
it("Bob cannot upload under Alice path or own folder with Alice project", async () => {
  await expect(
    asUser(bob, "insert into storage.objects(bucket_id,name) values($1,$2)", [
      "mimmo-documents",
      alice + "/" + project + "/intrusion.pdf",
    ]),
  ).rejects.toThrow();
  await expect(
    asUser(bob, "insert into storage.objects(bucket_id,name) values($1,$2)", [
      "mimmo-documents",
      bob + "/" + project + "/intrusion.pdf",
    ]),
  ).rejects.toThrow();
});
it("rejects orphan projects and extra folder depth", async () => {
  await expect(
    asUser(alice, "insert into storage.objects(bucket_id,name) values($1,$2)", [
      "mimmo-documents",
      alice + "/44444444-4444-4444-8444-444444444444/orphan.pdf",
    ]),
  ).rejects.toThrow();
  await expect(
    asUser(alice, "insert into storage.objects(bucket_id,name) values($1,$2)", [
      "mimmo-documents",
      alice + "/" + project + "/extra/deep.pdf",
    ]),
  ).rejects.toThrow();
});
it("anonymous cannot read files", async () => {
  await db.exec("reset role; set role anon");
  await expect(db.query("select * from storage.objects")).rejects.toThrow();
});
