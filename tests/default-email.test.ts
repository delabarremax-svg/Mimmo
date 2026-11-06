// @vitest-environment node
// Real pinned Supabase SDK, synthetic HTTP provider. No actual email or remote user.
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { api, unseal, seal, type Environment } from "../server/api";
const user = {
  id: "a1111111-1111-4111-8111-111111111111",
  email: "owner@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  email_confirmed_at: "2026-11-06T00:00:00Z",
};
const env: Environment = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-synthetic",
  SESSION_KEY: "x".repeat(40),
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response() },
};
let flow: { challenge: string; kind: string; redirect: string; used: boolean },
  calls: string[],
  verifier: string;
const response = (value: unknown, status = 200) =>
  Response.json(value, { status });
const jwt = () =>
  [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
        aud: "authenticated",
      }),
    ),
    "synthetic-signature",
  ].join(".");
beforeEach(() => {
  calls = [];
  verifier = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      calls.push(url.pathname + url.search);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (
        url.pathname.endsWith("/signup") ||
        url.pathname.endsWith("/recover")
      ) {
        expect(body.code_challenge_method).toBe("s256");
        flow = {
          challenge: body.code_challenge,
          kind: url.pathname.endsWith("/signup") ? "signup" : "recovery",
          redirect: url.searchParams.get("redirect_to")!,
          used: false,
        };
        return response(flow.kind === "signup" ? user : {});
      }
      if (url.pathname.endsWith("/verify")) {
        // Default ConfirmationURL verifies at Supabase, then redirects with an auth code.
        const location = new URL(flow.redirect);
        location.searchParams.set("code", "synthetic-auth-code");
        return new Response(null, {
          status: 303,
          headers: { Location: location.href },
        });
      }
      if (
        url.pathname.endsWith("/token") &&
        url.searchParams.get("grant_type") === "pkce"
      ) {
        verifier = body.code_verifier;
        const challenge = Buffer.from(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ).toString("base64url");
        if (
          flow.used ||
          body.auth_code !== "synthetic-auth-code" ||
          challenge !== flow.challenge
        )
          return response(
            {
              error: "invalid_grant",
              error_description: "Rejected synthetic code",
            },
            400,
          );
        flow.used = true;
        return response({
          access_token: jwt(),
          refresh_token: "synthetic-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        });
      }
      if (url.pathname.endsWith("/user")) return response(user);
      throw new Error("Unexpected synthetic provider route");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function post(path: string, body: unknown) {
  return new Request("https://mimmo.test/api/" + path, {
    method: "POST",
    headers: {
      Origin: "https://mimmo.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function start(kind: "signup" | "recovery") {
  const r = await api(
    kind === "signup"
      ? post("signup", {
          email: user.email,
          password: "synthetic-password-123",
        })
      : post("reset-password", { email: user.email }),
    env,
  );
  expect(r.status).toBe(200);
  const raw = r.headers.get("Set-Cookie")!;
  expect(raw).toContain("Secure; HttpOnly; SameSite=Lax");
  expect(raw.length).toBeLessThan(4096);
  expect(raw).not.toContain("synthetic-refresh");
  const link = new URL("https://test.supabase.co/auth/v1/verify");
  link.searchParams.set("token", "synthetic-email-token");
  link.searchParams.set("type", kind);
  link.searchParams.set("redirect_to", flow.redirect);
  const clicked = await fetch(link, { redirect: "manual" });
  return { cookie: raw.split(";")[0], url: clicked.headers.get("Location")! };
}
it.each(["signup", "recovery"] as const)(
  "uses the default email verification redirect and real SDK PKCE exchange for %s",
  async (kind) => {
    const { cookie, url } = await start(kind);
    expect(new URL(url).pathname).toBe(
      kind === "signup" ? "/api/confirm" : "/api/recover",
    );
    const r = await api(new Request(url, { headers: { Cookie: cookie } }), env);
    expect(r.status).toBe(303);
    expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(r.headers.get("Cache-Control")).toContain("no-store");
    expect(r.headers.get("Location")).toBe(
      kind === "signup" ? "/?auth_notice=email_confirmed#" : "/?recovery=1#",
    );
    expect(calls.some((c) => c.includes("grant_type=pkce"))).toBe(true);
    expect(
      JSON.stringify(await r.text()) + r.headers.get("Location"),
    ).not.toContain("synthetic-refresh");
    if (kind === "recovery") {
      const value = r.headers
        .getSetCookie()
        .find((c) => c.startsWith("__Host-mimmo-recovery="))!
        .split(";")[0]
        .slice("__Host-mimmo-recovery=".length);
      const state = await unseal(value, env.SESSION_KEY);
      expect(state.refresh_token).toBe("synthetic-refresh");
      expect(state.until).toBeGreaterThan(Date.now());
    } else
      expect(
        r.headers.getSetCookie().some((c) => c.startsWith("__Host-mimmo=")),
      ).toBe(false);
  },
);
it("does not exchange a code opened in a different browser", async () => {
  const { url } = await start("recovery");
  const before = calls.length;
  const r = await api(new Request(url), env);
  expect(r.headers.get("Location")).toBe("/?auth_notice=email_link_invalid#");
  expect(calls).toHaveLength(before);
  expect(
    r.headers
      .getSetCookie()
      .some((c) => c.startsWith("__Host-mimmo-recovery=")),
  ).toBe(false);
});
it("rejects replayed codes without issuing a second recovery session", async () => {
  const { cookie, url } = await start("recovery");
  await api(new Request(url, { headers: { Cookie: cookie } }), env);
  const r = await api(new Request(url, { headers: { Cookie: cookie } }), env);
  expect(r.headers.get("Location")).toBe("/?auth_notice=email_link_invalid#");
  expect(
    r.headers
      .getSetCookie()
      .some((c) => c.startsWith("__Host-mimmo-recovery=")),
  ).toBe(false);
});
it.each(["tampered", "expired", "wrong-kind"])(
  "rejects %s pending verifier state before exchange",
  async (variant) => {
    const started = await start("recovery");
    let value = started.cookie.split("=").slice(1).join("=");
    if (variant === "tampered") value += "tampered";
    else {
      const data = await unseal(value, env.SESSION_KEY);
      if (variant === "expired") data.until = 1;
      else data.kind = "signup";
      value = await seal(data, env.SESSION_KEY);
    }
    const before = calls.length;
    const r = await api(
      new Request(started.url, {
        headers: { Cookie: "__Host-mimmo-email-recovery=" + value },
      }),
      env,
    );
    expect(r.headers.get("Location")).toBe("/?auth_notice=email_link_invalid#");
    expect(calls).toHaveLength(before);
  },
);
it("never accepts an implicit access token as recovery authorization", async () => {
  const r = await api(
    new Request(
      "https://mimmo.test/api/recover#access_token=untrusted&refresh_token=untrusted",
    ),
    env,
  );
  expect(r.headers.get("Location")).toBe("/?auth_notice=email_link_invalid#");
  expect(calls).toHaveLength(0);
});
it("cannot exchange a signup verifier through the recovery endpoint", async () => {
  const { cookie, url } = await start("signup");
  const value = cookie.split("=").slice(1).join("=");
  const r = await api(
    new Request(url.replace("/api/confirm", "/api/recover"), {
      headers: { Cookie: "__Host-mimmo-email-recovery=" + value },
    }),
    env,
  );
  expect(r.headers.get("Location")).toBe("/?auth_notice=email_link_invalid#");
  expect(calls.some((c) => c.includes("grant_type=pkce"))).toBe(false);
});
