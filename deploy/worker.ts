export interface DemoEnvironment {
  DEMO_PASSWORD?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const securityHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};
function reply(text: string, status: number, extra = {}) {
  return new Response(text, {
    status,
    headers: { ...securityHeaders, ...extra },
  });
}
async function matches(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [actual, expected].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
  const x = new Uint8Array(a),
    y = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
export default {
  async fetch(request: Request, env: DemoEnvironment): Promise<Response> {
    if (new URL(request.url).protocol !== "https:")
      return reply("HTTPS obligatoire.", 403);
    // Never serve files if a deployment has not received its secret yet.
    if (!env.DEMO_PASSWORD || !/^[\x21-\x7e]{20,256}$/.test(env.DEMO_PASSWORD))
      return reply("Démonstration privée non configurée.", 503);
    let supplied = "";
    try {
      const header = request.headers.get("Authorization") ?? "";
      if (header.length <= 1024 && /^Basic /i.test(header))
        supplied = atob(header.slice(6));
    } catch {
      /* Malformed authorization remains unauthorized. */
    }
    if (!(await matches(supplied, `mimmo:${env.DEMO_PASSWORD}`)))
      return reply("Accès privé. Identifiants requis.", 401, {
        "WWW-Authenticate":
          'Basic realm="MIMMO - demonstration privee", charset="UTF-8"',
      });
    if (!["GET", "HEAD"].includes(request.method))
      return reply("Méthode non autorisée.", 405, { Allow: "GET, HEAD" });
    // Authorization is NOT forwarded to the assets service or another origin.
    const cleanRequest = new Request(request);
    cleanRequest.headers.delete("Authorization");
    const asset = await env.ASSETS.fetch(cleanRequest);
    const response = new Response(asset.body, asset);
    for (const [key, value] of Object.entries(securityHeaders))
      response.headers.set(key, value);
    return response;
  },
};
