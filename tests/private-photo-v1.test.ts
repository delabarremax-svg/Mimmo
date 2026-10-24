// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
import { api, seal, type Environment } from "../server/api";
const project = "33333333-3333-4333-8333-333333333333",
  name = "44444444-4444-4444-8444-444444444444.jpg";
const env: Environment = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test",
  SESSION_KEY: "s".repeat(40),
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response() },
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({
    data: { user: { id: "alice", email: "alice@example.invalid" } },
  });
  mock.maybeSingle.mockResolvedValue({ data: { id: project }, error: null });
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: mock.maybeSingle,
  };
  mock.createClient.mockReturnValue({
    auth: mock,
    from: () => chain,
    storage: { from: () => ({ download: mock.download }) },
  });
  mock.download.mockResolvedValue({
    data: new Blob(["synthetic-image"], { type: "image/jpeg" }),
    error: null,
  });
});
async function request(auth = true) {
  const token = await seal(
    {
      access_token: "alice-access",
      refresh_token: "alice-refresh",
      until: Date.now() + 100000,
    },
    env.SESSION_KEY,
  );
  return new Request("https://mimmo.test/api/photos/" + project + "/" + name, {
    headers: auth ? { Cookie: "__Host-mimmo=" + token } : {},
  });
}
it("rejects anonymous photo requests before touching storage", async () => {
  expect((await api(await request(false), env)).status).toBe(401);
  expect(mock.download).not.toHaveBeenCalled();
});
it("refuses a foreign project before downloading any file", async () => {
  mock.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await api(await request(), env)).status).toBe(404);
  expect(mock.download).not.toHaveBeenCalled();
});
it("serves only the verified user/project path with private image headers", async () => {
  const r = await api(await request(), env);
  expect(r.status).toBe(200);
  expect(mock.download).toHaveBeenCalledWith("alice/" + project + "/" + name);
  expect(r.headers.get("Content-Type")).toBe("image/jpeg");
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
});
