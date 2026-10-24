// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createProperty } from '../src/domain/property';
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
let db: PGlite;
const p = createProperty('https://example.com/annonce');
async function asUser(id: string, sql: string, args: unknown[] = []) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
  return db.query(sql, args);
}
beforeAll(async () => {
 db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${alice}'),('${bob}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
 await db.exec(readFileSync('database/002_private_projects.sql','utf8'));
 await db.exec(readFileSync('database/004_investment_provenance.sql','utf8'));
}, 30000);
afterAll(async () => db.close());
it('Alice saves, updates atomically, and detects stale versions', async () => {
 expect((await asUser(alice, 'select public.save_private_project($1,0,$2)', [p.id,p])).rows).toEqual([{save_private_project:1}]);
 expect((await asUser(alice, 'select public.save_private_project($1,1,$2)', [p.id,p])).rows).toEqual([{save_private_project:2}]);
 await expect(asUser(alice, 'select public.save_private_project($1,1,$2)', [p.id,p])).rejects.toThrow('conflict');
 expect((await asUser(alice,'select * from public.private_projects')).rows).toHaveLength(1);
});
it('Bob cannot read, overwrite, transfer or delete Alice’s project', async () => {
 expect((await asUser(bob,'select * from public.private_projects where id=$1',[p.id])).rows).toEqual([]);
 await expect(asUser(bob,'select public.save_private_project($1,2,$2)',[p.id,p])).rejects.toThrow('conflict');
 await expect(asUser(bob,'update public.private_projects set owner_id=$1 where id=$2',[bob,p.id])).rejects.toThrow();
 await asUser(bob,'delete from public.private_projects where id=$1',[p.id]);
 expect((await asUser(alice,'select * from public.private_projects')).rows).toHaveLength(1);
});
it('anonymous access and forged verified facts fail in PostgreSQL', async () => {
 await db.exec('reset role; set role anon');
 await expect(db.query('select * from public.private_projects')).rejects.toThrow();
 await expect(db.query('select public.save_private_project($1,0,$2)',[crypto.randomUUID(),p])).rejects.toThrow();
 const forged = structuredClone(p); forged.facts.title.status='verified';
 await expect(asUser(alice,'select public.save_private_project($1,2,$2)',[p.id,forged])).rejects.toThrow();
 const forgedObservation = {...p,investment:{observations:[{status:'verified',value:'forged'}]}};
 await expect(asUser(alice,'select public.save_private_project($1,2,$2)',[p.id,forgedObservation])).rejects.toThrow();
});
it('Bob can create his own project and Alice cannot read it; owner deletion persists', async () => {
 const own=createProperty('https://example.com/bob');
 await asUser(bob,'select public.save_private_project($1,0,$2)',[own.id,own]);
 expect((await asUser(alice,'select * from public.private_projects where id=$1',[own.id])).rows).toEqual([]);
 await asUser(alice,'delete from public.private_projects where id=$1',[p.id]);
 expect((await asUser(alice,'select * from public.private_projects')).rows).toEqual([]);
 expect((await asUser(bob,'select * from public.private_projects')).rows).toHaveLength(1);
});
