// @vitest-environment node
/** Real HTTP in our own test environment, not requests to an external agency. */
import { createServer } from "node:http";
import { it, expect } from "vitest";
import { importListing } from "../server/listing";
it("reads through a real local HTTP redirect and refuses blocked paths/foreign targets before requesting them", async () => {
  const target = "https://agency.example",
    calls: string[] = [];
  const server = createServer((req, res) => {
    const path = req.url || "";
    calls.push(path);
    expect(req.headers.authorization).toBeUndefined();
    expect(req.headers.cookie).toBeUndefined();
    if (path === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("User-agent: *\nDisallow: /private");
      return;
    }
    if (["/start", "/go-private", "/foreign"].includes(path)) {
      res.writeHead(302, {
        Location:
          path === "/start"
            ? "/final"
            : path === "/go-private"
              ? "/private"
              : "https://unapproved.example/",
      });
      res.end();
      return;
    }
    if (path === "/final") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<script type="application/ld+json">' +
          JSON.stringify({
            "@type": "Apartment",
            url: target + "/final",
            name: "Appartement à vendre à Lille",
            address: { addressLocality: "Lille" },
            offers: {
              price: 155000,
              priceCurrency: "EUR",
              businessFunction: "Sell",
            },
            floorSize: { value: 51, unitCode: "MTK" },
            numberOfRooms: 3,
            additionalProperty: [{ name: "DPE", value: "D" }],
          }) +
          "</script>",
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No local server");
  const local = "http://127.0.0.1:" + address.port,
    realFetch = globalThis.fetch;
  // The adapter routes the allowlisted synthetic origin to our server. Responses,
  // streaming and redirects are real HTTP; no external host is contacted.
  globalThis.fetch = async (input, init) => {
    const u = new URL(input instanceof Request ? input.url : String(input));
    if (u.origin !== target)
      throw new Error("Unexpected external host requested");
    return realFetch(local + u.pathname + u.search, init);
  };
  try {
    const r = await importListing(target + "/start", "agency.example");
    expect(r.outcome).toBe("extracted");
    for (const [field, value] of Object.entries({
      price: "155000",
      city: "Lille",
      area: "51",
      rooms: "3",
      dpe: "D",
    }))
      expect(r.evidence).toContainEqual(
        expect.objectContaining({ field, value, source: target + "/final" }),
      );
    expect(calls).toEqual(["/robots.txt", "/start", "/final"]);
    calls.length = 0;
    expect(
      (await importListing(target + "/go-private", "agency.example")).code,
    ).toBe("robots_denied");
    expect(calls).toEqual(["/robots.txt", "/go-private"]);
    calls.length = 0;
    expect(
      (await importListing(target + "/foreign", "agency.example")).code,
    ).toBe("redirect_not_authorized");
    expect(calls).toEqual(["/robots.txt", "/foreign"]);
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 10000);
