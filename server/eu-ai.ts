/** Inactive until the provider's EU processing terms AND budget are approved. */
export interface EuAiBinding {
  readonly processingRegion: "EU";
  readonly model: string;
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
export interface EuAiEnvironment {
  EU_AI?: EuAiBinding;
  EU_AI_ENABLED?: string;
  EU_AI_API_KEY?: string;
  EU_AI_MODEL?: string;
  EU_AI_PROCESSING_APPROVED?: string;
  EU_AI_BUDGET_APPROVED?: string;
}
export function configuredEuAi(env: EuAiEnvironment): EuAiBinding | undefined {
  if (env.EU_AI_ENABLED !== "true") return undefined;
  if (env.EU_AI?.processingRegion === "EU") return env.EU_AI;
  if (
    env.EU_AI_PROCESSING_APPROVED !== "true" ||
    env.EU_AI_BUDGET_APPROVED !== "true" ||
    !env.EU_AI_API_KEY ||
    !env.EU_AI_MODEL ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(env.EU_AI_MODEL)
  )
    return undefined;
  const model = env.EU_AI_MODEL,
    key = env.EU_AI_API_KEY;
  return {
    processingRegion: "EU",
    model,
    async run(requested, input) {
      if (requested !== model) throw new Error("Modèle non autorisé.");
      // Fixed endpoint: deployment must verify EU processing for the chosen account.
      // No configurable URL, fallback provider, logging, automatic retries or paid upgrade.
      const response = await fetch(
        "https://api.mistral.ai/v1/chat/completions",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(60000),
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...input, model }),
        },
      );
      if (!response.ok)
        throw new Error("Fournisseur IA indisponible, HTTP " + response.status);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Réponse absente.");
      let bytes = 0,
        body = "";
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 64000) {
          await reader.cancel();
          throw new Error("Réponse trop volumineuse.");
        }
        body += decoder.decode(value, { stream: true });
      }
      return JSON.parse(body + decoder.decode());
    },
  };
}
