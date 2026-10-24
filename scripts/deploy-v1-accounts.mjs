import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
const config = "deploy/wrangler-v1-accounts.json";
const settings = JSON.parse(await readFile(config, "utf8"));
if (
  settings.name !== "mimmo-v1-comptes-privee" ||
  settings.vars.SUPABASE_URL !== "https://nfhkfjtyfojiwajvbukk.supabase.co" ||
  !settings.vars.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")
)
  throw new Error("Cible non autorisée.");
if (
  process.env.CONFIRM_FREE_PLAN !== "true" ||
  !process.env.CLOUDFLARE_API_TOKEN ||
  !process.env.CLOUDFLARE_ACCOUNT_ID ||
  !/^[\x21-\x7e]{20,256}$/.test(process.env.DEMO_PASSWORD || "")
)
  throw new Error("Configuration privée manquante. Aucun déploiement.");
function wrangler(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/wrangler/bin/wrangler.js", ...args],
      { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              "Configuration Cloudflare refusée. Aucun autre Worker ni plan modifié.",
            ),
          ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
// Missing DEMO_PASSWORD or session secret fails closed during first publication.
const output = await wrangler(["deploy", "--config", config]);
const listed = JSON.parse(
  await wrangler(["secret", "list", "--config", config]),
);
const secrets = { DEMO_PASSWORD: process.env.DEMO_PASSWORD };
if (!listed.some((s) => s.name === "SESSION_KEY"))
  secrets.SESSION_KEY = randomBytes(48).toString("base64url");
// Existing SESSION_KEY is preserved across deployments; it is never read or logged.
await wrangler(["secret", "bulk", "--config", config], JSON.stringify(secrets));
const url = output.match(
  /https:\/\/mimmo-v1-comptes-privee\.[a-z0-9-]+\.workers\.dev\b/i,
)?.[0];
if (!url) throw new Error("Adresse non détectée.");
const auth =
  "Basic " +
  Buffer.from("mimmo:" + process.env.DEMO_PASSWORD).toString("base64");
const html = await readFile("dist/index.html", "utf8");
const paths = [
  "/",
  "/api/session",
  ...Array.from(
    html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g),
    (m) => m[1],
  ),
];
let verified = false;
for (let attempt = 0; attempt < 8; attempt++) {
  try {
    for (const path of paths) {
      const anonymous = await fetch(url + path, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      if (anonymous.status !== 401) throw new Error("Protection absente.");
      const r = await fetch(url + path, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: auth },
      });
      if (r.status !== (path === "/api/session" ? 401 : 200))
        throw new Error("Service indisponible.");
    }
    verified = true;
    break;
  } catch {
    if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
if (!verified)
  throw new Error(
    "Aperçu envoyé, mais protection et API non validées. Ne pas l’utiliser.",
  );
console.log("Aperçu comptes privé vérifié : " + url);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `\nEspace comptes privé : ${url}\n\nProtection externe vérifiée (401), API sans session refusée (401). Email/Auth Supabase et parcours de deux comptes restent à valider avant utilisation réelle.\n`,
  );
