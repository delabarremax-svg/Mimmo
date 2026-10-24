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
  async function analyze(body) {
    const r = await fetch(new URL("/demo-api/analyze", base), {
      method: "POST",
      headers: {
        Authorization: auth,
        Origin: new URL(base).origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    const d = await r.json();
    if (!r.ok)
      throw new Error(
        "Test IA fictif refusé : HTTP " +
          r.status +
          " [" +
          (d.code || "unknown") +
          "]" +
          " · " +
          (d.error || "erreur"),
      );
    if (!Array.isArray(d.findings) || d.status !== "estimated")
      throw new Error("Contrat IA invalide.");
    return d;
  }
  const text = await analyze({
    source: "PV FICTIF MIMMO",
    page: 2,
    text: "Exercice fictif. Des travaux de toiture ont été votés. Le montant du devis est manquant.",
    consent: true,
  });
  console.log(
    "IA texte fictif : contrat et citations validés, " +
      text.findings.length +
      " proposition(s).",
  );
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 140;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 400, 140);
    ctx.fillStyle = "black";
    ctx.font = "23px Arial";
    ctx.fillText("DOCUMENT FICTIF MIMMO", 20, 60);
    return c.toDataURL("image/jpeg", 0.5).split(",")[1];
  });
  const vision = await analyze({
    source: "CAPTURE SYNTHÉTIQUE MIMMO",
    page: 1,
    text: "Capture synthétique sans bien réel.",
    image,
    consent: true,
  });
  console.log(
    "IA image synthétique : contrat validé, " +
      vision.findings.length +
      " proposition(s).",
  );
  if (errors.length) throw new Error("Erreur JavaScript détectée.");
  console.log(
    "Parcours privé mobile, téléchargement PDF, lecture PDF et deux appels IA fictifs validés. Aucun compte ni donnée de projet créé en base.",
  );
} finally {
  await browser.close();
}
