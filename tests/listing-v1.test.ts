// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import { extractAuthorizedListing } from "../server/listing";
afterEach(() => vi.unstubAllGlobals());
it.each([
  "http://example.com/",
  "https://127.0.0.1/",
  "https://localhost/",
  "https://user:pass@example.com/",
  "https://example.com:8443/",
  "https://unapproved.example/",
])("rejects unsafe or unauthorized URL %s before network", async (url) => {
  const fn = vi.fn();
  vi.stubGlobal("fetch", fn);
  await expect(extractAuthorizedListing(url, "example.com")).rejects.toThrow();
  expect(fn).not.toHaveBeenCalled();
});
it("fails closed when robots disallows the path", async () => {
  const fn = vi
    .fn()
    .mockResolvedValue(new Response("User-agent: *\nDisallow: /"));
  vi.stubGlobal("fetch", fn);
  await expect(
    extractAuthorizedListing("https://example.com/listing", "example.com"),
  ).rejects.toThrow("Collecte refusée");
  expect(fn).toHaveBeenCalledTimes(1);
});
it("extracts structured data only from an authorized source", async () => {
  const fn = vi
    .fn()
    .mockResolvedValueOnce(new Response("User-agent: *\nDisallow:"))
    .mockResolvedValueOnce(
      new Response(
        '<script type="application/ld+json">{"@type":"Offer","price":200000,"priceCurrency":"EUR"}</script>',
      ),
    );
  vi.stubGlobal("fetch", fn);
  expect(
    (
      await extractAuthorizedListing(
        "https://example.com/listing",
        "example.com",
      )
    )[0].value,
  ).toBe("200000");
  expect(fn.mock.calls[1][1].redirect).toBe("error");
});
