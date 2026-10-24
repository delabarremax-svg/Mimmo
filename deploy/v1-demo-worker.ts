import demo, { type DemoEnvironment } from "./worker";
import {
  readAnalysisRequest,
  runAnalysis,
  type AiBinding,
} from "../server/analysis";
export default {
  async fetch(
    request: Request,
    env: DemoEnvironment & {
      AI?: AiBinding;
      FREE_AI_ENABLED?: string;
      AI_LIMITER?: {
        limit(input: { key: string }): Promise<{ success: boolean }>;
      };
    },
  ) {
    if (new URL(request.url).pathname === "/demo-api/analyze") {
      const gate = await demo.fetch(
        new Request(request.url, { method: "GET", headers: request.headers }),
        {
          DEMO_PASSWORD: env.DEMO_PASSWORD,
          ASSETS: { fetch: async () => new Response(null) },
        },
      );
      if (gate.status !== 200) return gate;
      if (
        request.method !== "POST" ||
        request.headers.get("Origin") !== new URL(request.url).origin ||
        request.headers.get("Content-Type") !== "application/json"
      )
        return Response.json(
          { error: "Requête refusée." },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
      if (
        !env.AI_LIMITER ||
        !(
          await env.AI_LIMITER.limit({
            key: request.headers.get("CF-Connecting-IP") || "unknown",
          })
        ).success
      )
        return Response.json(
          { error: "Limite de démonstration atteinte. Réessayez plus tard." },
          { status: 429, headers: { "Cache-Control": "no-store" } },
        );
      try {
        return Response.json(
          await runAnalysis(await readAnalysisRequest(request), env),
          {
            headers: {
              "Cache-Control": "private, no-store",
              "Referrer-Policy": "no-referrer",
            },
          },
        );
      } catch {
        return Response.json(
          {
            error:
              "Analyse indisponible, quota atteint ou réponse non vérifiable. Aucun résultat ajouté. Utilisez l’extrait et la saisie assistée.",
          },
          { status: 422, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    const response = await demo.fetch(request, env);
    // Only the new private demo enables same-origin PDF/OCR workers and WASM.
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    return response;
  },
};
