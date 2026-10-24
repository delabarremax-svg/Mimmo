// @vitest-environment node
import { it, expect, vi } from "vitest";
import worker from "../deploy/v1-accounts-worker";
import demo from "../deploy/v1-demo-worker";
const password = "private-demo-password-test-12345";
it("protects the new accounts shell and API before any handler runs", async () => {
  const assets = { fetch: vi.fn().mockResolvedValue(new Response("shell")) };
  const env = { DEMO_PASSWORD: password, ASSETS: assets } as any;
  for (const path of ["/", "/api/session", "/api/signup"]) {
    const r = await worker.fetch(new Request("https://mimmo.test" + path), env);
    expect(r.status).toBe(401);
  }
  expect(assets.fetch).not.toHaveBeenCalled();
});
it("serves the authorized shell without forwarding the demo password", async () => {
  const assets = {
    fetch: vi.fn(async (r: Request) => {
      expect(r.headers.has("Authorization")).toBe(false);
      return new Response("shell");
    }),
  };
  const env = { DEMO_PASSWORD: password, ASSETS: assets } as any;
  const r = await worker.fetch(
    new Request("https://mimmo.test/", {
      headers: { Authorization: "Basic " + btoa("mimmo:" + password) },
    }),
    env,
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("X-Robots-Tag")).toContain("noindex");
});
it("fails closed without configured private-demo secret", async () => {
  const r = await demo.fetch(new Request("https://mimmo.test/"), {
    ASSETS: { fetch: async () => new Response("secret") },
  });
  expect(r.status).toBe(503);
});
