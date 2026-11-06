// @vitest-environment node
import { expect, it } from "vitest";
import {
  contextualEvidence,
  hasConflict,
  cleanCaptureText,
  mergeDescriptions,
} from "../src/domain/capture-analysis";
import {
  blankReport,
  prepareImportedProperty,
  listingRecordSchema,
} from "../src/domain/listing-import";
import {
  packTranscripts,
  unpackTranscripts,
} from "../src/services/capture-transcripts";
const extract = (text: string, source = "capture-1.png", confidence = 92) =>
  contextualEvidence(text, source, "ocr", 1, confidence);
const value = (text: string, field: string) =>
  extract(text)
    .filter((e) => e.field === field)
    .map((e) => e.value);
it.each([
  ["Appartement à Lille", "Lille"],
  ["Maison T4 à Saint-Étienne", "Saint-Étienne"],
  ["Cet appartement est situé à Bordeaux, proche du tram.", "Bordeaux"],
  ["Au cœur de La Rochelle, proche du port.", "La Rochelle"],
  ["Lyon (69003)", "Lyon (69003)"],
])("recognizes an explicitly contextual locality in %s", (text, city) =>
  expect(value(text, "city")).toEqual([city]),
);
it("separates all money roles even on the same OCR line", () => {
  const text =
    "Prix de vente 245 000 € ; charges 90 € / mois ; taxe foncière 1200 € / an ; loyer 800 € / mois ; ancien prix 260000 € ; honoraires 12000 €";
  for (const [field, expected] of Object.entries({
    price: "245000",
    charges: "90 € / mois",
    propertyTax: "1200 € / an",
    rent: "800 € / mois",
    previousPrice: "260000",
  }))
    expect(value(text, field)).toEqual([expected]);
});
it("reads labels split onto the preceding line without borrowing unrelated context", () => {
  const text =
    "Prix de vente\n245000 €\nCharges mensuelles\n90 €\nTaxe foncière\n1200 €";
  expect(value(text, "price")).toEqual(["245000"]);
  expect(value(text, "charges")).toEqual(["90 € / mois"]);
  expect(value(text, "propertyTax")).toEqual(["1200 €"]);
});
it("separates living area, Carrez, floor, land and other surfaces", () => {
  const text =
    "Surface habitable 80 m² ; loi Carrez 75,5 m² ; surface au sol 95 m² ; terrain 300 m² ; terrasse 12 m²";
  for (const [field, expected] of Object.entries({
    area: "80",
    carrezArea: "75.5",
    floorArea: "95",
    landArea: "300",
    otherArea: "12",
  }))
    expect(value(text, field)).toEqual([expected]);
});
it("keeps a generic surface uncertain and rejects isolated numbers and per-square-metre prices", () => {
  expect(
    extract("Surface 80 m²").find((e) => e.field === "area")?.certainty,
  ).toBe("uncertain");
  expect(
    extract("48\n98000\n123 €\n80 m²\nPrix 5000 €/m²").filter((e) =>
      ["price", "area"].includes(e.field),
    ),
  ).toEqual([]);
});
it("does not turn decimal room counts, bedrooms, GES or browser numbers into room counts/DPE", () => {
  const text = "12:34\n98%\nAppartement 3,5 pièces\n2 chambres\nGES C\nDPE E";
  expect(value(text, "rooms")).toEqual([]);
  expect(value(text, "bedrooms")).toEqual(["2"]);
  expect(value(text, "dpe")).toEqual(["E"]);
});
it("preserves a negated amenity as a literal sentence", () =>
  expect(
    value("Appartement sans ascenseur et sans parking.", "features"),
  ).toEqual(["Appartement sans ascenseur et sans parking."]));
it("never promotes low-quality OCR into an automatically usable fact", () =>
  expect(
    extract("Prix 245000 €\nSurface habitable 80 m²", "floue.png", 40).every(
      (e) => e.certainty === "uncertain",
    ),
  ).toBe(true));
it("does not call title/description overlap or equivalent numeric/annual charges a conflict", () => {
  const a = extract(
    "Prix 245000 €\nSurface habitable 80 m²\nCharges 90 € / mois",
  );
  const b = extract(
    "Prix 245000,00 €\nSurface habitable 80,0 m²\nCharges annuelles 1080 €",
    "capture-2.png",
  );
  for (const field of ["price", "area", "charges"] as const)
    expect(
      hasConflict(
        field,
        [...a, ...b].filter((e) => e.field === field),
      ),
    ).toBe(false);
  expect(
    hasConflict(
      "description",
      extract("Une belle pièce principale lumineuse.").concat(
        extract("Une belle pièce principale lumineuse et un balcon.", "2.png"),
      ),
    ),
  ).toBe(false);
});
it("only flags incompatible reliable values from distinct sources for the same field", () => {
  expect(
    hasConflict("price", [
      ...extract("Prix 245000 €"),
      ...extract("Prix 255000 €", "2.png"),
    ]),
  ).toBe(true);
  expect(
    hasConflict("price", [
      ...extract("Prix 245000 €"),
      ...extract("Prix 255000 €", "2.png", 40),
    ]),
  ).toBe(false);
  expect(hasConflict("price", extract("Prix 245000 € ; Prix 255000 €"))).toBe(
    false,
  );
});
it("removes exact UI-only lines and overlaps while preserving original raw transcripts", async () => {
  const raw =
    "12:34\n98%\nSafari\nAppartement à Lille\nUne belle pièce principale lumineuse avec balcon.\nContacter";
  const pages = [
    {
      source: "01.png",
      page: 1,
      text: raw,
      method: "ocr" as const,
      confidence: 90,
    },
    {
      source: "02.png",
      page: 1,
      text: "Une belle pièce principale lumineuse avec balcon.\nLa cuisine est indépendante et équipée.",
      method: "ocr" as const,
      confidence: 90,
    },
  ];
  expect(cleanCaptureText(raw)).not.toContain("Safari");
  expect(cleanCaptureText(raw)).not.toContain("12:34");
  const description = mergeDescriptions(pages);
  expect(description.match(/Une belle pièce/g)).toHaveLength(1);
  expect(description).toContain("La cuisine");
  const archive = await packTranscripts(pages);
  expect(await unpackTranscripts(archive)).toEqual(pages);
  const url = "https://agency.example/listing";
  const p = prepareImportedProperty(
    url,
    { price: "245000" },
    extract("Prix 245000 €"),
    { ...blankReport(url), transcripts: archive },
  );
  expect(listingRecordSchema.safeParse(p.listingImport).success).toBe(true);
  expect((await unpackTranscripts(p.listingImport!.transcripts!))[0].text).toBe(
    raw,
  );
});
it("reads split rooms and DPE labels but does not read the whole energy scale as a class", () => {
  expect(value("Nombre de pièces\n3\nDPE\nD\nGES E", "rooms")).toEqual(["3"]);
  expect(value("DPE\nD\nGES E", "dpe")).toEqual(["D"]);
  expect(value("DPE\nA\nB\nC\nD", "dpe")).toEqual([]);
});
it("rejects mixed OCR alphanumeric amounts instead of extracting their numeric tail", () => {
  expect(
    extract("Prix 24O000 €\nSurface habitable 8O0 m²").filter((e) =>
      ["price", "area"].includes(e.field),
    ),
  ).toEqual([]);
});
it("keeps a corrupted square-metre unit uncertain with its untouched original excerpt", () => {
  const candidate = extract("Surface habitable 51 m?").find(
    (e) => e.field === "area",
  );
  expect(candidate).toMatchObject({
    value: "51",
    certainty: "uncertain",
    excerpt: "Surface habitable 51 m?",
  });
});
it("keeps a late conflicting semantic value even when many overlapping sources repeat the first price", async () => {
  const { uniqueEvidence } = await import("../src/domain/listing-import");
  const proofs = Array.from({ length: 120 }, (_, i) =>
    extract("Prix 245000 €", "capture-" + i + ".png"),
  ).flat();
  proofs.push(...extract("Prix 255000 €", "derniere.png"));
  const selected = uniqueEvidence(proofs);
  expect(
    hasConflict(
      "price",
      selected.filter((e) => e.field === "price"),
    ),
  ).toBe(true);
});
