/** Diagnostic only: no deployment, database, real-site HTTP calls or runtime edits. */
import { writeFile, mkdir } from "node:fs/promises";
import { parseListingHtml } from "../server/listing-parser";
import { importListing, robotsAllows } from "../server/listing";
import { execFileSync } from "node:child_process";
import { textEvidence } from "../src/domain/listing-import";
const url = "https://authorized-example.invalid/annonce/123";
const reports: Record<string, unknown>[] = [];
const html = (data: unknown, body = "") =>
  '<script type="application/ld+json">' +
  JSON.stringify(data) +
  "</script>" +
  body;
const field = (data: ReturnType<typeof parseListingHtml>, name: string) =>
  data.evidence.filter((e) => e.field === name).map((e) => e.value);
function probe(
  id: string,
  expected: unknown,
  actual: unknown,
  defect: boolean,
) {
  reports.push({
    id,
    expected,
    actual,
    status: defect ? "issue_reproduced" : "not_reproduced",
    fixture: "synthetic_offline",
  });
}
const originalFetch = globalThis.fetch;
try {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("No remote calls allowed in diagnostic");
  };
  const gate = await importListing(url, "");
  reports.push({
    id: "default_authorization_gate",
    actual: { attempted: gate.attempted, code: gate.code, remoteCalls: calls },
    status: "deliberate_configuration_gate",
    fixture: "synthetic_offline",
  });
  const allowed = robotsAllows(
    "User-agent: Mimmo\nDisallow:\n\nUser-agent: *\nDisallow: /",
    new URL(url),
  );
  probe(
    "empty_robots_group",
    "Mimmo allowed; wildcard group separate",
    allowed,
    !allowed,
  );
  const rental = parseListingHtml(
    html({
      "@type": "Apartment",
      offers: {
        price: 900,
        priceCurrency: "EUR",
        businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      },
    }),
    url,
  );
  probe(
    "rent_misclassified_as_purchase_price",
    [],
    field(rental, "price"),
    field(rental, "price").includes("900"),
  );
  const mixed = parseListingHtml(
    html([
      {
        "@type": "House",
        url,
        name: "Target",
        offers: { price: 250000, priceCurrency: "EUR" },
      },
      {
        "@type": "House",
        url: "https://authorized-example.invalid/other",
        name: "Recommended other property",
        floorSize: { value: 99, unitCode: "MTK" },
      },
    ]),
    url,
  );
  probe(
    "recommended_property_area_attached_to_target",
    [],
    field(mixed, "area"),
    field(mixed, "area").includes("99"),
  );
  const nested = parseListingHtml(
    html({
      "@type": "RealEstateListing",
      mainEntity: { "@type": "House", name: "One house" },
    }),
    url,
  );
  probe(
    "nested_listing_false_multiple",
    false,
    nested.multipleListings,
    nested.multipleListings,
  );
  const french = parseListingHtml(
    html({
      "@type": "House",
      offers: { price: "245 000,00", priceCurrency: "EUR" },
    }),
    url,
  );
  probe(
    "french_formatted_structured_price",
    ["245000"],
    field(french, "price"),
    !field(french, "price").length,
  );
  const noMain = parseListingHtml(
    "<div><h1>Appartement à Lille</h1><p>Prix 245000 euros</p><p>Surface habitable 51 m²</p><p>3 pièces</p><p>DPE D</p></div>",
    url,
  );
  probe(
    "div_layout_ignored",
    "literal property fields retained",
    noMain.evidence.length,
    noMain.evidence.length === 0,
  );
  const alt = parseListingHtml(
    '<main><h1>Appartement</h1><img alt="DPE : classe D"></main>',
    url,
  );
  probe(
    "explicit_dpe_alt_ignored",
    ["D"],
    field(alt, "dpe"),
    !field(alt, "dpe").length,
  );
  const graph = {
    "@graph": [
      { "@type": "House", offers: { "@id": "#offer" } },
      {
        "@type": "Offer",
        "@id": "#offer",
        price: 225000,
        priceCurrency: "EUR",
      },
    ],
  };
  const graphResult = parseListingHtml(html(graph), url);
  probe(
    "linked_offer_not_resolved",
    ["225000"],
    field(graphResult, "price"),
    !field(graphResult, "price").length,
  );
  const unrelated = {
    "@type": "Product",
    name: "Advert unrelated to the property",
    offers: { "@type": "Offer", price: 1, priceCurrency: "EUR" },
  };
  const legacy = parseListingHtml(html(unrelated), url)
    .evidence.filter((c) => c.field === "price")
    .map((c) => c.value);
  probe(
    "unified_url_parser_rejects_advert_price",
    [],
    legacy,
    legacy.includes("1"),
  );
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/robots.txt"))
      return new Response("User-agent: *\nDisallow:");
    if (init?.redirect === "error") throw new TypeError("Redirect rejected");
    throw new Error("Unexpected request");
  };
  const redirect = await importListing(url, ["authorized-example.invalid"]);
  probe(
    "ordinary_redirect_indistinguishable_from_network_error",
    "safe approved redirect or specific error",
    { code: redirect.code, message: redirect.message },
    redirect.code === "unavailable",
  );
  const missingCore = html(
    {
      "@type": "House",
      name: "Property",
      description: "Literal description",
      numberOfRooms: 3,
      additionalProperty: [
        { name: "DPE", value: "D" },
        { name: "Charges", value: "90 euros / mois" },
      ],
    },
    "<main><p>2 chambres</p><p>Appartement avec balcon.</p></main>",
  );
  globalThis.fetch = async (input) =>
    new Response(
      String(input).endsWith("/robots.txt")
        ? "User-agent: *\nDisallow:"
        : missingCore,
      { headers: { "Content-Type": "text/html" } },
    );
  const status = await importListing(url, ["authorized-example.invalid"]);
  probe(
    "extracted_status_without_price_city_area",
    "partial",
    {
      outcome: status.outcome,
      fields: [...new Set(status.evidence.map((e) => e.field))],
    },
    status.outcome === "extracted",
  );
} finally {
  globalThis.fetch = originalFetch;
}
// Short factual excerpts manually checked via the research browser. Not the original HTML,
// not evidence of permission to automate these sites, and not an end-to-end HTTP import test.
const realSources = [
  {
    url: "https://www.groupenationalimmobilier.fr/annonce/appartement-vente-2-pieces-caluire-et-cuire-44m2/GNI575751",
    text: "Caluire-et-Cuire (69300)\nPrix de vente 185 000 €\n43,57 m²habitables\n2 pièces\nDPE : C",
    observed: {
      price: "185000",
      city: "Caluire-et-Cuire (69300)",
      area: "43.57",
      rooms: "2",
      dpe: "C",
    },
  },
  {
    url: "https://www.verlinghem-immo.fr/annonce-immobiliere-vente-appartement-f2-verlinghem-235000%E2%82%AC-verlinghem-immobilier-agence-immobiliere-verlinghem-288",
    text: "Appartement F2\nvillage de Verlinghem\nSurface Habitable 50 m²\nDPE C (114)\nPrix de vente hors frais d'agence 214000€\n220 000 € H.A.I",
    observed: {
      price: "220000",
      city: "Verlinghem",
      area: "50",
      rooms: "2",
      dpe: "C",
    },
  },
];
for (const source of realSources) {
  const evidence = textEvidence(source.text, source.url),
    extracted = Object.fromEntries(
      ["price", "city", "area", "rooms", "dpe"].map((f) => [
        f,
        evidence
          .filter((e) => e.field === f)
          .map((e) => ({
            value: e.value,
            uncertain: e.certainty === "uncertain",
          })),
      ]),
    );
  reports.push({
    id: "real_page_factual_text_check",
    source: source.url,
    checkedAt: "2026-11-17",
    referenceFacts: source.observed,
    extracted,
    status: "text_only_not_http_import",
    originalHtmlFetched: false,
    automationPermissionQualified: false,
  });
}
await mkdir("work", { recursive: true });
await writeFile(
  "work/url-import-diagnostic.json",
  JSON.stringify(
    {
      baselineCommit: "8c0b222eaaed62e5535c5943e3d91b5db46f9095",
      workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
      executionCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      reports,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      issuesReproduced: reports.filter((r) => r.status === "issue_reproduced")
        .length,
      reports,
    },
    null,
    2,
  ),
);
