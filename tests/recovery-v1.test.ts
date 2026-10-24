// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({
  createClient: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
import { api, seal, type Environment } from "../server/api";
const env: Environment = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test",
  SESSION_KEY: "s".repeat(40),
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response() },
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.createClient.mockReturnValue({ auth: mock });
});
function post(path: string, body: unknown, cookie = "") {
  return new Request("https://mimmo.test/api/" + path, {
    method: "POST",
    headers: {
      Origin: "https://mimmo.test",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}
it("requests a recovery email without reporting whether the user exists", async () => {
  mock.resetPasswordForEmail.mockResolvedValue({ error: null });
  const r = await api(
    post("reset-password", { email: "alice@example.com" }),
    env,
  );
  expect(r.status).toBe(200);
  expect(mock.resetPasswordForEmail).toHaveBeenCalledWith("alice@example.com", {
    redirectTo: "https://mimmo.test/api/recover",
  });
});
it("refuses password changes without a dedicated recovery cookie", async () => {
  expect(
    (await api(post("update-password", { password: "new-password-long" }), env))
      .status,
  ).toBe(401);
  expect(mock.updateUser).not.toHaveBeenCalled();
});
it("rejects expired recovery sessions", async () => {
  const token = await seal(
    { access_token: "a", refresh_token: "r", until: 1 },
    env.SESSION_KEY,
  );
  expect(
    (
      await api(
        post(
          "update-password",
          { password: "new-password-long" },
          "__Host-mimmo-recovery=" + token,
        ),
        env,
      )
    ).status,
  ).toBe(401);
  expect(mock.updateUser).not.toHaveBeenCalled();
});
it("verifies recovery identity, updates password and revokes sessions", async () => {
  const token = await seal(
    { access_token: "a", refresh_token: "r", until: Date.now() + 10000 },
    env.SESSION_KEY,
  );
  mock.setSession.mockResolvedValue({ error: null });
  mock.getUser.mockResolvedValue({ data: { user: { id: "alice" } } });
  mock.updateUser.mockResolvedValue({ error: null });
  mock.signOut.mockResolvedValue({ error: null });
  const r = await api(
    post(
      "update-password",
      { password: "new-password-long" },
      "__Host-mimmo-recovery=" + token,
    ),
    env,
  );
  expect(r.status).toBe(200);
  expect(mock.getUser).toHaveBeenCalled();
  expect(mock.updateUser).toHaveBeenCalledWith({
    password: "new-password-long",
  });
  expect(mock.signOut).toHaveBeenCalledWith({ scope: "global" });
  expect(r.headers.get("Set-Cookie")).toContain("Max-Age=0");
});
