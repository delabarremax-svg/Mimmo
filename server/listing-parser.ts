import { parse, type DefaultTreeAdapterMap } from "parse5";
import {
  textEvidence,
  uniqueEvidence,
  photoLinkSchema,
  fieldLimits,
  type ImportEvidence,
  type ImportField,
} from "../src/domain/listing-import";
type Node = DefaultTreeAdapterMap["node"];
type ObjectData = Record<string, any>;
type Transaction = "sale" | "rent" | "unknown" | "conflicting";
const children = (n: Node): Node[] => ("childNodes" in n ? n.childNodes : []);
const attr = (n: Node, key: string) =>
  "attrs" in n ? n.attrs.find((a) => a.name === key)?.value : undefined;
const tag = (n: Node) => ("tagName" in n ? n.tagName : "");
const type = (o: ObjectData) =>
  [o["@type"]]
    .flat()
    .filter(Boolean)
    .map((v) => String(v).replace(/^https?:\/\/schema.org\//, ""));
const is = (o: ObjectData, kinds: string[]) =>
  type(o).some((t) => kinds.includes(t));
const propertyKinds = [
  "Apartment",
  "House",
  "Residence",
  "Accommodation",
  "SingleFamilyResidence",
  "RealEstateListing",
];
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const sectionBoundary =
  /^(?:biens similaires|annonces similaires|autres (?:biens|appartements|maisons)|vous aimerez|votre financement|simul(?:er|ation)|le march[ée] [àa])/i;
function excluded(n: Node) {
  return (
    [
      "script",
      "style",
      "nav",
      "footer",
      "header",
      "noscript",
      "aside",
      "form",
      "button",
      "select",
    ].includes(tag(n)) ||
    attr(n, "aria-hidden") === "true" ||
    ("attrs" in n && n.attrs.some((a) => a.name === "hidden")) ||
    /recommend|related|similar|suggest|biens[-_ ]similaires|annonces[-_ ]similaires|simulateur|simulator|mortgage|calculator|financement/.test(
      (attr(n, "id") || "") + " " + (attr(n, "class") || ""),
    )
  );
}
function text(node: Node): string {
  let budget = 0;
  function read(n: Node, depth: number): string {
    if (depth > 80 || ++budget > 20000)
      throw new Error("Structure HTML trop complexe.");
    if (excluded(n)) return "";
    if ("value" in n) return n.value;
    let content = "",
      skipLevel = 0;
    for (const child of children(n)) {
      const level = /^h[1-6]$/.test(tag(child)) ? Number(tag(child)[1]) : 0;
      if (level) {
        const heading = read(child, depth + 1).trim();
        if (sectionBoundary.test(heading)) {
          skipLevel = level;
          continue;
        }
        if (skipLevel && level <= skipLevel) skipLevel = 0;
        if (!skipLevel) content += "\n" + heading + "\n";
      } else if (!skipLevel) content += read(child, depth + 1) + " ";
    }
    return [
      "div",
      "p",
      "main",
      "article",
      "section",
      "li",
      "h1",
      "h2",
      "br",
      "dt",
      "dd",
      "tr",
      "td",
      "th",
      "address",
    ].includes(tag(n))
      ? "\n" + content + "\n"
      : content;
  }
  return read(node, 0);
}
function numeric(raw: unknown): string | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return;
  const s = String(raw).trim();
  // Space grouping is explicit. Ambiguous dot thousands and mixed separators are rejected.
  if (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,2})?$/.test(s))
    return;
  const n = Number(s.replace(/[ \u00a0\u202f]/g, "").replace(",", "."));
  if (Number.isFinite(n) && n > 0) return String(n);
}
function urlKey(
  raw: unknown,
  base: string,
  fragment = false,
): string | undefined {
  if (typeof raw !== "string") return;
  try {
    const u = new URL(raw, base);
    for (const key of [...u.searchParams.keys()])
      if (/^utm_|^(?:gclid|fbclid|msclkid)$/i.test(key))
        u.searchParams.delete(key);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      return;
    if (!fragment) u.hash = "";
    return u.href;
  } catch {
    return;
  }
}
function transactionText(s: string): Transaction {
  s = norm(s);
  const rent = /\b(?:location|[àa] louer|for rent|leaseout|rentaction)\b/i.test(
      s,
    ),
    sale = /\b(?:vente|[àa] vendre|for sale|sellaction|sell)\b/i.test(s);
  return rent && sale
    ? "conflicting"
    : rent
      ? "rent"
      : sale
        ? "sale"
        : "unknown";
}
function combineTransactions(values: Transaction[]): Transaction {
  if (
    values.includes("conflicting") ||
    (values.includes("rent") && values.includes("sale"))
  )
    return "conflicting";
  return values.includes("rent")
    ? "rent"
    : values.includes("sale")
      ? "sale"
      : "unknown";
}
export function parseListingHtml(html: string, url: string) {
  if (html.length > 1000000) throw new Error("Page trop volumineuse.");
  const root = parse(html),
    nodes: Node[] = [];
  function visit(n: Node, depth = 0) {
    if (depth > 80 || nodes.length >= 20000)
      throw new Error("Structure HTML trop complexe.");
    nodes.push(n);
    children(n).forEach((c) => visit(c, depth + 1));
  }
  visit(root);
  const documentUrls = new Set<string | undefined>([urlKey(url, url)!]);
  const canonicals = nodes
    .filter(
      (n) => tag(n) === "link" && attr(n, "rel")?.toLowerCase() === "canonical",
    )
    .map((n) => urlKey(attr(n, "href"), url))
    .filter(
      (v): v is string => !!v && new URL(v).origin === new URL(url).origin,
    );
  if (new Set(canonicals).size === 1) documentUrls.add(canonicals[0]);
  const objects: ObjectData[] = [],
    ids = new Map<string, ObjectData>();
  const conflictingIds = new Set<string>();
  let graphBudget = 0;
  function collect(v: unknown, depth = 0) {
    if (depth > 12 || ++graphBudget > 5000)
      throw new Error("Données structurées trop complexes.");
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      if (v.length > 100)
        throw new Error(
          "Tableau structuré trop volumineux pour être isolé avec sûreté.",
        );
      for (const child of v) collect(child, depth + 1);
      return;
    }
    const o = v as ObjectData;
    objects.push(o);
    if (typeof o["@id"] === "string" && Object.keys(o).length > 1) {
      const id = urlKey(o["@id"], url, true);
      if (id) {
        if (ids.has(id) && JSON.stringify(ids.get(id)) !== JSON.stringify(o))
          conflictingIds.add(id);
        ids.set(id, o);
      }
    }
    for (const v of Object.values(o)) collect(v, depth + 1);
  }
  for (const n of nodes
    .filter(
      (n) =>
        tag(n) === "script" &&
        attr(n, "type")?.toLowerCase() === "application/ld+json",
    )
    .slice(0, 20)) {
    const raw = children(n)
      .map((n) => ("value" in n ? n.value : ""))
      .join("");
    if (raw.length > 100000) throw new Error("Bloc JSON-LD trop volumineux.");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    collect(value);
  }
  const resolve = (o: any): any => {
    const id = urlKey(
      typeof o === "string"
        ? o
        : o && typeof o === "object"
          ? o["@id"]
          : undefined,
      url,
      true,
    );
    if (id && conflictingIds.has(id)) return undefined;
    return id ? ids.get(id) || o : o;
  };
  const values = (o: any): ObjectData[] =>
    [o]
      .flat()
      .map(resolve)
      .filter((v) => v && typeof v === "object" && !Array.isArray(v));
  const seenProperties = new Set<string>();
  const properties = objects.filter((o) => {
    if (!is(o, propertyKinds)) return false;
    const key = JSON.stringify(o);
    if (seenProperties.has(key)) return false;
    seenProperties.add(key);
    return true;
  });
  const envelopes = properties.filter((o) => is(o, ["RealEstateListing"]));
  const wrapped = new Set<ObjectData>();
  const candidates = envelopes.map((envelope) => {
    const physical = values(
      envelope.mainEntity || envelope.about || envelope.itemOffered,
    ).filter((o) => is(o, propertyKinds) && o !== envelope);
    physical.forEach((o) => wrapped.add(o));
    return { envelope, physical };
  });
  for (const o of properties)
    if (!is(o, ["RealEstateListing"]) && !wrapped.has(o))
      candidates.push({ envelope: o, physical: [] });
  function matches(o: ObjectData) {
    return (
      values(o.url).some((v) => documentUrls.has(urlKey(v["@id"], url))) ||
      [o.url].flat().some((v) => documentUrls.has(urlKey(v, url))) ||
      (!String(o["@id"] || "").includes("#") &&
        documentUrls.has(urlKey(o["@id"], url))) ||
      values(o.mainEntityOfPage).some((v) =>
        documentUrls.has(urlKey(v.url || v["@id"], url)),
      ) ||
      documentUrls.has(
        urlKey(
          typeof o.mainEntityOfPage === "string"
            ? o.mainEntityOfPage
            : undefined,
          url,
        ),
      )
    );
  }
  const pages = objects.filter(
    (o) =>
      is(o, ["WebPage", "ItemPage"]) &&
      ((!o.url && !o["@id"]) ||
        matches(o) ||
        documentUrls.has(urlKey(o["@id"], url))),
  );
  const mainEntities = new Set(
    pages.flatMap((p) => values(p.mainEntity || p.about)),
  );
  const ranked = candidates.map((c) => ({
    ...c,
    score:
      mainEntities.has(c.envelope) ||
      c.physical.some((o) => mainEntities.has(o))
        ? 3
        : [c.envelope, ...c.physical].some(matches)
          ? 2
          : 0,
  }));
  const top = Math.max(0, ...ranked.map((c) => c.score)),
    best = ranked.filter((c) => c.score === top);
  let selected = best.length === 1 ? best[0] : undefined;
  // A lone explicitly different URL is a recommendation, not evidence for this page.
  if (
    selected &&
    top === 0 &&
    [selected.envelope, ...selected.physical].some((o) => o.url && !matches(o))
  )
    selected = undefined;
  const ambiguous =
    (candidates.length > 0 && !selected) ||
    (!!selected && selected.physical.length > 1);
  const evidence: ImportEvidence[] = [],
    photos: { url: string; source: string }[] = [];
  if (ambiguous)
    return {
      evidence,
      photos,
      multipleListings: true,
      transaction: "unknown" as Transaction,
    };
  const selectedObjects = selected
    ? [selected.envelope, ...selected.physical]
    : [];
  const selectedIds = selectedObjects
    .map((o) => o["@id"] || o.url)
    .filter((v) => typeof v === "string")
    .join(", ");
  function add(
    field: ImportField,
    value: unknown,
    excerpt: string,
    method: ImportEvidence["method"],
    uncertain = false,
  ) {
    if (!["string", "number"].includes(typeof value)) return;
    let v = String(value).trim();
    if (
      [
        "price",
        "area",
        "rooms",
        "bedrooms",
        "carrezArea",
        "floorArea",
        "landArea",
      ].includes(field)
    ) {
      const n = numeric(value);
      if (!n) return;
      v = n;
      if (["rooms", "bedrooms"].includes(field) && !Number.isInteger(Number(v)))
        return;
    }
    if (!v || v.length > fieldLimits[field]) return;
    evidence.push({
      field,
      value: v,
      excerpt: (
        (method === "jsonld" && selectedIds
          ? "Objet " + selectedIds + " · "
          : "") + excerpt
      ).slice(0, 500),
      source: url.slice(0, 500),
      method,
      ...(uncertain ? { certainty: "uncertain" as const } : {}),
    });
  }
  function photo(v: unknown) {
    if (typeof v !== "string") return;
    try {
      const p = { url: new URL(v, url).href, source: url.slice(0, 500) };
      if (
        photoLinkSchema.safeParse(p).success &&
        !photos.some((x) => x.url === p.url) &&
        photos.length < 6
      )
        photos.push(p);
    } catch {}
  }
  const headings = nodes.filter((n) => tag(n) === "h1" && !excluded(n));
  const h1 = headings.length === 1 ? headings[0] : undefined;
  const heading = h1 ? text(h1).trim() : "";
  const headingPattern =
    /^(?:\[FICTIF[^\]]*\]\s*)?(?:(?:vente|achat|location|[àa] vendre|[àa] louer)\s+)?(?:appartement|maison|studio|immeuble|duplex|loft|r[ée]sidence|terrain)\b/i;
  const realEstateHeading = headingPattern.test(heading);
  // A fallback must be anchored by one property heading, never the entire undifferentiated body.
  let main = h1;
  while (
    main &&
    "parentNode" in main &&
    main.parentNode &&
    !["main", "article", "section", "div"].includes(tag(main))
  )
    main = main.parentNode;
  const mainContainer =
    nodes.find((n) => tag(n) === "main") ||
    nodes.find((n) => tag(n) === "article");
  if (mainContainer && h1) {
    let p: Node | undefined = h1;
    while (p && p !== mainContainer)
      p = "parentNode" in p ? p.parentNode || undefined : undefined;
    if (p === mainContainer) main = mainContainer;
  }
  if (main && !mainContainer) {
    let p: Node | undefined = main;
    while (p) {
      if (
        ["div", "section", "article"].includes(tag(p)) &&
        text(p).trim().length > heading.length + 30
      ) {
        main = p;
        break;
      }
      p = "parentNode" in p ? p.parentNode || undefined : undefined;
    }
  }
  if (!realEstateHeading) main = undefined;
  let supplied = main
    ? text(main)
        .replace(/[ \t]+/g, " ")
        .slice(0, 100000)
    : "";
  // If an unsegmented card for another property remains in the text, abstain from
  // DOM fields rather than attach its data to the selected JSON-LD property.
  const foreignCard = nodes.some(
    (n) =>
      tag(n) === "a" &&
      attr(n, "href") &&
      headingPattern.test(text(n).trim()) &&
      !documentUrls.has(urlKey(attr(n, "href"), url)) &&
      supplied.includes(text(n).trim()),
  );
  const foreignHeading = nodes.some(
    (n) =>
      /^h[2-6]$/.test(tag(n)) &&
      headingPattern.test(text(n).trim()) &&
      norm(text(n).trim()) !== norm(heading) &&
      supplied.includes(text(n).trim()),
  );
  if (foreignCard || foreignHeading) supplied = "";
  const offers = [
    ...new Set([
      ...selectedObjects.flatMap((o) => values(o.offers)),
      ...objects.filter(
        (o) =>
          is(o, ["Offer"]) &&
          values(o.itemOffered).some((p) => selectedObjects.includes(p)),
      ),
    ]),
  ];
  const offerTransaction = (o: ObjectData) => {
    const business = [o.businessFunction]
      .flat()
      .map((v) => (typeof v === "object" ? v?.["@id"] : v))
      .filter(Boolean)
      .join(" ");
    if (
      /leaseout|rent/i.test(business) ||
      values(o.priceSpecification).some((p) =>
        /P1M|MON|mois|month/i.test(
          String(p.billingDuration || p.unitCode || p.unitText || ""),
        ),
      )
    )
      return "rent" as const;
    if (/sell/i.test(business)) return "sale" as const;
    return "unknown" as const;
  };
  const transaction = combineTransactions([
    transactionText(heading),
    /\bprix\s+(?:de vente|honoraires inclus)\b/i.test(supplied)
      ? "sale"
      : "unknown",
    ...selectedObjects.map((o) =>
      transactionText(
        String(o.name || "") +
          " " +
          String(o.category || "") +
          " " +
          type(o.potentialAction || {}).join(" "),
      ),
    ),
    ...offers.map(offerTransaction),
  ]);
  for (const o of selectedObjects) {
    for (const [key, field] of [
      ["name", "title"],
      ["description", "description"],
      ["numberOfRooms", "rooms"],
      ["numberOfBedrooms", "bedrooms"],
    ] as const)
      add(field, o[key], JSON.stringify({ [key]: o[key] }), "jsonld");
    for (const address of values(o.address))
      add("city", address.addressLocality, JSON.stringify(address), "jsonld");
    for (const size of values(o.floorSize))
      if (
        ["MTK", "m2", "m²", "SQM"].includes(
          String(size.unitCode || size.unitText),
        )
      )
        add("area", size.value, JSON.stringify(size), "jsonld");
    for (const image of [o.image].flat().slice(0, 6)) {
      const v = resolve(image);
      photo(typeof v === "object" ? v?.url || v?.contentUrl : v);
    }
    for (const p of values(o.additionalProperty).slice(0, 20)) {
      if (typeof p.name !== "string") continue;
      if (
        /^(?:DPE|classe [ée]nerg[ée]tique|classe [ée]nergie)$/i.test(p.name) &&
        /^[A-G]$/i.test(String(p.value))
      )
        add("dpe", String(p.value).toUpperCase(), JSON.stringify(p), "jsonld");
      if (
        /^charges(?:\s+(?:annuelles|mensuelles|de copropri[ée]t[ée]))?$/i.test(
          p.name,
        )
      )
        add(
          "charges",
          String(p.value) + (p.unitText ? " " + p.unitText : ""),
          JSON.stringify(p),
          "jsonld",
        );
      if (
        /prix net vendeur|prix.*hors.*(?:honoraires|frais)|honoraires|frais d.agence/i.test(
          p.name,
        )
      )
        add(
          "features",
          p.name + " : " + String(p.value),
          JSON.stringify(p),
          "jsonld",
        );
      if (/surface.*carrez/i.test(p.name))
        add("carrezArea", p.value, JSON.stringify(p), "jsonld");
      if (/surface.*(?:sol|plancher)/i.test(p.name))
        add("floorArea", p.value, JSON.stringify(p), "jsonld");
    }
    const energy = resolve(o.hasEnergyPerformance);
    if (energy && /^[A-G]$/i.test(String(energy.energyEfficiencyRating || "")))
      add(
        "dpe",
        String(energy.energyEfficiencyRating).toUpperCase(),
        JSON.stringify(energy),
        "jsonld",
      );
  }
  for (const offer of offers) {
    const specs = values(offer.priceSpecification),
      spec = specs[0];
    const currency = offer.priceCurrency || spec?.priceCurrency;
    const price = offer.price ?? spec?.price;
    if (currency !== "EUR") continue;
    const n = numeric(price);
    if (!n) continue;
    const kind = offerTransaction(offer) === "rent" ? "rent" : transaction;
    const monthly = specs.some((p) =>
      /P1M|MON|mois|month/i.test(
        String(p.billingDuration || p.unitCode || p.unitText || ""),
      ),
    );
    if (
      /net vendeur|hors.*(?:frais|honoraires)/i.test(
        String(offer.name || spec?.name || ""),
      )
    )
      add(
        "features",
        "Prix net vendeur : " + n + " €",
        JSON.stringify(offer),
        "jsonld",
      );
    else if (
      /honoraires|frais d.agence|agency fees/i.test(
        String(offer.name || spec?.name || ""),
      ) &&
      !/inclus|HAI|FAI/i.test(String(offer.name || spec?.name || ""))
    )
      add(
        "features",
        String(offer.name || spec?.name) + " : " + n + " €",
        JSON.stringify(offer),
        "jsonld",
      );
    else
      add(
        kind === "rent" ? "rent" : "price",
        kind === "rent" ? n + " €" + (monthly ? " / mois" : "") : n,
        JSON.stringify(offer),
        "jsonld",
        kind === "unknown" || transaction === "conflicting",
      );
  }
  const metas = new Map<string, { value: string; excerpt: string }[]>();
  for (const n of nodes.filter((n) => tag(n) === "meta")) {
    const name = (attr(n, "property") || attr(n, "name") || "").toLowerCase(),
      content = attr(n, "content");
    if (content) {
      const list = metas.get(name) || [];
      list.push({ value: content, excerpt: name + " = " + content });
      metas.set(name, list);
    }
  }
  for (const [name, field] of [
    ["og:title", "title"],
    ["og:description", "description"],
    ...(!metas.has("og:description") ? [["description", "description"]] : []),
  ] as [string, ImportField][])
    for (const m of metas.get(name) || [])
      add(field, m.value, m.excerpt, "metadata");
  const propertyContext = selectedObjects.length > 0 || realEstateHeading;
  if (
    propertyContext &&
    metas.get("product:price:currency")?.some((x) => x.value === "EUR")
  )
    for (const m of metas.get("product:price:amount") || [])
      add(
        transaction === "rent" ? "rent" : "price",
        transaction === "rent" ? m.value + " €" : m.value,
        m.excerpt,
        "metadata",
        transaction === "unknown" || transaction === "conflicting",
      );
  if (selectedObjects.length)
    for (const m of metas.get("og:image") || []) photo(m.value);
  if (supplied) {
    add("title", heading, heading, "text");
    evidence.push(
      ...textEvidence(supplied, url)
        .filter((c) => c.field !== "description")
        .map((c) =>
          transaction === "rent" && c.field === "price"
            ? { ...c, field: "rent" as const, value: c.value + " €" }
            : (transaction === "conflicting" || transaction === "unknown") &&
                ["price"].includes(c.field)
              ? { ...c, certainty: "uncertain" as const }
              : c,
        ),
    );
    // Only an explicit alternative label for the one class, never a graphic scale or generic letter.
    const scoped: Node[] = [];
    function walk(n: Node) {
      if (excluded(n)) return;
      scoped.push(n);
      children(n).forEach(walk);
    }
    walk(main!);
    for (const n of scoped)
      for (const label of [attr(n, "alt"), attr(n, "aria-label")]) {
        const m = label?.match(
          /^\s*(?:DPE|(?:diagnostic de performance|classe) [ée]nerg[ée]tique)\s*[:\-]?\s*(?:classe\s+)?([A-G])\s*$/i,
        );
        if (m) add("dpe", m[1].toUpperCase(), label!, "text");
      }
  }
  // A generic JSON-LD floorSize must not override a different explicitly labelled living area.
  for (const e of evidence.filter(
    (e) => e.field === "area" && e.method === "jsonld",
  )) {
    if (
      evidence.some(
        (p) =>
          p.field === "area" &&
          p.method === "text" &&
          p.value === e.value &&
          p.certainty !== "uncertain",
      )
    )
      continue;
    const named = evidence.find(
      (p) =>
        ["floorArea", "carrezArea"].includes(p.field) &&
        p.value === e.value &&
        p.certainty !== "uncertain",
    );
    if (named) e.field = named.field;
  }
  // Keep net/fees/equipment together as literal sourced notes, not purchase-price alternatives.
  const notes = evidence.filter((e) => e.field === "features");
  if (notes.length > 1) {
    const combined = [...new Set(notes.map((e) => e.value))].join("\n");
    if (combined.length <= fieldLimits.features)
      evidence.unshift({
        ...notes[0],
        value: combined,
        excerpt: combined.slice(0, 500),
      });
  }
  return {
    evidence: uniqueEvidence(evidence),
    photos,
    multipleListings: false,
    transaction,
  };
}
