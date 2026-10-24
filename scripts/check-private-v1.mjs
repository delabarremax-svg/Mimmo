import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const base = process.env.MIMMO_TEST_URL;
if (!base || new URL(base).protocol !== "https:" || !process.env.DEMO_PASSWORD)
  throw new Error("Configuration de test privée absente.");
const browser = await chromium.launch(
  process.env.MIMMO_CHROMIUM
    ? { executablePath: process.env.MIMMO_CHROMIUM, args: ["--no-sandbox"] }
    : {},
);
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
    httpCredentials: { username: "mimmo", password: process.env.DEMO_PASSWORD },
  });
  // Exercise the PDF compatibility build without APIs missing on older Safari.
  await context.addInitScript(() => {
    Promise.withResolvers = undefined;
    URL.parse = undefined;
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("button", { name: "Charger les deux projets fictifs" })
    .click();
  await page.getByRole("button", { name: "Voir le projet" }).first().click();
  await page.getByRole("tab", { name: "Simulation", exact: true }).click();
  await page
    .getByText("Cash-flow mensuel avant impôts", { exact: true })
    .waitFor();
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw new Error("Débordement mobile.");
  await page.getByRole("tab", { name: "Synthèse & PDF", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Télécharger le dossier PDF" })
    .click();
  const download = await downloadPromise;
  await mkdir("work", { recursive: true });
  await download.saveAs("work/private-v1-report.pdf");
  await page
    .getByRole("tab", { name: "Sources & pièces", exact: true })
    .click();
  await page
    .getByLabel("Lire un PDF ou une capture", { exact: true })
    .setInputFiles("work/private-v1-report.pdf");
  await page
    .getByText("Lecture terminée.", { exact: false })
    .waitFor({ timeout: 30000 });
  const auth =
    "Basic " +
    Buffer.from("mimmo:" + process.env.DEMO_PASSWORD).toString("base64");
  const blocked = await fetch(new URL("/demo-api/analyze", base), {
    method: "POST",
    headers: {
      Authorization: auth,
      Origin: new URL(base).origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "TEST FICTIF MIMMO",
      page: 1,
      text: "Document synthétique.",
      consent: true,
    }),
  });
  const blockedResult = await blocked.json();
  if (blocked.status !== 503 || blockedResult.code !== "eu_ai_not_configured")
    throw new Error("Le verrou de traitement IA européen n’est pas effectif.");
  console.log("Verrou IA UE vérifié : aucune inférence externe activée.");
  if (errors.length) throw new Error("Erreur JavaScript détectée.");
  console.log(
    "Parcours privé mobile, téléchargement PDF, lecture PDF et verrou IA UE validés. Aucun compte ni donnée de projet créé en base.",
  );
} finally {
  await browser.close();
}
