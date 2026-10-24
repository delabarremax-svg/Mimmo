import demo, { type DemoEnvironment } from "./worker";
export default {
  async fetch(request: Request, env: DemoEnvironment) {
    const response = await demo.fetch(request, env);
    // Only the new private demo enables same-origin PDF/OCR workers and WASM.
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    return response;
  },
};
