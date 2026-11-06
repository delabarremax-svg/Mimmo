/** Real HTTP on our own explicitly authorized fictitious listings, no external service. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { importListing } from "../server/listing";
const files: Record<string, string> = {
  "/import-examples/appartement-fictif.html":
    "public/import-examples/appartement-fictif.html",
  "/import-examples/maison-fictive.html":
    "public/import-examples/maison-fictive.html",
};
const server = createServer(async (req, res) => {
  const path = req.url || "";
  if (!files[path]) {
    res.writeHead(403);
    res.end("Accès de test refusé");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(await readFile(files[path]));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Serveur absent");
const origin = "http://127.0.0.1:" + address.port;
const results = [];
try {
  for (const path of Object.keys(files)) {
    const result = await importListing(origin + path, [], {
      origin,
      assets: { fetch: (request) => fetch(request) },
    });
    const fields = [...new Set(result.evidence.map((c) => c.field))];
    results.push({
      source: path,
      platform: result.platform,
      attempted: result.attempted,
      outcome: result.outcome,
      code: result.code,
      fields,
    });
  }
  const forbidden = await importListing(
    origin + "/import-examples/appartement-fictif.html",
    [],
    { origin, assets: { fetch: async () => fetch(origin + "/acces-refuse") } },
  );
  results.push({
    source: "Refus HTTP 403 réel de notre serveur de test",
    platform: forbidden.platform,
    attempted: forbidden.attempted,
    outcome: forbidden.outcome,
    code: forbidden.code,
    fields: [],
  });
  await mkdir("work", { recursive: true });
  await writeFile(
    "work/listing-network-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
  if (
    results
      .slice(0, 2)
      .some(
        (r) =>
          !r.fields.includes("price") ||
          !r.fields.includes("area") ||
          r.platform !== "Exemple MIMMO fictif",
      ) ||
    forbidden.code !== "access_blocked"
  )
    throw new Error(
      "Lecture HTTP locale de test à corriger. Aucun portail immobilier réel testé.",
    );
} finally {
  server.close();
}
