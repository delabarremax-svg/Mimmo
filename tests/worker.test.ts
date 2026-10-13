// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import worker from "../deploy/worker";
const password = "synthetic-test-password-12345";
const request = (path = "/", credentials?: string, method = "GET") =>
  new Request(`https://demo.example${path}`, {
    method,
    headers: credentials ? { Authorization: `Basic ${btoa(credentials)}` } : {},
  });
const environment = () => ({
  DEMO_PASSWORD: password,
  ASSETS: {
    fetch: vi.fn(
      async (r: Request) =>
        new Response(
          r.url.endsWith(".js") ? "export {}" : "<html>MIMMO</html>",
        ),
    ),
  },
});
describe("Protection serveur de la démonstration", () => {
  it.each([
    "/",
    "/index.html",
    "/assets/app.js",
    "/assets/style.css",
    "/robots.txt",
    "/unknown",
  ])("interdit tout accès anonyme à %s", async (path) => {
    const env = environment();
    const r = await worker.fetch(request(path), env);
    expect(r.status).toBe(401);
    expect(r.headers.get("WWW-Authenticate")).toContain("Basic");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, "short", "un mot de passe avec espaces"])(
    "ferme l’accès si le secret est absent ou invalide",
    async (secret) => {
      const env = { ...environment(), DEMO_PASSWORD: secret };
      expect((await worker.fetch(request(), env)).status).toBe(503);
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    },
  );
  it.each(["mimmo:wrong", "other:" + password])(
    "refuse les mauvais identifiants",
    async (credentials) => {
      expect(
        (await worker.fetch(request("/", credentials), environment())).status,
      ).toBe(401);
    },
  );
  it("refuse les en-têtes malformés sans erreur serveur", async () => {
    const r = request();
    r.headers.set("Authorization", "Basic !!!");
    expect((await worker.fetch(r, environment())).status).toBe(401);
  });
  it("sert les fichiers après authentification et applique les en-têtes de sécurité", async () => {
    const env = environment();
    const r = await worker.fetch(
      request("/assets/app.js", `mimmo:${password}`),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("export {}");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(r.headers.get("Content-Security-Policy")).toContain(
      "connect-src 'none'",
    );
    expect(r.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(env.ASSETS.fetch.mock.calls[0][0].headers.has("Authorization")).toBe(
      false,
    );
  });
  it("interdit les requêtes de modification", async () => {
    const env = environment();
    expect(
      (await worker.fetch(request("/", `mimmo:${password}`, "POST"), env))
        .status,
    ).toBe(405);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it("ne transmet pas de mot de passe sur HTTP", async () => {
    const env = environment();
    expect(
      (await worker.fetch(new Request("http://demo.example/"), env)).status,
    ).toBe(403);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
