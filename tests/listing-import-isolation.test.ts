// @vitest-environment node
import {
  packTranscripts,
  unpackTranscripts,
} from "../src/services/capture-transcripts";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import {
  blankReport,
  textEvidence,
  prepareImportedProperty,
} from "../src/domain/listing-import";
it("keeps imported evidence and DPE private through the real PostgreSQL RPC and RLS across two identities", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
    );
    await db.exec(readFileSync("database/002_private_projects.sql", "utf8"));
    await db.exec(
      readFileSync("database/004_investment_provenance.sql", "utf8"),
    );
    const alice = crypto.randomUUID(),
      bob = crypto.randomUUID();
    await db.query("insert into auth.users(id) values($1),($2)", [alice, bob]);
    const url = "https://agency.example/fictitious",
      evidence = textEvidence(
        "Appartement FICTIF\nPrix 155000 €\nDPE : D",
        url,
        "pdf",
        2,
      ),
      p = prepareImportedProperty(
        url,
        { title: "FICTIF privé", price: "155000", dpe: "D" },
        evidence,
        {
          ...blankReport(url),
          transcripts: await packTranscripts([
            {
              source: "capture-synthetique.png",
              page: 1,
              text: "Prix 155000 €\nTexte brut privé synthétique",
              method: "ocr",
              confidence: 90,
            },
          ]),
        },
      );
    await db.exec("begin; set local role authenticated;");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      alice,
    ]);
    await db.query("select public.save_private_project($1,0,$2::jsonb)", [
      p.id,
      JSON.stringify(p),
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [bob]);
    expect(
      (await db.query("select payload from public.private_projects")).rows,
    ).toEqual([]);
    await db.exec("savepoint foreign_write");
    await expect(
      db.query("select public.save_private_project($1,1,$2::jsonb)", [
        p.id,
        JSON.stringify(p),
      ]),
    ).rejects.toThrow();
    await db.exec("rollback to foreign_write");
    expect(
      (
        await db.query(
          "delete from public.private_projects where id=$1 returning id",
          [p.id],
        )
      ).rows,
    ).toEqual([]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      alice,
    ]);
    const rows = (
      await db.query<{ payload: typeof p }>(
        "select payload from public.private_projects where id=$1",
        [p.id],
      )
    ).rows;
    expect(rows[0].payload.facts.price.value).toBe("155000");
    expect(
      (await unpackTranscripts(rows[0].payload.listingImport!.transcripts!))[0],
    ).toMatchObject({
      source: "capture-synthetique.png",
      text: "Prix 155000 €\nTexte brut privé synthétique",
    });
    expect(rows[0].payload.listingImport?.evidence[0].source).toBe(url);
    expect(rows[0].payload.investment?.observations[0]).toMatchObject({
      label: "DPE",
      page: 2,
      value: "D",
    });
    await db.exec("rollback");
  } finally {
    await db.close();
  }
}, 30000);
