import { api, type Environment } from '../server/api';
export default {
  async fetch(request: Request, env: Environment) {
    if (new URL(request.url).pathname.startsWith('/api/')) return api(request, env);
    // Preserve asset status and content type.
    const asset = await env.ASSETS.fetch(request);
    const result = new Response(asset.body, asset);
    result.headers.set('Cache-Control', 'no-store');
    result.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('Referrer-Policy', 'no-referrer');
    result.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return result;
  }
};
