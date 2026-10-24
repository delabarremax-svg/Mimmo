// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import { configuredEuAi } from "../server/eu-ai";
afterEach(() => vi.unstubAllGlobals());
it("does not configure inference without both regional and budget approvals", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    configuredEuAi({
      EU_AI_ENABLED: "true",
      EU_AI_API_KEY: "test",
      EU_AI_MODEL: "test-model",
    }),
  ).toBeUndefined();
  expect(
    configuredEuAi({
      EU_AI_ENABLED: "true",
      EU_AI_API_KEY: "test",
      EU_AI_MODEL: "test-model",
      EU_AI_PROCESSING_APPROVED: "true",
    }),
  ).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects non-EU injected providers even when enabled", () => {
  expect(
    configuredEuAi({
      EU_AI_ENABLED: "true",
      EU_AI: { processingRegion: "global", model: "test", run: vi.fn() } as any,
    }),
  ).toBeUndefined();
});
it("uses only the fixed endpoint and approved model, without redirects or retries", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"choices":[]}'));
  vi.stubGlobal("fetch", fetch);
  const ai = configuredEuAi({
    EU_AI_ENABLED: "true",
    EU_AI_API_KEY: "synthetic-test-key",
    EU_AI_MODEL: "approved-test",
    EU_AI_PROCESSING_APPROVED: "true",
    EU_AI_BUDGET_APPROVED: "true",
  })!;
  expect(ai.processingRegion).toBe("EU");
  await expect(ai.run("unapproved", {})).rejects.toThrow("non autorisé");
  expect(fetch).not.toHaveBeenCalled();
  await ai.run("approved-test", { messages: [] });
  expect(fetch.mock.calls[0][0]).toBe(
    "https://api.mistral.ai/v1/chat/completions",
  );
  expect(fetch.mock.calls[0][1].redirect).toBe("error");
  expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe("approved-test");
});
