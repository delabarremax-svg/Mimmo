/** Local mobile acceptance test. Network/API fixtures are synthetic, never production data. */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:4175";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4175",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error("Serveur local indisponible");
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
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
  let stored = [],
    writes = 0,
    external = [];
  const errors = [];
  const report = (url) => ({
    url,
    platform: url.includes("leboncoin") ? "Leboncoin" : "Agence ou autre site",
    outcome: url.includes("leboncoin") ? "authorization_required" : "partial",
    code: url.includes("leboncoin") ? "authorization_required" : "read",
    attempted: !url.includes("leboncoin"),
    obtainedAt: new Date().toISOString(),
    message: url.includes("leboncoin")
      ? "Source sans autorisation : utilisez votre contenu."
      : "Annonce FICTIVE de test HTTP, aucune lecture d’agence réelle.",
    photos: [],
    evidence: url.includes("leboncoin")
      ? []
      : [
          {
            field: "title",
            value: "[FICTIF] Appartement à relire",
            excerpt: "[FICTIF] Appartement à relire",
            source: url,
            method: "jsonld",
          },
          {
            field: "price",
            value: "155000",
            excerpt: "Prix 155000 EUR",
            source: url,
            method: "jsonld",
          },
        ],
  });
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== base && !["data:", "blob:"].includes(url.protocol)) {
      external.push(url.origin);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let value;
    if (url.pathname === "/api/session")
      value = { user: { email: "owner-fictitious@example.invalid" } };
    else if (url.pathname === "/api/properties" && req.method() === "GET")
      value = { properties: stored };
    else if (url.pathname === "/api/import-listing")
      value = report(req.postDataJSON().url);
    else if (url.pathname === "/api/properties" && req.method() === "PUT") {
      const property = { ...req.postDataJSON(), version: 1 };
      stored.push(property);
      writes++;
      value = { property };
    } else throw new Error("API de test inattendue");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("work", { recursive: true });
  await page.goto(base);
  await page.getByRole("button", { name: /Ajouter mon premier bien/ }).click();
  await page
    .getByLabel("URL de l’annonce", { exact: true })
    .fill("https://agency.example/annonce-test");
  await page
    .getByRole("button", { name: "Lire l’annonce", exact: true })
    .click();
  await page.getByLabel("Prix (€)", { exact: true }).waitFor();
  if (writes) throw new Error("Écriture avant relecture");
  await page.getByLabel("Prix (€)", { exact: true }).fill("150000");
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw new Error("Débordement mobile");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "work/import-review-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Enregistrer dans mes biens" })
    .click();
  await page
    .getByRole("heading", {
      name: "[FICTIF] Appartement à relire",
      exact: true,
    })
    .waitFor();
  if (
    writes !== 1 ||
    stored[0].facts.price.value !== "150000" ||
    stored[0].facts.price.status !== "estimated"
  )
    throw new Error("Relecture non préservée");
  await page.reload();
  await page
    .getByRole("button", { name: /Mes biens/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Voir le projet" }).first().click();
  await page
    .getByRole("heading", {
      name: "[FICTIF] Appartement à relire",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: /Mes biens/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Ajouter un bien/ })
    .first()
    .click();
  await page
    .getByLabel("URL de l’annonce", { exact: true })
    .fill("https://www.leboncoin.fr/ad/123");
  await page
    .getByRole("button", { name: "Lire l’annonce", exact: true })
    .click();
  await page
    .getByText("Source sans autorisation : utilisez votre contenu.")
    .waitFor();
  if (writes !== 1) throw new Error("Écriture lors du repli");
  // Real OCR engine, locally generated screenshot; API remains a synthetic local fixture.
  const fixture = await context.newPage();
  await fixture.setViewportSize({ width: 750, height: 650 });
  await fixture.setContent(
    '<body style="font:32px Arial;background:white;color:black;padding:30px"><h1>Appartement FICTIF OCR</h1><p>Ville : Lille</p><p>Prix 155000 euros</p><p>3 pieces</p><p>DPE : D</p><p>Charges : 90 euros par mois</p></body>',
  );
  await fixture.screenshot({
    path: "work/import-capture-fictive.png",
    fullPage: true,
  });
  const jpeg = await fixture.screenshot({
    type: "jpeg",
    quality: 95,
    fullPage: false,
  });
  const draw = "q 750 0 0 650 0 0 cm /Im0 Do Q\n";
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Count 1 /Kids [3 0 R] >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 750 650] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 750 /Height 650 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from(
      `<< /Length ${Buffer.byteLength(draw)} >>\nstream\n${draw}endstream`,
    ),
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(length);
    const part = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    ]);
    chunks.push(part);
    length += part.length;
  });
  const xref = length;
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
          .join("") +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
    ),
  );
  await writeFile("work/import-scan-fictif.pdf", Buffer.concat(chunks));
  await fixture.close();
  await page
    .getByLabel("Lire un PDF ou une capture", { exact: true })
    .setInputFiles("work/import-capture-fictive.png");
  await page
    .getByText("Lecture terminée.", { exact: false })
    .waitFor({ timeout: 120000 });
  if (
    (await page.getByLabel("Prix (€)", { exact: true }).inputValue()) !==
    "155000"
  )
    throw new Error("OCR réel non intégré");
  await page
    .getByRole("button", { name: "Enregistrer dans mes biens" })
    .click();
  await page
    .getByRole("heading", { name: "Appartement FICTIF OCR", exact: true })
    .waitFor();
  if (
    writes !== 2 ||
    !stored[1].facts.price.source.includes(
      "import-capture-fictive.png · page 1",
    )
  )
    throw new Error("Provenance OCR manquante");
  await page
    .getByRole("button", { name: /Mes biens/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Ajouter un bien/ })
    .first()
    .click();
  await page
    .getByLabel("URL de l’annonce", { exact: true })
    .fill("https://www.leboncoin.fr/ad/scan-test");
  await page
    .getByRole("button", { name: "Lire l’annonce", exact: true })
    .click();
  await page
    .getByText("Source sans autorisation : utilisez votre contenu.")
    .waitFor();
  await page
    .getByLabel("Lire un PDF ou une capture", { exact: true })
    .setInputFiles("work/import-scan-fictif.pdf");
  await page
    .getByText("Lecture terminée.", { exact: false })
    .waitFor({ timeout: 120000 });
  if (
    (await page.getByLabel("Prix (€)", { exact: true }).inputValue()) !==
    "155000"
  )
    throw new Error("OCR réel du PDF scanné non intégré");
  await page
    .getByRole("button", { name: "Enregistrer dans mes biens" })
    .click();
  await page
    .getByRole("heading", { name: "Appartement FICTIF OCR", exact: true })
    .waitFor();
  if (
    writes !== 3 ||
    !stored[2].facts.price.source.includes("import-scan-fictif.pdf · page 1")
  )
    throw new Error("Provenance du PDF scanné perdue");
  if (errors.length || external.length)
    throw new Error("Erreur navigateur ou tentative externe non autorisée");
  console.log(
    "Import/relecture/correction/sauvegarde/reprise + repli portail/OCR image et PDF scanné réels : réussi à 320/390/430/1280px. API et biens fictifs locaux, aucun enregistrement distant.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
