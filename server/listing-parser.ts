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
function children(n: Node): Node[] {
  return "childNodes" in n ? n.childNodes : [];
}
function attr(n: Node, key: string) {
  return "attrs" in n ? n.attrs.find((a) => a.name === key)?.value : undefined;
}
function text(n: Node): string {
  if (
    "tagName" in n &&
    ["script", "style", "nav", "footer", "header", "noscript"].includes(
      n.tagName,
    )
  )
    return "";
  if ("value" in n) return n.value;
  const content = children(n).map(text).join(" ");
  return "tagName" in n &&
    ["div", "p", "main", "article", "section", "li", "h1", "h2", "br"].includes(
      n.tagName,
    )
    ? "\n" + content + "\n"
    : content;
}
export function parseListingHtml(html: string, url: string) {
  if (html.length > 1000000) throw new Error("Page trop volumineuse.");
  const root = parse(html),
    nodes: Node[] = [];
  function visit(n: Node, depth = 0) {
    if (depth > 80 || nodes.length > 20000) return;
    nodes.push(n);
    children(n).forEach((c) => visit(c, depth + 1));
  }
  visit(root);
  const evidence: ImportEvidence[] = [],
    photos: { url: string; source: string }[] = [];
  const add = (
    field: ImportField,
    value: unknown,
    excerpt: string,
    method: ImportEvidence["method"],
  ) => {
    if (!["string", "number"].includes(typeof value)) return;
    const v = String(value).trim();
    if (!v || v.length > fieldLimits[field]) return;
    if (
      ["price", "area", "rooms"].includes(field) &&
      (!/^\d+(?:[.,]\d+)?$/.test(v) ||
        !Number.isFinite(Number(v.replace(",", "."))) ||
        Number(v.replace(",", ".")) <= 0 ||
        (field === "rooms" && !Number.isInteger(Number(v))))
    )
      return;
    evidence.push({
      field,
      value: v,
      excerpt: excerpt.slice(0, 500),
      source: url.slice(0, 500),
      method,
    });
  };
  const photo = (v: unknown) => {
    if (typeof v !== "string") return;
    try {
      const p = { url: new URL(v, url).href, source: url.slice(0, 500) };
      if (
        photoLinkSchema.safeParse(p).success &&
        !photos.some((x) => x.url === p.url) &&
        photos.length < 6
      )
        photos.push(p);
    } catch {
      /* invalid media is not fetched */
    }
  };
  const type = (v: unknown) =>
    Array.isArray(v) ? v.map(String).join(" ") : String(v || "");
  let budget = 0,
    listingCount = 0;
  function scan(v: unknown, depth = 0, propertyContext = false) {
    if (depth > 8 || ++budget > 5000 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.slice(0, 100).forEach((x) => scan(x, depth + 1, propertyContext));
      return;
    }
    const o = v as Record<string, any>,
      kind = type(o["@type"]);
    const isProperty =
      /(?:^|[ /])(?:Apartment|House|Residence|Accommodation|SingleFamilyResidence|RealEstateListing)(?:$| )/.test(
        kind,
      );
    if (isProperty) {
      listingCount++;
      for (const [key, field] of [
        ["name", "title"],
        ["description", "description"],
        ["numberOfRooms", "rooms"],
      ] as const)
        add(field, o[key], JSON.stringify({ [key]: o[key] }), "jsonld");
      const address = o.address;
      if (address && typeof address === "object")
        add("city", address.addressLocality, JSON.stringify(address), "jsonld");
      const size = o.floorSize;
      if (
        size &&
        ["MTK", "m2", "m²", "SQM"].includes(
          String(size.unitCode || size.unitText),
        )
      )
        add("area", size.value, JSON.stringify(size), "jsonld");
      const offers = Array.isArray(o.offers) ? o.offers : [o.offers];
      for (const offer of offers.slice(0, 10))
        if (offer && offer.priceCurrency === "EUR")
          add(
            "price",
            offer.price,
            JSON.stringify({
              price: offer.price,
              priceCurrency: offer.priceCurrency,
            }),
            "jsonld",
          );
      for (const image of (Array.isArray(o.image) ? o.image : [o.image]).slice(
        0,
        6,
      ))
        photo(
          typeof image === "object" && image
            ? image.url || image.contentUrl
            : image,
        );
      const properties = Array.isArray(o.additionalProperty)
        ? o.additionalProperty
        : [o.additionalProperty];
      for (const p of properties.slice(0, 20))
        if (p && typeof p.name === "string") {
          if (
            /^(?:DPE|classe énergétique|classe énergie)$/i.test(p.name) &&
            /^[A-G]$/i.test(String(p.value))
          )
            add(
              "dpe",
              String(p.value).toUpperCase(),
              JSON.stringify(p),
              "jsonld",
            );
          if (
            /^charges(?:\s+(?:annuelles|mensuelles|de copropriété))?$/i.test(
              p.name,
            )
          )
            add(
              "charges",
              String(p.value) + (p.unitText ? " " + p.unitText : ""),
              JSON.stringify(p),
              "jsonld",
            );
        }
    }
    // Unrelated Product/Organization offers and photos are deliberately ignored.
    for (const [key, value] of Object.entries(o))
      if (key !== "image")
        scan(value, depth + 1, isProperty || propertyContext);
  }
  for (const node of nodes
    .filter(
      (n) =>
        "tagName" in n &&
        n.tagName === "script" &&
        attr(n, "type")?.toLowerCase() === "application/ld+json",
    )
    .slice(0, 20)) {
    const raw = children(node)
      .map((n) => ("value" in n ? n.value : ""))
      .join("");
    if (raw.length > 100000) continue;
    try {
      scan(JSON.parse(raw));
    } catch {
      /* other usable sources are kept */
    }
  }
  const metas = new Map<string, { value: string; excerpt: string }[]>();
  for (const n of nodes)
    if ("tagName" in n && n.tagName === "meta") {
      const name = (attr(n, "property") || attr(n, "name") || "").toLowerCase(),
        content = attr(n, "content");
      if (content) {
        const list = metas.get(name) || [];
        list.push({ value: content, excerpt: `${name} = ${content}` });
        metas.set(name, list);
      }
    }
  const meta = (name: string, field: ImportField) => {
    for (const m of metas.get(name) || [])
      add(field, m.value, m.excerpt, "metadata");
  };
  meta("og:title", "title");
  meta("og:description", "description");
  if (!metas.has("og:description")) meta("description", "description");
  if (metas.get("product:price:currency")?.some((x) => x.value === "EUR"))
    meta("product:price:amount", "price");
  // og:image can be a portal logo; only associate it when a property was identified.
  if (listingCount) for (const m of metas.get("og:image") || []) photo(m.value);
  const main =
    nodes.find((n) => "tagName" in n && n.tagName === "main") ||
    nodes.find((n) => "tagName" in n && n.tagName === "article");
  if (main) {
    const headingNodes: Node[] = [];
    function collect(n: Node, depth = 0) {
      if (depth > 40 || headingNodes.length > 2000) return;
      headingNodes.push(n);
      children(n).forEach((c) => collect(c, depth + 1));
    }
    collect(main);
    const h1 = headingNodes.find((n) => "tagName" in n && n.tagName === "h1");
    if (h1) add("title", text(h1).trim(), text(h1).trim(), "text");
    const supplied = text(main)
      .replace(/[ \t]+/g, " ")
      .slice(0, 100000);
    evidence.push(
      ...textEvidence(supplied, url).filter((c) => c.field !== "description"),
    );
  }
  return {
    evidence: uniqueEvidence(evidence),
    photos,
    multipleListings: listingCount > 1,
  };
}
