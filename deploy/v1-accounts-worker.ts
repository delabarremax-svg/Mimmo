import demo from "./worker";
import accounts from "./accounts-worker";
import type { Environment } from "../server/api";
export default {
  async fetch(request: Request, env: Environment & { DEMO_PASSWORD?: string }) {
    const gate = await demo.fetch(
      new Request(request.url, { method: "GET", headers: request.headers }),
      {
        DEMO_PASSWORD: env.DEMO_PASSWORD,
        ASSETS: { fetch: async () => new Response(null, { status: 200 }) },
      },
    );
    if (gate.status !== 200) return gate;
    const clean = new Request(request);
    clean.headers.delete("Authorization");
    const response = await accounts.fetch(clean, env);
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
};
