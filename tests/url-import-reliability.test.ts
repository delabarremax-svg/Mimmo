// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { parseListingHtml } from "../server/listing-parser";
import {
  importListing,
  extractAuthorizedListing,
  robotsAllows,
} from "../server/listing";
const url = "https://agency.example/property/42";
const sale = {
  "@type": "House",
  url,
  name: "Maison à vendre à Tours",
  address: { addressLocality: "Tours" },
  floorSize: { value: 82.5, unitCode: "MTK" },
  numberOfRooms: 4,
  offers: {
    price: 245000,
    priceCurrency: "EUR",
    businessFunction: "https://purl.org/goodrelations/v1#Sell",
  },
  additionalProperty: [{ name: "DPE", value: "D" }],
};
const page = (data: unknown, body = "") =>
  `<html><body><script type="application/ld+json">${JSON.stringify(data)}</script>${body}</body></html>`;
const values = (html: string, field: string) =>
  parseListingHtml(html, url)
    .evidence.filter((e) => e.field === field)
    .map((e) => e.value);
const response = (html: string, status = 200, headers = {}) =>
  new Response(html, {
    status,
    headers: { "Content-Type": "text/html", ...headers },
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("selects the URL target instead of taking missing fields from recommendations", () => {
  const { floorSize, ...withoutArea } = sale;
  const html = page([
    withoutArea,
    {
      ...sale,
      url: "https://agency.example/property/other",
      floorSize: { value: 99, unitCode: "MTK" },
      address: { addressLocality: "Paris" },
    },
  ]);
  expect(values(html, "city")).toEqual(["Tours"]);
  expect(values(html, "area")).toEqual([]);
  expect(parseListingHtml(html, url).multipleListings).toBe(false);
});
it("abstains entirely when multiple structured properties cannot be attributed", () => {
  const html = page([
    { ...sale, url: undefined },
    {
      ...sale,
      url: undefined,
      name: "Another",
      floorSize: { value: 99, unitCode: "MTK" },
    },
  ]);
  expect(parseListingHtml(html, url)).toMatchObject({
    multipleListings: true,
    evidence: [],
    photos: [],
  });
});
it("resolves a linked offer and WebPage mainEntity without merging the other property", () => {
  const { offers, ...p } = sale;
  const html = page({
    "@graph": [
      { "@type": "WebPage", url, mainEntity: { "@id": "#target" } },
      { ...p, url: undefined, "@id": "#target", offers: { "@id": "#offer" } },
      { "@id": "#offer", "@type": "Offer", ...offers },
      {
        ...sale,
        url: undefined,
        "@id": "#other",
        offers: { ...offers, price: 1 },
      },
    ],
  });
  expect(values(html, "price")).toEqual(["245000"]);
});
it("treats a listing wrapper and its physical mainEntity as one property", () =>
  expect(
    parseListingHtml(
      page({ "@type": "RealEstateListing", url, mainEntity: sale }),
      url,
    ).multipleListings,
  ).toBe(false));
it("deduplicates identical structured definitions but does not merge different properties", () =>
  expect(parseListingHtml(page([sale, sale]), url).multipleListings).toBe(
    false,
  ));
it("accepts same-origin canonical and known tracking params while retaining meaningful query IDs", () => {
  expect(
    parseListingHtml(page(sale), url + "?utm_source=test").evidence.some(
      (e) => e.field === "price",
    ),
  ).toBe(true);
  expect(
    parseListingHtml(page({ ...sale, url: url + "?id=other" }), url + "?id=42")
      .evidence,
  ).toEqual([]);
});
it("routes LeaseOut to rent and never creates a purchase price", () => {
  const html = page({
    ...sale,
    name: "Maison",
    offers: {
      price: 900,
      priceCurrency: "EUR",
      businessFunction: "https://purl.org/goodrelations/v1#LeaseOut",
    },
  });
  expect(values(html, "price")).toEqual([]);
  expect(values(html, "rent")).toEqual(["900 €"]);
});
it("uses monthly priceSpecification as rent, not sale", () => {
  const html = page({
    ...sale,
    offers: {
      priceSpecification: {
        price: 900,
        priceCurrency: "EUR",
        billingDuration: "P1M",
      },
    },
  });
  expect(values(html, "price")).toEqual([]);
  expect(values(html, "rent")).toEqual(["900 € / mois"]);
});
it("does not silently decide sale when the transaction is unknown", () => {
  const p = parseListingHtml(
    page({
      ...sale,
      name: "House",
      offers: { price: 245000, priceCurrency: "EUR" },
    }),
    url,
  );
  expect(p.evidence.find((e) => e.field === "price")).toMatchObject({
    value: "245000",
    certainty: "uncertain",
  });
});
it("keeps rent versus sale conflict uncertain and reports it", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(""))
      .mockResolvedValueOnce(
        response(
          page(
            {
              ...sale,
              offers: {
                price: 900,
                priceCurrency: "EUR",
                businessFunction: "LeaseOut",
              },
            },
            "<main><h1>Maison à vendre</h1></main>",
          ),
        ),
      ),
  );
  const r = await importListing(url, "agency.example");
  expect(r.code).toBe("transaction_conflict");
  expect(
    r.evidence
      .filter((e) => ["price", "rent"].includes(e.field))
      .every((e) => e.certainty === "uncertain"),
  ).toBe(true);
});
it.each(["245 000,00", "245\u202f000,00", "245\u00a0000.00"])(
  "normalizes explicit French structured number %s",
  (price) =>
    expect(
      values(page({ ...sale, offers: { ...sale.offers, price } }), "price"),
    ).toEqual(["245000"]),
);
it.each(["245.000", "24O000", "245,000.00", "-1"])(
  "rejects ambiguous/corrupted structured number %s",
  (price) =>
    expect(
      values(page({ ...sale, offers: { ...sale.offers, price } }), "price"),
    ).toEqual([]),
);
it("extracts a div/table fixture, including city, split rooms and explicit DPE alt", () => {
  const html =
    '<div><h1>Appartement à vendre</h1><table><tr><th>Ville</th><td>Lille</td></tr><tr><th>Prix de vente</th><td>155 000 €</td></tr><tr><th>Surface habitable</th><td>51 m²</td></tr><tr><th>Nombre de pièces</th><td>3</td></tr></table><img alt="DPE : classe D"></div>';
  for (const [field, value] of Object.entries({
    price: "155000",
    city: "Lille",
    area: "51",
    rooms: "3",
    dpe: "D",
  }))
    expect(values(html, field)).toContain(value);
});
it("does not guess a DPE from the letters of a full scale or GES", () => {
  expect(
    values(
      '<div><h1>Maison à vendre</h1><p>Prix de vente 245000 €</p><img alt="DPE : A B C D E F G"><img alt="GES : D"></div>',
      "dpe",
    ),
  ).toEqual([]);
});
it("keeps HAI separate from net seller and agency fees in literal source notes", () => {
  const html =
    "<main><h1>Appartement à vendre à Verlinghem</h1><p>Prix net vendeur : 214000 €</p><p>Honoraires : 6000 €</p><p>220 000 € H.A.I</p></main>";
  expect(values(html, "price")).toEqual(["220000"]);
  const notes = values(html, "features").join(" ");
  expect(notes).toContain("214000");
  expect(notes).toContain("6000");
});
it("does not attach the non-habitable JSON-LD floor size to the living area", () => {
  const html = page(
    { ...sale, floorSize: { value: 80, unitCode: "MTK" } },
    "<main><h1>Maison à vendre</h1><p>Surface au sol 80 m² (62 m² Carrez)</p><p>Surface habitable 60 m²</p></main>",
  );
  expect(values(html, "area")).toEqual(["60"]);
  expect(values(html, "floorArea")).toContain("80");
  expect(values(html, "carrezArea")).toContain("62");
});
it("excludes visibly separated recommendations and finance values from DOM fields", () => {
  const html =
    "<main><h1>Appartement à vendre à Lille</h1><p>Prix de vente 155000 €</p><p>Surface habitable 51 m²</p><h2>Biens similaires</h2><p>Prix de vente 1 €</p><p>Surface habitable 999 m²</p><h2>Votre financement</h2><p>Prix de vente 2 €</p></main>";
  expect(values(html, "price")).toEqual(["155000"]);
  expect(values(html, "area")).toEqual(["51"]);
});
it("abstains from unsegmented DOM cards rather than mixing fields", () => {
  const { floorSize, ...p } = sale;
  const html = page(
    p,
    '<main><h1>Maison à vendre</h1><p>Surface habitable 82 m²</p><div><a href="/another">Appartement à vendre</a><p>Surface habitable 999 m²</p></div></main>',
  );
  expect(values(html, "area")).toEqual([]);
});
it("does not mark an import complete without the required core fields", async () => {
  const { address, floorSize, offers, ...p } = sale;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(""))
      .mockResolvedValueOnce(
        response(
          page(
            p,
            "<main><h1>Maison à vendre</h1><p>2 chambres</p><p>Maison avec balcon.</p><p>Charges 90 € / mois</p></main>",
          ),
        ),
      ),
  );
  expect((await importListing(url, "agency.example")).outcome).toBe("partial");
});
it("uses the same strict parser for both remote entry points", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) =>
      String(input).endsWith("/robots.txt")
        ? new Response("")
        : response(page(sale)),
    ),
  );
  const modern = await importListing(url, "agency.example"),
    legacy = await extractAuthorizedListing(url, "agency.example");
  for (const field of ["price", "city", "area", "rooms"])
    expect(legacy.find((e) => e.field === field)?.value).toBe(
      modern.evidence.find((e) => e.field === field)?.value,
    );
});
it("legacy URL route rejects an unrelated advertising Product/Offer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) =>
      String(input).endsWith("/robots.txt")
        ? new Response("")
        : response(
            page({
              "@type": "Product",
              offers: { "@type": "Offer", price: 1, priceCurrency: "EUR" },
            }),
          ),
    ),
  );
  await expect(extractAuthorizedListing(url, "agency.example")).rejects.toThrow(
    "Aucune information",
  );
});
it("keeps explicit empty robots groups separate and selects the longest matching agent", () => {
  expect(
    robotsAllows(
      "User-agent: Mimmo\nDisallow:\nUser-agent: *\nDisallow: /",
      new URL(url),
    ),
  ).toBe(true);
  expect(
    robotsAllows(
      "User-agent: mim\nDisallow: /\nUser-agent: Mimmo\nAllow: /",
      new URL(url),
    ),
  ).toBe(true);
});
it("follows only approved HTTPS redirects with robots checked at every path and origin", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const u = String(input);
      calls.push(u);
      expect(init?.redirect).toBe("manual");
      expect(init?.credentials).toBe("omit");
      expect(Object.keys(init?.headers || {})).not.toContain("Authorization");
      if (u.endsWith("/robots.txt"))
        return new Response("User-agent: *\nDisallow:");
      if (u === url)
        return response("", 301, {
          Location: "https://www.agency.example/final",
        });
      return response(
        page({ ...sale, url: "https://www.agency.example/final" }),
      );
    }),
  );
  const r = await importListing(url, ["agency.example", "www.agency.example"]);
  expect(r.evidence.find((e) => e.field === "price")?.source).toBe(
    "https://www.agency.example/final",
  );
  expect(calls).toEqual([
    "https://agency.example/robots.txt",
    url,
    "https://www.agency.example/robots.txt",
    "https://www.agency.example/final",
  ]);
});
it.each([
  "https://unapproved.example/path",
  "http://agency.example/path",
  "https://127.0.0.1/secret",
  "https://user:password@agency.example/path",
])("does not request unsafe redirect target %s", async (target) => {
  const fn = vi.fn(async (input) =>
    String(input).endsWith("/robots.txt")
      ? new Response("")
      : response("", 302, { Location: target }),
  );
  vi.stubGlobal("fetch", fn);
  const r = await importListing(url, "agency.example");
  expect(r.outcome).toBe("blocked");
  expect(fn).toHaveBeenCalledTimes(2);
});
it("checks robots before following a same-origin redirect into a forbidden path", async () => {
  const fn = vi.fn(async (input) =>
    String(input).endsWith("/robots.txt")
      ? new Response("User-agent: *\nDisallow: /private")
      : response("", 302, { Location: "/private" }),
  );
  vi.stubGlobal("fetch", fn);
  expect((await importListing(url, "agency.example")).code).toBe(
    "robots_denied",
  );
  expect(fn).toHaveBeenCalledTimes(2);
});
it("stops a redirect loop and does not retry CAPTCHA, 403 or 429", async () => {
  const fn = vi.fn(async (input) =>
    String(input).endsWith("/robots.txt")
      ? new Response("")
      : response("", 302, { Location: url }),
  );
  vi.stubGlobal("fetch", fn);
  expect((await importListing(url, "agency.example")).code).toBe(
    "redirect_loop",
  );
  expect(fn).toHaveBeenCalledTimes(2);
});
it.each([403, 429])("fails closed when robots responds %s", async (status) => {
  const fn = vi.fn().mockResolvedValue(new Response("", { status }));
  vi.stubGlobal("fetch", fn);
  expect((await importListing(url, "agency.example")).code).toBe(
    "access_blocked",
  );
  expect(fn).toHaveBeenCalledTimes(1);
});
it("distinguishes network errors and timeouts without returning sensitive fetch messages", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("secret internal detail")),
  );
  const r = await importListing(url, "agency.example");
  expect(r.code).toBe("network_error");
  expect(r.message).not.toContain("secret");
});
it("does not overwrite conflicting linked offer IDs with whichever script comes last", () => {
  const { offers, ...p } = sale;
  const html = page({
    "@graph": [
      { ...p, offers: { "@id": "#offer" } },
      { "@id": "#offer", "@type": "Offer", ...offers },
      { "@id": "#offer", "@type": "Offer", ...offers, price: 1 },
    ],
  });
  expect(values(html, "price")).toEqual([]);
});
it("reads the labelled HAI price, not fee/net figures, even on a single line", () => {
  const html =
    "<main><h1>Appartement à vendre</h1><p>Prix net vendeur : 214000 € ; Honoraires : 6000 € ; Prix honoraires inclus : 220000 €</p></main>";
  expect(values(html, "price")).toEqual(["220000"]);
});
it("rejects JSON returned instead of a robots policy", async () => {
  const fn = vi.fn().mockResolvedValue(new Response('{"error":"no robots"}'));
  vi.stubGlobal("fetch", fn);
  expect((await importListing(url, "agency.example")).code).toBe(
    "robots_unavailable",
  );
  expect(fn).toHaveBeenCalledTimes(1);
});

it("extracts an Offer only when its itemOffered is the selected property", () => {
  const { offers, ...p } = sale;
  expect(
    values(page({ "@type": "Offer", ...offers, itemOffered: p }), "price"),
  ).toEqual(["245000"]);
});
it("does not call an import complete when two asking prices for the same property remain unresolved", async () => {
  const html = page({
    ...sale,
    offers: [sale.offers, { ...sale.offers, price: 255000 }],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) =>
      String(input).endsWith("/robots.txt") ? new Response("") : response(html),
    ),
  );
  expect((await importListing(url, "agency.example")).outcome).toBe("partial");
});
it("does not fetch an approved redirect destination whose own robots forbids the page", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const u = String(input);
      calls.push(u);
      if (u === "https://agency.example/robots.txt") return new Response("");
      if (u === url)
        return response("", 301, {
          Location: "https://www.agency.example/private",
        });
      if (u === "https://www.agency.example/robots.txt")
        return new Response("User-agent: *\nDisallow: /private");
      throw new Error("Must not request private page");
    }),
  );
  expect(
    (await importListing(url, ["agency.example", "www.agency.example"])).code,
  ).toBe("robots_denied");
  expect(calls).toHaveLength(3);
});
it("bounds distinct redirect hops even without a loop", async () => {
  const fn = vi.fn(async (input) =>
    String(input).endsWith("/robots.txt")
      ? new Response("")
      : response("", 302, { Location: "/hop/" + fn.mock.calls.length }),
  );
  vi.stubGlobal("fetch", fn);
  expect((await importListing(url, "agency.example")).code).toBe(
    "redirect_limit",
  );
  expect(fn).toHaveBeenCalledTimes(5);
});
it("will not follow a robots redirect to an unapproved host", async () => {
  const fn = vi
    .fn()
    .mockResolvedValue(
      response("", 301, { Location: "https://unapproved.example/robots.txt" }),
    );
  vi.stubGlobal("fetch", fn);
  expect((await importListing(url, "agency.example")).code).toBe(
    "redirect_not_authorized",
  );
  expect(fn).toHaveBeenCalledTimes(1);
});
it("reports an expired overall timeout without exposing the thrown message", async () => {
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValue(new DOMException("sensitive detail", "AbortError")),
  );
  const r = await importListing(url, "agency.example");
  expect(r.code).toBe("timeout");
  expect(r.message).not.toContain("sensitive");
});
it("distinguishes received-but-unusable structured data from a network failure", async () => {
  const tooComplex = {
    "@type": "House",
    large: Array.from({ length: 100 }, () =>
      Array.from({ length: 100 }, () => 1),
    ),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) =>
      String(input).endsWith("/robots.txt")
        ? new Response("")
        : response(page(tooComplex)),
    ),
  );
  expect((await importListing(url, "agency.example")).code).toBe(
    "extraction_failed",
  );
});
it("keeps an explicitly labelled structured agency fee out of asking-price candidates", () => {
  const html = page({
    ...sale,
    offers: [
      sale.offers,
      { name: "Honoraires agence", price: 6000, priceCurrency: "EUR" },
    ],
  });
  expect(values(html, "price")).toEqual(["245000"]);
  expect(values(html, "features").join(" ")).toContain("6000");
});
it("does not infer the property DPE from energy scale endpoints", () => {
  const { additionalProperty, ...p } = sale;
  expect(
    values(
      page({
        ...p,
        hasEnergyPerformance: {
          energyEfficiencyScaleMin: "A",
          energyEfficiencyScaleMax: "G",
        },
      }),
      "dpe",
    ),
  ).toEqual([]);
});
it("will not use unsegmented secondary property headings as fields of the primary property", () => {
  const { floorSize, ...p } = sale;
  expect(
    values(
      page(
        p,
        "<main><h1>Maison à vendre</h1><p>Description du bien principal.</p><div><h2>Appartement à vendre</h2><p>Surface habitable 99 m²</p></div></main>",
      ),
      "area",
    ),
  ).toEqual([]);
});
it("compares robots UTF-8 and escaped unreserved octets without decoding reserved slashes", () => {
  expect(
    robotsAllows(
      "User-agent: *\nDisallow: /privé",
      new URL("https://agency.example/priv%C3%A9"),
    ),
  ).toBe(false);
  expect(
    robotsAllows(
      "User-agent: *\nDisallow: /priv%61te",
      new URL("https://agency.example/private"),
    ),
  ).toBe(false);
  expect(
    robotsAllows(
      "User-agent: *\nDisallow: /a%2Fb",
      new URL("https://agency.example/a/b"),
    ),
  ).toBe(true);
});
it("matches wildcard/end robots rules without exponential regex backtracking", () => {
  const target = new URL("https://agency.example/listing?secret=1");
  expect(robotsAllows("User-agent: *\nDisallow: /*?secret=*$", target)).toBe(
    false,
  );
  expect(robotsAllows("User-agent: *\nDisallow: /*?secret=2$", target)).toBe(
    true,
  );
  expect(
    robotsAllows(
      "User-agent: *\nDisallow: /*ing$",
      new URL("https://agency.example/listing-extra"),
    ),
  ).toBe(true);
});
it("never picks the first class from an inline text energy scale or range", () => {
  for (const scale of [
    "DPE A B C D E F G",
    "DPE : classe C-D",
    "DPE : A | B | C | D | E | F | G",
  ])
    expect(
      values(
        "<main><h1>Maison à vendre</h1><p>" + scale + "</p></main>",
        "dpe",
      ),
    ).toEqual([]);
  expect(
    values("<main><h1>Maison à vendre</h1><p>DPE C, GES D</p></main>", "dpe"),
  ).toEqual(["C"]);
});
