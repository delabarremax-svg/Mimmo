import { z } from "zod";
import {
  createProperty,
  validateFact,
  type Property,
  type FieldKey,
} from "./property";
import { emptyInvestment } from "./investment";
import {
  contextualEvidence,
  hasConflict,
  canonicalValue,
} from "./capture-analysis";
export const importLabels = {
  title: "Titre",
  city: "Localisation",
  price: "Prix (€)",
  area: "Surface (m²)",
  rooms: "Pièces",
  description: "Description",
  dpe: "DPE",
  charges: "Charges",
  propertyTax: "Taxe foncière",
  rent: "Loyer",
  previousPrice: "Ancien prix",
  carrezArea: "Surface Carrez (m²)",
  floorArea: "Surface au sol (m²)",
  landArea: "Terrain (m²)",
  otherArea: "Autres surfaces (m²)",
  bedrooms: "Chambres",
  features: "Caractéristiques relevées",
} as const;
export type ImportField = keyof typeof importLabels;
export const fieldLimits: Record<ImportField, number> = {
  title: 160,
  city: 160,
  price: 40,
  area: 40,
  rooms: 8,
  description: 4000,
  dpe: 80,
  charges: 160,
  propertyTax: 160,
  rent: 160,
  previousPrice: 40,
  carrezArea: 40,
  floorArea: 40,
  landArea: 40,
  otherArea: 40,
  bedrooms: 8,
  features: 1000,
};
export const evidenceSchema = z
  .object({
    field: z.enum([
      "title",
      "city",
      "price",
      "area",
      "rooms",
      "description",
      "dpe",
      "charges",
      "propertyTax",
      "rent",
      "previousPrice",
      "carrezArea",
      "floorArea",
      "landArea",
      "otherArea",
      "bedrooms",
      "features",
    ]),
    value: z.string().min(1).max(4000),
    source: z.string().min(1).max(500),
    excerpt: z.string().max(500),
    method: z.enum(["jsonld", "metadata", "text", "ocr", "pdf", "partner"]),
    page: z.number().int().min(1).max(10000).optional(),
    certainty: z.enum(["uncertain"]).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.value.length > fieldLimits[c.field])
      ctx.addIssue({ code: "custom", message: "Valeur trop longue" });
  });
export type ImportEvidence = z.infer<typeof evidenceSchema>;
export const photoLinkSchema = z
  .object({
    url: z
      .url({ protocol: /^https$/ })
      .max(1000)
      .refine((s) => {
        const u = new URL(s);
        return (
          !u.username &&
          !u.password &&
          !u.port &&
          !/^(?:\d|\[|localhost)/i.test(u.hostname) &&
          u.hostname.includes(".")
        );
      }),
    source: z.string().max(500),
  })
  .strict();
export const listingRecordSchema = z
  .object({
    platform: z.enum([
      "Leboncoin",
      "SeLoger",
      "Bien’ici",
      "Agence ou autre site",
      "Exemple MIMMO fictif",
    ]),
    obtainedAt: z.iso.datetime(),
    outcome: z.enum([
      "extracted",
      "partial",
      "authorization_required",
      "blocked",
      "unavailable",
    ]),
    attempted: z.boolean(),
    evidence: z.array(evidenceSchema).max(96),
    transcripts: z
      .object({
        encoding: z.literal("gzip-base64"),
        data: z.string().max(40000),
        pages: z.number().int().min(1).max(200),
      })
      .strict()
      .optional(),
    photos: z.array(photoLinkSchema).max(6),
  })
  .strict()
  .refine((v) => JSON.stringify(v).length <= 48000, "Import trop volumineux");
export type ListingRecord = z.infer<typeof listingRecordSchema>;
export type ImportReport = ListingRecord & {
  url: string;
  message: string;
  code: string;
};
export function detectPlatform(raw: string): ListingRecord["platform"] {
  const host = new URL(raw).hostname.toLowerCase();
  for (const [domain, label] of [
    ["leboncoin.fr", "Leboncoin"],
    ["seloger.com", "SeLoger"],
    ["bienici.com", "Bien’ici"],
  ] as const)
    if (host === domain || host.endsWith("." + domain)) return label;
  return "Agence ou autre site";
}
export function textEvidence(
  text: string,
  source: string,
  method: ImportEvidence["method"] = "text",
  page?: number,
): ImportEvidence[] {
  return uniqueEvidence(contextualEvidence(text, source, method, page));
}

export function uniqueEvidence(items: ImportEvidence[]): ImportEvidence[] {
  const valid = items.filter((c) => evidenceSchema.safeParse(c).success);
  const selected: ImportEvidence[] = [];
  const variantKey = (c: ImportEvidence) =>
    c.field +
    "|" +
    canonicalValue(c.field, c.value) +
    "|" +
    (c.certainty || "contextual");
  const variants = valid.filter(
    (c, i, a) => a.findIndex((x) => variantKey(x) === variantKey(c)) === i,
  );
  // Keep every distinct semantic value before spending the remaining budget on repeated sources.
  // Refuse an oversized analysis instead of silently hiding a late conflicting value.
  if (variants.length > 96 || JSON.stringify(variants).length > 18000)
    throw new Error(
      "Le lot contient trop de propositions différentes. Réduisez les pages utiles ; les textes bruts restent disponibles.",
    );
  for (const c of [...variants, ...valid]) {
    if (
      selected.some(
        (x) =>
          x.field === c.field &&
          x.value === c.value &&
          x.source === c.source &&
          x.page === c.page,
      )
    )
      continue;
    if (
      selected.length < 96 &&
      JSON.stringify([...selected, c]).length <= 18000
    )
      selected.push(c);
  }
  return selected;
}
export function blankReport(url: string): ImportReport {
  return {
    url,
    platform: detectPlatform(url),
    obtainedAt: new Date().toISOString(),
    outcome: "unavailable",
    attempted: false,
    evidence: [],
    photos: [],
    message: "",
    code: "",
  };
}
export function prepareImportedProperty(
  url: string,
  values: Partial<Record<ImportField, string>>,
  evidence: ImportEvidence[],
  record: ListingRecord,
): Property {
  const p = createProperty(url),
    investment = emptyInvestment();
  for (const field of Object.keys(importLabels) as ImportField[]) {
    const value = (values[field] || "").trim();
    if (!value) continue;
    if (value.length > fieldLimits[field])
      throw new Error(importLabels[field] + " : texte trop long.");
    const proofs = evidence.filter((c) => c.field === field),
      exact = proofs.find((c) => c.value === value),
      origin = exact || proofs[0];
    const source = (
      origin
        ? `${origin.source}${origin.page ? " · page " + origin.page : ""} · extrait : ${origin.excerpt}${!exact ? " · correction personnelle lors de la relecture" : exact.certainty === "uncertain" ? " · confirmation personnelle d’une proposition incertaine" : ""}`
        : `${url} · saisie personnelle lors de la relecture`
    ).slice(0, 2000);
    const conflict = hasConflict(field, proofs);
    if (
      ["title", "city", "price", "area", "rooms", "description"].includes(field)
    )
      p.facts[field as FieldKey] = validateFact(field as FieldKey, {
        value,
        source,
        status: conflict
          ? "conflicting"
          : exact && exact.certainty !== "uncertain"
            ? "listing"
            : "estimated",
        updatedAt: new Date().toISOString(),
      });
    else
      investment.observations.push({
        id: crypto.randomUUID(),
        kind: field === "dpe" ? "dpe" : "listing",
        label: importLabels[field],
        value,
        source: source.slice(0, 500),
        excerpt: origin?.excerpt || "",
        status: conflict
          ? "conflicting"
          : exact && exact.certainty !== "uncertain"
            ? "extracted"
            : "estimated",
        date: new Date().toISOString(),
        ...(origin?.page ? { page: origin.page } : {}),
      });
  }
  p.investment = investment;
  p.listingImport = listingRecordSchema.parse({
    platform: record.platform,
    obtainedAt: record.obtainedAt,
    outcome: record.outcome,
    attempted: record.attempted,
    photos: record.photos,
    evidence: uniqueEvidence(evidence),
    ...(record.transcripts ? { transcripts: record.transcripts } : {}),
  });
  if (new TextEncoder().encode(JSON.stringify(p)).length > 58000)
    throw new Error(
      "Le dossier dépasse la taille de sauvegarde. Conservez le texte brut téléchargé et importez les captures utiles dans un dossier plus court. Aucune donnée n’a été enregistrée.",
    );
  return p;
}
