// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
import { api, seal, type Environment } from "../server/api";
import {
  prepareImportedProperty,
  blankReport,
  textEvidence,
} from "../src/domain/listing-import";
const owner = "a1111111-1111-4111-8111-111111111111",
  url = "https://agency.example/annonce/1";
const env: Environment = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-synthetic",
  SESSION_KEY: "k".repeat(40),
  ASSETS: { fetch: async () => new Response() },
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.createClient.mockReturnValue({
    auth: { getUser: mock.getUser },
    rpc: mock.rpc,
  });
  mock.getUser.mockResolvedValue({
    data: { user: { id: owner, email: "owner@example.invalid" } },
  });
  mock.rpc.mockResolvedValue({ data: 1, error: null });
});
afterEach(() => vi.unstubAllGlobals());
async function request(
  path: string,
  body: unknown,
  method = "POST",
  authenticated = true,
) {
  return new Request("https://mimmo.test/api/" + path, {
    method,
    headers: {
      Origin: "https://mimmo.test",
      "Content-Type": "application/json",
      ...(authenticated
        ? {
            Cookie:
              "__Host-mimmo=" +
              (await seal(
                {
                  access_token: "owner-token",
                  refresh_token: "owner-refresh",
                  until: Date.now() + 100000,
                },
                env.SESSION_KEY,
              )),
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
}
it("refuses anonymous import before contacting any source", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    (await api(await request("import-listing", { url }, "POST", false), env))
      .status,
  ).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("reports an unapproved portal with structured fallback and performs no save or outgoing fetch", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const r = await api(
    await request("import-listing", { url: "https://www.leboncoin.fr/ad/1" }),
    env,
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    platform: "Leboncoin",
    outcome: "authorization_required",
    attempted: false,
    evidence: [],
  });
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("only the operator-configured source can be fetched by a verified user", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("User-agent: *\nDisallow:"))
    .mockResolvedValueOnce(
      new Response(
        '<script type="application/ld+json">{"@type":"House","offers":{"price":200000,"priceCurrency":"EUR"}}</script>',
        { headers: { "Content-Type": "text/html" } },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const r = await api(await request("import-listing", { url }), {
    ...env,
    LISTING_ALLOWED_HOSTS: "agency.example",
  });
  expect(await r.json()).toMatchObject({
    attempted: true,
    outcome: "partial",
    evidence: [expect.objectContaining({ field: "price", value: "200000" })],
  });
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("accepts reviewed import evidence using only the authenticated user’s token and the existing private RPC", async () => {
  const evidence = textEvidence(
      "Appartement FICTIF\nPrix 200000 €\nDPE : E",
      url,
    ),
    p = prepareImportedProperty(
      url,
      { title: "FICTIF relu", price: "200000", dpe: "E" },
      evidence,
      blankReport(url),
    );
  const r = await api(await request("properties", p, "PUT"), env);
  expect(r.status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith(
    "save_private_project",
    expect.objectContaining({
      project_id: p.id,
      expected_version: 0,
      project_payload: expect.objectContaining({
        listingImport: expect.objectContaining({
          platform: "Agence ou autre site",
        }),
      }),
    }),
  );
  expect(mock.createClient.mock.calls[1][2].global.headers.Authorization).toBe(
    "Bearer owner-token",
  );
  expect(mock.rpc.mock.calls[0][1].project_payload).not.toHaveProperty(
    "owner_id",
  );
});
it("does not let a client forge verified import fields or control authorization hosts", async () => {
  const evidence = textEvidence("Prix 200000 €", url),
    p = prepareImportedProperty(
      url,
      { price: "200000" },
      evidence,
      blankReport(url),
    );
  (p.listingImport!.evidence[0] as any).verified = true;
  expect((await api(await request("properties", p, "PUT"), env)).status).toBe(
    400,
  );
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(
    (
      await api(
        await request("import-listing", {
          url,
          authorizedHosts: "agency.example",
        }),
        env,
      )
    ).status,
  ).toBe(400);
});
it("rate limits by authenticated identity before attempting a source request", async () => {
  const limit = vi.fn().mockResolvedValue({ success: false }),
    fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    (
      await api(await request("import-listing", { url }), {
        ...env,
        AUTH_LIMITER: { limit },
      })
    ).status,
  ).toBe(429);
  expect(limit).toHaveBeenCalledWith({ key: "import:" + owner });
  expect(fetch).not.toHaveBeenCalled();
});

it("reads the explicit MIMMO example through its own assets without sending private session headers", async () => {
  const assets = {
    fetch: vi.fn(async (request: Request) => {
      expect(request.url).toBe(
        "https://mimmo.test/import-examples/appartement-fictif.html",
      );
      expect(request.headers.has("Cookie")).toBe(false);
      expect(request.headers.has("Authorization")).toBe(false);
      return new Response(
        '<script type="application/ld+json">{"@type":"House","name":"FICTIF MIMMO","offers":{"price":155000,"priceCurrency":"EUR"}}</script>',
        { headers: { "Content-Type": "text/html" } },
      );
    }),
  };
  const r = await api(
    await request("import-listing", {
      url: "https://mimmo.test/import-examples/appartement-fictif.html",
    }),
    { ...env, ASSETS: assets },
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    platform: "Exemple MIMMO fictif",
    attempted: true,
    evidence: expect.arrayContaining([
      expect.objectContaining({ field: "price", value: "155000" }),
    ]),
  });
  expect(assets.fetch).toHaveBeenCalledTimes(1);
  expect(mock.rpc).not.toHaveBeenCalled();
});
