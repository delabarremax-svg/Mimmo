import type { FieldKey } from "./property";
export type Candidate = { field: FieldKey; value: string; excerpt: string };
/** Local transcription helper. No network, no claim of AI or verification. */
export function extractListingText(text: string): Candidate[] {
  if (text.length > 100000)
    throw new Error("Texte limité à 100 000 caractères.");
  const result: Candidate[] = [];
  const rules: [FieldKey, RegExp][] = [
    ["price", /(\d[\d\s\u00a0\u202f]*(?:[,.]\d{1,2})?)\s*(?:€|euros?)/i],
    ["area", /(\d+(?:[,.]\d+)?)\s*m[²2]/i],
    ["rooms", /(\d+)\s*pi[èe]ces?\b/i],
  ];
  for (const [field, re] of rules) {
    const m = text.match(re);
    if (m) {
      const value = m[1].replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
      if (Number(value) > 0) result.push({ field, value, excerpt: m[0] });
    }
  }
  return result;
}
export function extractJsonLd(raw: string): Candidate[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("JSON-LD illisible. Collez uniquement le contenu JSON.");
  }
  const candidates: Candidate[] = [];
  function scan(v: unknown, depth = 0) {
    if (depth > 8 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.slice(0, 100).forEach((x) => scan(x, depth + 1));
      return;
    }
    const o = v as Record<string, unknown>;
    const type = String(o["@type"] || "");
    if (
      /Apartment|House|Residence|RealEstateListing|Accommodation|Product/.test(
        type,
      )
    ) {
      for (const [key, field] of [
        ["name", "title"],
        ["numberOfRooms", "rooms"],
      ] as const) {
        if (["string", "number"].includes(typeof o[key]))
          candidates.push({
            field,
            value: String(o[key]).slice(0, 4000),
            excerpt: JSON.stringify({ [key]: o[key] }).slice(0, 500),
          });
      }
      const size = o.floorSize as Record<string, unknown> | undefined;
      if (
        size &&
        Number(size.value) > 0 &&
        ["MTK", "m2", "m²", "SQM"].includes(
          String(size.unitCode || size.unitText),
        )
      )
        candidates.push({
          field: "area",
          value: String(size.value),
          excerpt: JSON.stringify(size).slice(0, 500),
        });
      const address = o.address as Record<string, unknown> | undefined;
      if (address && typeof address.addressLocality === "string")
        candidates.push({
          field: "city",
          value: address.addressLocality,
          excerpt: JSON.stringify(address).slice(0, 500),
        });
    }
    if (
      o["@type"] === "Offer" &&
      o.priceCurrency === "EUR" &&
      Number(o.price) > 0
    )
      candidates.push({
        field: "price",
        value: String(o.price),
        excerpt: JSON.stringify({ price: o.price, currency: o.priceCurrency }),
      });
    for (const val of Object.values(o)) scan(val, depth + 1);
  }
  scan(data);
  return candidates.filter(
    (c, i, a) =>
      a.findIndex((x) => x.field === c.field && x.value === c.value) === i,
  );
}
