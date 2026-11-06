import type { ImportEvidence, ImportField } from "./listing-import";
export type CapturePage = {
  source: string;
  page: number;
  text: string;
  method: "ocr" | "pdf" | "text";
  confidence?: number;
  issue?: string;
};
export const primaryFields: ImportField[] = [
  "title",
  "city",
  "price",
  "area",
  "rooms",
  "description",
  "dpe",
  "charges",
];
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const number = (s: string) =>
  s.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
/** Remove only whole UI lines. Raw OCR is kept separately, without these edits. */
export function cleanCaptureText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !/^(?:\d{1,2}[:h]\d{2}(?:\s+.*(?:4G|5G|LTE|%))?|\d{1,3}\s*%|[◀▶‹›←→]+|AA|aA|Safari|Partager|Envoyer un message|Contacter|Appeler|Déposer une annonce|Se connecter|Connexion|Accueil|Favoris|Rechercher|Retour|Menu|Accepter (?:tout|les cookies)|Refuser|Voir les photos|Afficher le numéro|Signaler l’annonce|leboncoin(?:\.fr)?|seloger(?:\.com)?|bienici(?:\.com)?|https?:\/\/\S+)$/i.test(
          s,
        ),
    )
    .join("\n");
}
function readable(s: string) {
  const letters = s.match(/[\p{L}\d]/gu)?.length || 0;
  return (
    letters >= 3 &&
    letters / Math.max(1, s.replace(/\s/g, "").length) > 0.55 &&
    !/[�]{2}|(?:[^\p{L}\d\s]){5}/u.test(s)
  );
}
export function contextualEvidence(
  raw: string,
  source: string,
  method: ImportEvidence["method"] = "text",
  page?: number,
  confidence?: number,
): ImportEvidence[] {
  if (raw.length > 100000)
    throw new Error("Texte limité à 100 000 caractères.");
  const text = cleanCaptureText(raw),
    lines = text.split("\n"),
    out: ImportEvidence[] = [];
  const low = method === "ocr" && confidence !== undefined && confidence < 65;
  const add = (
    field: ImportField,
    value: string,
    excerpt: string,
    uncertain = false,
  ) => {
    value = value.trim();
    if (!value || (!readable(value) && !/^[\d.,]+$|^[A-G]$/.test(value)))
      return;
    out.push({
      field,
      value,
      source: source.slice(0, 500),
      excerpt: excerpt.slice(0, 500),
      method,
      ...(page ? { page } : {}),
      ...(low || uncertain ? { certainty: "uncertain" as const } : {}),
    });
  };
  const title = lines.find(
    (s) =>
      /^(?:\[FICTIF[^\]]*\]\s*)?(?:appartement|maison|studio|immeuble|duplex|loft|terrain|vente\s+(?:appartement|maison))\b/i.test(
        s,
      ) && s.length <= 160,
  );
  if (title) add("title", title, title);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const following = lines[i + 1] || "";
    if (
      /^(?:nombre de )?pi[èe]ces\s*:?$/i.test(line) &&
      /^[1-9]\d?$/.test(following)
    )
      add("rooms", following, line + "\n" + following);
    if (
      /^(?:DPE|classe [ée]nerg[ée]tique)\s*:?$/i.test(line) &&
      /^[A-G]$/.test(following) &&
      !/^[A-G]$/.test(lines[i + 2] || "")
    )
      add("dpe", following, line + "\n" + following);
    if (!readable(line) && !/\d\s*(?:€|m[²2])/i.test(line)) continue;
    const explicitCity = line.match(
      /^(?:ville|localisation|commune)\s*:\s*(.{2,100})$/i,
    );
    const postal = line.match(
      /^([\p{L}][\p{L} ’'-]{1,75})\s*\(?\b(\d{5})\)?$/u,
    );
    if (explicitCity) add("city", explicitCity[1], line);
    else if (postal)
      add("city", postal[1].trim() + " (" + postal[2] + ")", line);
    else {
      const prefix = line.match(
        /\b(?:situ[ée]e?s?\s+[àa]|(?:appartement|maison|studio|duplex|loft)(?:\s+(?:T|F)\d)?\s+[àa]|(?:au (?:cœur|coeur)|centre)\s+de)\s+/i,
      );
      if (prefix) {
        const place = line
          .slice(prefix.index! + prefix[0].length)
          .match(
            /^([\p{Lu}][\p{L}'’-]*(?:[ -](?:sur|sous|en|les|le|la|Saint|Sainte|[\p{Lu}][\p{L}'’-]*)){0,5})/u,
          );
        if (place) add("city", place[1].trim(), line);
      }
    }

    const titleLabel = line.match(/^(?:titre|intitulé)\s*:\s*(.+)$/i);
    if (titleLabel) add("title", titleLabel[1], line);
    for (const d of line.matchAll(
      /\b(?:DPE|classe\s+(?:[ée]nerg[ée]tique|[ée]nergie)|consommation [ée]nerg[ée]tique|diagnostic de performance [ée]nerg[ée]tique)\s*[:\-]?\s*([A-G])\b/gi,
    ))
      add("dpe", d[1].toUpperCase(), line);
    for (const r of line.matchAll(
      /(?<![\p{L}\d.,-])(\d{1,2})\s*(pi[èe]ces?|chambres?)\b/giu,
    ))
      add(/chambre/i.test(r[2]) ? "bedrooms" : "rooms", r[1], line);
    const type = line.match(
      /\b(?:appartement|maison|studio|duplex|loft)\s+(?:T|F)([1-9])\b/i,
    );
    if (type) add("rooms", type[1], line);
    // A label can occupy the preceding line on a screenshot. Never search the whole page for a number's context.
    const previous = lines[i - 1] || "";
    const labelOnly =
      /^(?:prix(?: de vente| demand[ée])?|charges?(?: de copropri[ée]t[ée])?(?: mensuelles?| annuelles?)?|taxe fonci[èe]re|loyer(?: mensuel)?|surface(?: habitable| Carrez| au sol)?|nombre de pi[èe]ces)\s*:?$/i.test(
        previous,
      );
    const money = /(\d[\d \t\u00a0\u202f]*(?:[,.]\d{1,2})?)\s*(?:€|euros?)/gi;
    for (const m of line.matchAll(money)) {
      if (m.index! > 0 && /[\p{L}\d.,-]/u.test(line[m.index! - 1])) continue;
      const prefix = (labelOnly ? previous + " " : "") + line.slice(0, m.index),
        suffix = line
          .slice(m.index! + m[0].length)
          .split(
            /charges?|taxe fonci[èe]re|loyer|honoraires?|prix|travaux/i,
          )[0];
      const labels = [
        ...prefix.matchAll(
          /ancien prix|prix initial|prix avant baisse|prix(?: de vente| demand[ée])?|vente|charges?(?: de copropri[ée]t[ée])?|taxe fonci[èe]re|loyer|honoraires?|frais|travaux|mensualit[ée]|d[ée]p[oô]t de garantie/gi,
        ),
      ];
      const label = normalized(labels.at(-1)?.[0] || "");
      if (/honoraire|frais|travaux|mensualite|depot/.test(label)) continue;
      let field: ImportField | undefined;
      if (/ancien|initial|avant baisse/.test(label)) field = "previousPrice";
      else if (/taxe/.test(label)) field = "propertyTax";
      else if (/loyer/.test(label)) field = "rent";
      else if (/charge/.test(label)) field = "charges";
      else if (/prix|vente/.test(label)) field = "price";
      const perArea = /^\s*\/\s*m[²2]/i.test(suffix);
      if (perArea) continue;
      if (!field && /(?:par|\/)\s*mois|mensuel/i.test(suffix)) field = "rent";
      const headerPrice =
        !field &&
        /^\s*[\d\s.,]+\s*(?:€|euros?)\s*(?:HAI|FAI)?\s*$/i.test(line) &&
        !!title &&
        i <= lines.indexOf(title) + 3;
      if (!field && headerPrice) field = "price";
      if (!field) continue;
      if (field === "price" && /(?:par|\/)\s*(?:mois|an)|mensuel/i.test(suffix))
        continue;
      const labelStart = labels.at(-1)?.index ?? prefix.length;
      const localContext =
        prefix.slice(labelStart) +
        m[0] +
        suffix.split(
          /charges?|taxe fonci[èe]re|loyer|honoraires?|prix|travaux/i,
        )[0];
      const period = /(?:mois|mensuel)/i.test(localContext)
        ? " / mois"
        : /(?:\/\s*an\b|par an\b|annuel)/i.test(localContext)
          ? " / an"
          : "";
      add(
        field,
        ["charges", "rent", "propertyTax"].includes(field)
          ? number(m[1]) + " €" + period
          : number(m[1]),
        (labelOnly ? previous + "\n" : "") + line,
        headerPrice ||
          /potentiel|estim[ée]|environ|[àa] partir de/i.test(localContext),
      );
    }
    const ambiguousUnit = method === "ocr" && /\d\s*m[?°]/i.test(line);
    const areaLine =
      method === "ocr" ? line.replace(/(\d\s*m)[?°]/gi, "$1²") : line;
    for (const m of areaLine.matchAll(/(\d+(?:[,.]\d+)?)\s*m[²2]/gi)) {
      if (m.index! > 0 && /[\p{L}\d.,-]/u.test(line[m.index! - 1])) continue;
      const before = (labelOnly ? previous + " " : "") + line.slice(0, m.index),
        after = line.slice(m.index! + m[0].length, m.index! + m[0].length + 35);
      const labels = [
        ...before.matchAll(
          /(?:surface\s+)?(?:habitable|loi\s+Carrez|Carrez|au sol|plancher|terrain|parcelle|jardin|balcon|terrasse|cave|garage)|surface|superficie/gi,
        ),
      ];
      let kind = normalized(labels.at(-1)?.[0] || "");
      if (!kind) {
        const following = after.match(
          /^\s*(?:de\s+)?(habitables?|Carrez|au sol|de terrain|de jardin|de terrasse)\b/i,
        );
        kind = normalized(following?.[1] || "");
      }
      let field: ImportField | undefined;
      if (/carrez/.test(kind)) field = "carrezArea";
      else if (/sol|plancher/.test(kind)) field = "floorArea";
      else if (/terrain|parcelle/.test(kind)) field = "landArea";
      else if (/jardin|balcon|terrasse|cave|garage/.test(kind))
        field = "otherArea";
      else if (/habitable|surface|superficie/.test(kind)) field = "area";
      if (field)
        add(
          field,
          number(m[1]),
          (labelOnly ? previous + "\n" : "") + line,
          ambiguousUnit ||
            !/habitable|carrez|sol|plancher|terrain|parcelle|jardin|balcon|terrasse|cave|garage/.test(
              kind,
            ),
        );
    }
    const features = [
      ...line.matchAll(
        /\b(?:ascenseur|balcon|terrasse|garage|parking|cave|jardin|dernier [ée]tage|rez-de-chauss[ée]e|sans ascenseur|pas d[’']ascenseur)\b/gi,
      ),
    ].map((m) => m[0]);
    // Preserve the whole sentence (including negation), not an invented boolean amenity.
    if (features.length) add("features", line.slice(0, 1000), line);
  }
  const description = lines
    .filter(
      (s) =>
        readable(s) &&
        s.length >= 25 &&
        !/^(?:Prix|Charges|Taxe fonci|Surface|DPE)\b/i.test(s),
    )
    .join("\n");
  if (description) add("description", description.slice(0, 4000), description);
  return out;
}
export function canonicalValue(field: ImportField, value: string): string {
  if (
    [
      "price",
      "area",
      "rooms",
      "carrezArea",
      "floorArea",
      "landArea",
      "otherArea",
      "bedrooms",
      "previousPrice",
    ].includes(field)
  )
    return String(Number(number(value)));
  if (["charges", "rent", "propertyTax"].includes(field)) {
    const n = value.match(/\d[\d\s]*(?:[.,]\d+)?/);
    if (!n) return normalized(value);
    const v = Number(number(n[0]));
    return /mois|mensuel/i.test(value)
      ? "annual:" + Math.round(v * 1200) / 100
      : /annuel|\/\s*an\b|par an/i.test(value)
        ? "annual:" + v
        : "unknown:" + v;
  }
  if (field === "city")
    return normalized(value)
      .replace(/\(?\b\d{5}\)?/g, "")
      .replace(/\b\d{1,2}(?:e|er|eme|ème)(?:\s+arrondissement)?/g, "")
      .replace(/[()–-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return normalized(value)
    .replace(/\(?\b\d{5}\)?/g, "")
    .replace(/[()]/g, "")
    .trim();
}
export function hasConflict(
  field: ImportField,
  proofs: ImportEvidence[],
): boolean {
  if (["description", "title", "features", "otherArea"].includes(field))
    return false;
  const known = proofs.filter((p) => p.certainty !== "uncertain");
  return known.some((a, i) =>
    known.slice(i + 1).some((b) => {
      if (a.source === b.source && a.page === b.page && a.method === b.method)
        return false;
      const av = canonicalValue(field, a.value),
        bv = canonicalValue(field, b.value);
      if (
        ["charges", "rent", "propertyTax"].includes(field) &&
        av.split(":")[0] !== bv.split(":")[0]
      )
        return false;
      return av !== bv;
    }),
  );
}
/** Merge exact/contained OCR lines, keeping all originals in the transcript archive. */
export function mergeDescriptions(pages: CapturePage[]): string {
  const lines: string[] = [];
  for (const p of pages) {
    if (p.method === "ocr" && p.confidence !== undefined && p.confidence < 65)
      continue;
    const description =
      contextualEvidence(p.text, p.source, p.method, p.page, p.confidence).find(
        (e) => e.field === "description",
      )?.value || "";
    for (const line of description.split("\n").filter(Boolean)) {
      const key = normalized(line);
      if (
        lines.some(
          (s) =>
            normalized(s) === key ||
            (key.length > 35 && normalized(s).includes(key)),
        )
      )
        continue;
      const index = lines.findIndex(
        (s) => normalized(s).length > 35 && key.includes(normalized(s)),
      );
      if (index >= 0) lines[index] = line;
      else lines.push(line);
    }
  }
  return lines.join("\n").slice(0, 4000);
}
