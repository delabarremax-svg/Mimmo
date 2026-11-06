/** Real browser OCR on an explicitly synthetic listing; no model or remote database. */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
const base = "http://127.0.0.1:4174";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4174",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) throw new Error("Serveur local indisponible");
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Serveur local indisponible");
  browser = await chromium.launch(
    process.env.MIMMO_CHROMIUM
      ? { executablePath: process.env.MIMMO_CHROMIUM, args: ["--no-sandbox"] }
      : {},
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const external = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || ["data:", "blob:"].includes(url.protocol))
      return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  await page.setContent(
    '<html lang="fr"><body style="font:28px Arial;background:white;color:black;padding:24px;width:650px"><h1>ANNONCE FICTIVE</h1><p>Appartement 3 pièces</p><p>Surface habitable 62,5 m²</p><p>Prix 240 000 €</p><p>Charges 100 € par mois</p></body></html>',
  );
  await mkdir("work", { recursive: true });
  await page.setViewportSize({ width: 750, height: 650 });
  await page.screenshot({ path: "work/annonce-fictive.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("button", { name: "Charger les deux projets fictifs" })
    .click();
  await page.getByRole("button", { name: "Voir le projet" }).first().click();
  await page
    .getByLabel("Lire un PDF ou une capture", { exact: true })
    .setInputFiles("work/annonce-fictive.png");
  await page
    .getByText("Lecture terminée.", { exact: false })
    .waitFor({ timeout: 120000 });
  await page.getByText("Page 1 ·", { exact: false }).click();
  await page
    .getByRole("button", { name: "Proposer les champs de cette annonce" })
    .click();
  await page.getByText("Prix demandé (€) : 240000", { exact: true }).waitFor();
  if (await page.getByText("Prix demandé (€) : 100", { exact: true }).count())
    throw new Error("Charges proposées comme prix");
  await page.getByRole("button", { name: "Intégrer ce champ" }).first().click();
  await page
    .getByText("Contradiction conservée dans la provenance.", { exact: true })
    .waitFor();
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw new Error("Débordement mobile");
  if (errors.length || external.length)
    throw new Error("Erreur navigateur ou tentative de requête externe");
  console.log(
    "OCR français réel → candidats → intégration avec contradiction : réussi à 390px. Aucun appel IA ni sauvegarde distante.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
