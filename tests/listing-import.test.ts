// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { reportLines } from "../src/domain/report";
import { parseListingHtml } from "../server/listing-parser";
import { importListing, robotsAllows } from "../server/listing";
import {
  blankReport,
  detectPlatform,
  textEvidence,
  prepareImportedProperty,
  listingRecordSchema,
} from "../src/domain/listing-import";
const url = "https://agency.example/annonce/maison";
const fixture = {
  "@type": "House",
  name: "MAISON FICTIVE TEST",
  description: "Description fournie, sans vérification.",
  numberOfRooms: 4,
  floorSize: { value: 82.5, unitCode: "MTK" },
  address: { addressLocality: "Tours" },
  offers: { price: 245000, priceCurrency: "EUR" },
  image: ["https://media.example/maison.jpg", "javascript:alert(1)"],
  additionalProperty: [
    { name: "DPE", value: "F" },
    { name: "Charges annuelles", value: "1200 € / an" },
  ],
};
const html = (data: unknown = fixture) =>
  `<html><body><script type="application/ld+json">${JSON.stringify(data)}</script></body></html>`;
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["https://www.leboncoin.fr/ad/ventes_immobilieres/1", "Leboncoin"],
  ["https://seloger.com/annonce/1", "SeLoger"],
  ["https://www.bienici.com/annonce/1", "Bien’ici"],
  ["https://leboncoin.fr.evil.example/1", "Agence ou autre site"],
])("detects the exact platform of %s", (source, label) =>
  expect(detectPlatform(source)).toBe(label),
);
it("extracts an authorized property’s EUR price, metric area, rooms, locality, DPE, description, charges and photo references", () => {
  const r = parseListingHtml(html(), url);
  for (const [field, value] of Object.entries({
    title: "MAISON FICTIVE TEST",
    city: "Tours",
    price: "245000",
    area: "82.5",
    rooms: "4",
    dpe: "F",
    charges: "1200 € / an",
    description: fixture.description,
  }))
    expect(r.evidence).toContainEqual(
      expect.objectContaining({ field, value, source: url, method: "jsonld" }),
    );
  expect(r.photos).toEqual([
    { url: "https://media.example/maison.jpg", source: url },
  ]);
});
it("does not assign an unrelated advertising offer or logo to the property", () => {
  const r = parseListingHtml(
    html([
      {
        "@type": "Organization",
        name: "Agence",
        image: "https://media.example/logo.jpg",
        offers: { "@type": "Offer", price: 1, priceCurrency: "EUR" },
      },
      { "@type": "Product", offers: { price: 2, priceCurrency: "EUR" } },
    ]),
    url,
  );
  expect(r.evidence).toEqual([]);
  expect(r.photos).toEqual([]);
});
it("preserves contradictory structured and metadata purchase prices", () => {
  const r = parseListingHtml(
    html() +
      `<meta property="product:price:currency" content="EUR"><meta property="product:price:amount" content="260000">`,
    url,
  );
  const p = prepareImportedProperty(url, { price: "245000" }, r.evidence, {
    ...blankReport(url),
    outcome: "extracted",
    evidence: r.evidence,
    photos: r.photos,
  });
  expect(p.facts.price.status).toBe("conflicting");
  expect(
    p.listingImport?.evidence.filter((c) => c.field === "price"),
  ).toHaveLength(2);
});
it("keeps unknown DPE and unsupported area units missing instead of guessing", () => {
  const r = parseListingHtml(
    html({
      ...fixture,
      floorSize: { value: 900, unitCode: "FTK" },
      additionalProperty: [{ name: "DPE", value: "inconnu" }],
    }),
    url,
  );
  expect(r.evidence.some((c) => c.field === "dpe" || c.field === "area")).toBe(
    false,
  );
});
it("ignores executable HTML and retains only literal strings without running scripts", () => {
  const r = parseListingHtml(
    '<script>globalThis.compromised=true</script><meta property="og:title" content="&lt;script&gt;test&lt;/script&gt;">',
    url,
  );
  expect((globalThis as any).compromised).toBeUndefined();
  expect(r.evidence[0].value).toBe("<script>test</script>");
});
it("extracts copied location and DPE and separates monthly charges from the purchase price", () => {
  const r = textEvidence(
    "Appartement TEST FICTIF\nTours (37000)\nPrix : 245 000 €\n82,5 m², 4 pièces\nDPE : F\nCharges : 100 € / mois",
    url,
    "ocr",
    2,
  );
  expect(r).toContainEqual(
    expect.objectContaining({
      field: "city",
      value: "Tours (37000)",
      page: 2,
      method: "ocr",
    }),
  );
  expect(r.filter((c) => c.field === "price").map((c) => c.value)).toEqual([
    "245000",
  ]);
  expect(r.find((c) => c.field === "charges")?.value).toBe(
    "100 € / mois",
  );
  expect(
    textEvidence("Prix 245000 € ; charges non précisées", url).some(
      (c) => c.field === "charges",
    ),
  ).toBe(false);
});
it("marks personal corrections as estimates and never saves before the caller chooses to commit", () => {
  const r = textEvidence("Prix 245000 €", url);
  const p = prepareImportedProperty(url, { price: "240000", dpe: "F" }, r, {
    ...blankReport(url),
    evidence: r,
  });
  expect(p.facts.price.status).toBe("estimated");
  expect(p.facts.price.source).toContain("245000 €");
  expect(p.investment?.observations[0]).toMatchObject({
    label: "DPE",
    status: "estimated",
  });
  expect(
    listingRecordSchema.safeParse({ ...p.listingImport, verified: true })
      .success,
  ).toBe(false);
});
it.each([
  "https://www.leboncoin.fr/ad/1",
  "https://www.seloger.com/annonce/1",
  "https://www.bienici.com/annonce/1",
  url,
])(
  "offers a truthful authorization fallback without fetching an unapproved source %s",
  async (source) => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const r = await importListing(source, "");
    expect(r).toMatchObject({
      outcome: "authorization_required",
      attempted: false,
      evidence: [],
      photos: [],
    });
    expect(fn).not.toHaveBeenCalled();
  },
);
it.each([
  "https://127.0.0.1/",
  "https://localhost/",
  "https://user:secret@agency.example/a",
  "https://agency.example:8080/a",
  "http://agency.example/a",
  "https://metadata.internal/a",
])("rejects unsafe URLs even if allowlisted: %s", async (source) => {
  const fn = vi.fn();
  vi.stubGlobal("fetch", fn);
  const r = await importListing(source, [new URL(source).hostname]);
  expect(r.code).toBe("unsafe_url");
  expect(fn).not.toHaveBeenCalled();
});
it("really reads only robots then HTML for a configured authorized source, without forwarding cookies or authorization", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("User-agent: *\nDisallow:"))
    .mockResolvedValueOnce(
      new Response(html(), { headers: { "Content-Type": "text/html" } }),
    );
  vi.stubGlobal("fetch", fetch);
  const r = await importListing(url, "agency.example");
  expect(r.outcome).toBe("extracted");
  expect(r.attempted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([
    "https://agency.example/robots.txt",
    url,
  ]);
  expect(fetch.mock.calls[1][1]).toMatchObject({ redirect: "error" });
  expect(fetch.mock.calls[1][1].headers).not.toHaveProperty("Cookie");
  expect(fetch.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
});
it("refuses robots-disallowed paths before requesting HTML", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response("User-agent: *\nDisallow: /annonce"));
  vi.stubGlobal("fetch", fetch);
  const r = await importListing(url, "agency.example");
  expect(r).toMatchObject({
    outcome: "blocked",
    code: "robots_denied",
    attempted: true,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([403, 429])(
  "falls back on HTTP %s with no retry or alternate endpoint",
  async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("User-agent: *\nDisallow:"))
      .mockResolvedValueOnce(new Response("Access denied", { status }));
    vi.stubGlobal("fetch", fetch);
    const r = await importListing(url, "agency.example");
    expect(r.code).toBe("access_blocked");
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
it("does not treat an anti-bot interstitial as a listing", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("User-agent: *\nDisallow:"))
      .mockResolvedValueOnce(
        new Response(
          '<title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/a"></script>',
          { headers: { "Content-Type": "text/html" } },
        ),
      ),
  );
  expect((await importListing(url, "agency.example")).code).toBe(
    "access_blocked",
  );
});
it("handles robots specificity, wildcards, query strings and allow precedence", () => {
  expect(
    robotsAllows(
      "User-agent: other\nDisallow: /\nUser-agent: *\nDisallow: /private*\nAllow: /private/public$",
      new URL("https://agency.example/private/public"),
    ),
  ).toBe(true);
  expect(
    robotsAllows(
      "User-agent: *\nDisallow: /*?secret=",
      new URL("https://agency.example/a?secret=1"),
    ),
  ).toBe(false);
  expect(
    robotsAllows(
      "User-agent: *\nDisallow: /\nUser-agent: Mimmo\nAllow: /",
      new URL(url),
    ),
  ).toBe(true);
});
it("bounds imported evidence and refuses forged verified metadata", () => {
  const r = parseListingHtml(
    html(
      Array.from({ length: 100 }, (_, i) => ({
        ...fixture,
        name: "FICTIF " + i,
        description: "x".repeat(4000),
      })),
    ),
    url,
  );
  expect(r.evidence.length).toBeLessThanOrEqual(32);
  expect(JSON.stringify(r.evidence).length).toBeLessThanOrEqual(12000);
  expect(
    listingRecordSchema.safeParse({
      ...blankReport(url),
      url: undefined,
      message: undefined,
      code: undefined,
    }).success,
  ).toBe(false);
});

it("reads only two explicitly authorized same-origin fictitious assets and keeps their fictitious status after edits and PDF export", async () => {
  const assets = {
    fetch: vi.fn(
      async () =>
        new Response(
          readFileSync(
            "public/import-examples/appartement-fictif.html",
            "utf8",
          ),
          { headers: { "Content-Type": "text/html" } },
        ),
    ),
  };
  const source =
      "https://mimmo.example/import-examples/appartement-fictif.html",
    r = await importListing(source, [], {
      origin: "https://mimmo.example",
      assets,
    });
  expect(r.platform).toBe("Exemple MIMMO fictif");
  expect(r.message).toContain("fictive");
  expect(r.evidence.find((e) => e.field === "price")?.value).toBe("155000");
  expect(r.photos[0].url).toBe(
    "https://mimmo.example/import-examples/illustration-fictive.svg",
  );
  const p = prepareImportedProperty(
    source,
    { title: "Un titre corrigé", price: "155000" },
    r.evidence,
    r,
  );
  expect(reportLines(p).join(" ")).toContain("DONNEES FICTIVES DE TEST");
  expect(assets.fetch).toHaveBeenCalledTimes(1);
});
it.each([
  "https://mimmo.example/api/properties",
  "https://other.example/import-examples/appartement-fictif.html",
  "https://mimmo.example/import-examples/appartement-fictif.html?token=private",
])(
  "does not grant the same-origin example exception to arbitrary URLs: %s",
  async (source) => {
    const assets = { fetch: vi.fn() };
    const r = await importListing(source, [], {
      origin: "https://mimmo.example",
      assets,
    });
    expect(r.attempted).toBe(false);
    expect(assets.fetch).not.toHaveBeenCalled();
  },
);

it("accepts a future server-registered partner adapter without changing the UI contract", async () => {
  const read = vi.fn().mockResolvedValue({
      evidence: [
        {
          field: "price",
          value: "155000",
          source: url,
          excerpt: "Prix partenaire fourni",
          method: "partner",
        },
      ],
      photos: [],
    }),
    fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const r = await importListing(url, [], {
    origin: "https://mimmo.example",
    assets: { fetch: vi.fn() },
    providers: [{ id: "fixture-partner", hosts: ["agency.example"], read }],
  });
  expect(r.evidence[0]).toMatchObject({
    field: "price",
    value: "155000",
    method: "partner",
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects a partner's forged verification fields rather than persisting them", async () => {
  const r = await importListing(url, [], {
    origin: "https://mimmo.example",
    assets: { fetch: vi.fn() },
    providers: [
      {
        id: "fixture-invalid",
        hosts: ["agency.example"],
        read: async () => ({
          evidence: [
            {
              field: "price",
              value: "155000",
              source: url,
              excerpt: "test",
              method: "partner",
              verified: true,
            } as any,
          ],
          photos: [],
        }),
      },
    ],
  });
  expect(r.outcome).toBe("unavailable");
  expect(r.evidence).toEqual([]);
});

it("does not turn the tail of a decimal room count or unsupported thousands format into a false value", () => {
  expect(
    textEvidence("Appartement 3,5 pièces, prix 850.500 €", url).filter(
      (c) => c.field === "rooms" || c.field === "price",
    ),
  ).toEqual([]);
});
