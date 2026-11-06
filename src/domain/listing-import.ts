import { z } from "zod";
import {
  createProperty,
  validateFact,
  type Property,
  type FieldKey,
} from "./property";
import { emptyInvestment } from "./investment";
import { extractListingText } from "./extraction";
export const importLabels = {
  title: "Titre",
  city: "Localisation",
  price: "Prix (€)",
  area: "Surface (m²)",
  rooms: "Pièces",
  description: "Description",
  dpe: "DPE",
  charges: "Charges",
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
    ]),
    value: z.string().min(1).max(4000),
    source: z.string().min(1).max(500),
    excerpt: z.string().max(500),
    method: z.enum(["jsonld", "metadata", "text", "ocr", "pdf", "partner"]),
    page: z.number().int().min(1).max(10000).optional(),
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
    evidence: z.array(evidenceSchema).max(32),
    photos: z.array(photoLinkSchema).max(6),
  })
  .strict()
  .refine((v) => JSON.stringify(v).length <= 24000, "Import trop volumineux");
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
  const result: ImportEvidence[] = extractListingText(text).map((c) => ({
    ...c,
    source: source.slice(0, 500),
    method,
    ...(page ? { page } : {}),
  }));
  const add = (field: ImportField, value: string, excerpt: string) => {
    value = value.trim().slice(0, fieldLimits[field]);
    if (value)
      result.push({
        field,
        value,
        excerpt: excerpt.slice(0, 500),
        source: source.slice(0, 500),
        method,
        ...(page ? { page } : {}),
      });
  };
  for (const line of text.split(/\n/)) {
    let m = line.match(/^\s*(?:ville|localisation|commune)\s*:\s*(.{2,160})$/i);
    if (m) add("city", m[1], line);
    m = line.match(/^\s*(?:titre|intitulé)\s*:\s*(.{2,160})$/i);
    if (m) add("title", m[1], line);
    for (const d of line.matchAll(/\bDPE\s*(?:[:\-]|classe)?\s*([A-G])\b/gi))
      add("dpe", d[1].toUpperCase(), line);
    for (const charge of line.matchAll(
      /\bcharges(?:[^\n.!?€\d]{0,45})(\d[\d \t\u00a0\u202f]*(?:[,.]\d{1,2})?\s*(?:€|euros?)(?:\s*(?:\/|par)\s*(?:mois|an)|\s*(?:annuelles?|mensuelles?))?)/gi,
    ))
      add("charges", charge[0], charge[0]);
    const place = line.match(
      /^\s*([A-ZÀ-Ý][\p{L} ’'-]{1,90})\s*\((\d{5})\)\s*$/u,
    );
    if (place) add("city", `${place[1].trim()} (${place[2]})`, line);
  }
  const first = text.split(/\n/).find((line) => line.trim());
  if (
    first &&
    /^\s*(?:appartement|maison|studio|immeuble|duplex|loft|terrain)\b/i.test(
      first,
    ) &&
    first.trim().length <= 160
  )
    add("title", first, first);
  // The supplied description is transcribed verbatim, never generated from the URL.
  if (text.trim()) add("description", text.trim(), text.trim());
  return uniqueEvidence(result);
}
export function uniqueEvidence(items: ImportEvidence[]): ImportEvidence[] {
  const valid = items.filter((c) => evidenceSchema.safeParse(c).success);
  const selected: ImportEvidence[] = [];
  for (const c of valid) {
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
      selected.length < 32 &&
      JSON.stringify([...selected, c]).length <= 12000
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
        ? `${origin.source}${origin.page ? " · page " + origin.page : ""} · extrait : ${origin.excerpt}${!exact ? " · correction personnelle lors de la relecture" : ""}`
        : `${url} · saisie personnelle lors de la relecture`
    ).slice(0, 2000);
    const conflict = new Set(proofs.map((c) => c.value)).size > 1;
    if (field !== "dpe" && field !== "charges")
      p.facts[field as FieldKey] = validateFact(field as FieldKey, {
        value,
        source,
        status: conflict ? "conflicting" : exact ? "listing" : "estimated",
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
        status: conflict ? "conflicting" : exact ? "extracted" : "estimated",
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
  });
  return p;
}
