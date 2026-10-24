import { spawn } from "node:child_process";
import { readFile, appendFile } from "node:fs/promises";
const preview = process.argv.includes("--ux-preview");
const v1 = process.argv.includes("--v1-preview");
const config = v1
  ? "deploy/wrangler-v1-demo.json"
  : preview
    ? "deploy/wrangler-ux.json"
    : "deploy/wrangler.json";
const workerName = v1
  ? "mimmo-v1-privee"
  : preview
    ? "mimmo-demo-ux"
    : "mimmo-demo-privee";
const password = process.env.DEMO_PASSWORD;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (
  !process.env.CLOUDFLARE_API_TOKEN ||
  !/^[a-f0-9]{32}$/i.test(account ?? "") ||
  !/^[\x21-\x7e]{20,256}$/.test(password ?? "")
) {
  throw new Error(
    "Configurez CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID et DEMO_PASSWORD (20 à 256 caractères ASCII sans espaces) dans les secrets GitHub.",
  );
}
if (process.env.CONFIRM_FREE_PLAN !== "true")
  throw new Error("Confirmez le plan Workers Free avant le déploiement.");
async function wrangler(args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/wrangler/bin/wrangler.js", ...args],
      { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      // Never output raw remote logs: deployment errors should not expose secrets.
      if (code !== 0)
        reject(
          new Error(
            "Cloudflare a refusé une étape. Vérifiez les permissions du jeton, le compte et le sous-domaine workers.dev. Les fichiers restent protégés, même sans secret.",
          ),
        );
      else resolve(output);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin ?? "");
  });
}
// Missing secrets close access (503); there is no public interval during first deployment.
const output = await wrangler(["deploy", "--config", config]);
const url = output.match(
  new RegExp("https://" + workerName + "\\.[a-z0-9-]+\\.workers\\.dev\\b", "i"),
)?.[0];
if (!url)
  throw new Error(
    "Adresse Cloudflare non détectée. Consulter le Worker dans le tableau de bord, sans ouvrir ses paramètres au public.",
  );
await wrangler(
  ["secret", "bulk", "--config", config],
  JSON.stringify({ DEMO_PASSWORD: password }),
);
const html = await readFile("dist/index.html", "utf8");
const files = [
  "/",
  ...(v1
    ? [
        "/pdf.worker.mjs",
        "/ocr/worker.min.js",
        "/ocr/lang/fra.traineddata.gz",
        "/ocr/core/tesseract-core-lstm.wasm.js",
      ]
    : []),
  ...Array.from(
    html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g),
    (match) => match[1],
  ),
];
async function verify() {
  for (const path of files) {
    const anonymous = await fetch(`${url}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (anonymous.status !== 401)
      throw new Error(
        "La vérification de protection anonyme a échoué. Aucun lien validé.",
      );
    const authorized = await fetch(`${url}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${Buffer.from(`mimmo:${password}`).toString("base64")}`,
      },
    });
    if (
      authorized.status !== 200 ||
      authorized.headers.get("Cache-Control") !== "private, no-store"
    )
      throw new Error("La vérification de l’accès autorisé a échoué.");
  }
}
let verified = false;
for (let attempt = 0; attempt < 8; attempt++) {
  try {
    await verify();
    verified = true;
    break;
  } catch {
    if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
if (!verified)
  throw new Error(
    "Déploiement envoyé, mais accès non validé après propagation. Consulter Cloudflare sans changer la protection.",
  );
console.log(`Démonstration privée vérifiée : ${url}`);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## MIMMO · démonstration privée\n\n[Ouvrir MIMMO dans Safari](${url})\n\nIdentifiant : **mimmo**. Mot de passe : celui enregistré dans DEMO_PASSWORD.\n\nHTML, JavaScript et CSS refusés sans authentification (401), accessibles avec identifiants (200). Les saisies sont en mémoire et disparaissent au rechargement.\n`,
  );
