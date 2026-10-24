// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("executes the exact self-contained RLS transaction and leaves no fixtures", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
    );
    await db.exec(readFileSync("database/002_private_projects.sql", "utf8"));
    await db.exec(
      readFileSync("database/004_investment_provenance.sql", "utf8"),
    );
    const result = await db.exec(
      readFileSync("tests/rls-transaction.sql", "utf8"),
    );
    const report = result.find(
      (r) => r.rows?.[0] && "passed_tests" in r.rows[0],
    );
    expect(report?.rows[0].passed_tests).toHaveLength(9);
    expect(
      (await db.query("select count(*)::int as n from auth.users")).rows,
    ).toEqual([{ n: 0 }]);
    expect(
      (await db.query("select count(*)::int as n from public.private_projects"))
        .rows,
    ).toEqual([{ n: 0 }]);
  } finally {
    await db.close();
  }
}, 30000);
