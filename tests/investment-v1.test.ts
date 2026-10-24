import { it, expect } from "vitest";
import { createProperty } from "../src/domain/property";
import {
  emptyInvestment,
  worksBudget,
  marketRange,
  projectRisks,
  progress,
  investmentSchema,
} from "../src/domain/investment";
import { extractListingText, extractJsonLd } from "../src/domain/extraction";
import { createReportPdf, reportLines } from "../src/domain/report";
import { demoProjects } from "../src/domain/demo";
it("extracts only explicit text numbers and retains excerpts", () => {
  const r = extractListingText(
    "Appartement 3 pièces, 62,5 m² proposé à 240 000 €",
  );
  expect(r).toContainEqual({
    field: "price",
    value: "240000",
    excerpt: "240 000 €",
  });
  expect(r).toContainEqual({
    field: "area",
    value: "62.5",
    excerpt: "62,5 m²",
  });
  expect(r.find((x) => x.field === "rooms")?.value).toBe("3");
  expect(extractListingText("Contactez notre agence.")).toEqual([]);
});
it("handles malformed or unsupported structured data without fabricating facts", () => {
  expect(() => extractJsonLd("<html>")).toThrow();
  expect(extractJsonLd('{"@type":"Thing","price":42}')).toEqual([]);
  expect(
    extractJsonLd('{"@type":"Offer","price":42,"priceCurrency":"USD"}'),
  ).toEqual([]);
});
it("extracts EUR offers and metric floor areas only", () => {
  const r = extractJsonLd(
    JSON.stringify({
      "@type": "Apartment",
      floorSize: { value: 50, unitCode: "MTK" },
      offers: { "@type": "Offer", price: 123456, priceCurrency: "EUR" },
    }),
  );
  expect(r.find((x) => x.field === "area")?.value).toBe("50");
  expect(r.find((x) => x.field === "price")?.value).toBe("123456");
});
it("adds contingencies and retains separate artisan and DIY assumptions", () => {
  const w = {
    id: crypto.randomUUID(),
    label: "Peinture",
    quantity: 10,
    artisanUnit: 5000,
    diyUnit: 2000,
    source: "Devis test",
    contingency: 15,
  };
  expect(worksBudget([w], "artisan")).toBe(57500);
  expect(worksBudget([w], "diy")).toBe(23000);
});
it("does not estimate market rent without comparables and target area", () => {
  expect(marketRange([], 45)).toBeUndefined();
  expect(marketRange([], 0)).toBeUndefined();
});
it("reports a transparent comparable range with low confidence", () => {
  const cs = [100000, 120000, 140000].map((r) => ({
    id: crypto.randomUUID(),
    monthlyRent: r,
    area: 50,
    source: "https://example.invalid",
    date: "2026-10-24",
    note: "Test",
  }));
  expect(marketRange(cs, 25)).toEqual({
    low: 50000,
    median: 60000,
    high: 70000,
    count: 3,
    confidence: "Faible",
  });
});
it("keeps evidence source and page on detected concerns", () => {
  const p = createProperty("https://example.invalid");
  const w = emptyInvestment();
  w.observations.push({
    id: crypto.randomUUID(),
    kind: "ag",
    label: "Toiture",
    value: "Travaux votés de toiture",
    source: "PV fictif",
    page: 4,
    excerpt: "Toiture à reprendre",
    status: "extracted",
    date: new Date().toISOString(),
  });
  expect(projectRisks(p, w)).toContainEqual(
    expect.objectContaining({ source: "PV fictif", page: 4, title: "Toiture" }),
  );
  expect(progress(p, w).done).toBe(0);
});
it("forbids fake verified observations in the persisted workspace schema", () => {
  const w = emptyInvestment();
  expect(
    investmentSchema.safeParse({
      ...w,
      observations: [
        {
          id: crypto.randomUUID(),
          kind: "dpe",
          label: "x",
          value: "x",
          source: "x",
          excerpt: "x",
          status: "verified",
          date: new Date().toISOString(),
        },
      ],
    }).success,
  ).toBe(false);
});
it("builds an actual PDF and states incomplete assumptions", async () => {
  const p = createProperty("https://example.invalid");
  expect(reportLines(p).join("\n")).toContain("aucun resultat calcule");
  const blob = createReportPdf(p);
  expect(blob.type).toBe("application/pdf");
  expect(blob.size).toBeGreaterThan(1000);
});
it("labels all explicitly loaded demo projects as fictitious", () => {
  const ps = demoProjects();
  expect(ps).toHaveLength(2);
  for (const p of ps) {
    expect(p.facts.title.value).toContain("[FICTIF]");
    expect(investmentSchema.safeParse(p.investment).success).toBe(true);
    expect(p.url).toContain("example.invalid");
  }
});
