// @vitest-environment node
import { it, expect, vi } from "vitest";
import { runAnalysis } from "../server/analysis";
const input = {
  source: "PV fictif",
  page: 3,
  text: "Des travaux de toiture ont été votés.",
  consent: true,
};
const output = {
  findings: [
    {
      title: "Travaux de toiture",
      detail: "Demander le devis et la répartition des dépenses.",
      quote: "travaux de toiture",
      confidence: "low",
    },
  ],
};
it("never invokes AI unless explicitly enabled", async () => {
  const run = vi.fn();
  await expect(runAnalysis(input, { AI: { run } })).rejects.toThrow(
    "pas activée",
  );
  expect(run).not.toHaveBeenCalled();
});
it("requires explicit user consent", async () => {
  const run = vi.fn();
  await expect(
    runAnalysis(
      { ...input, consent: false },
      { AI: { run }, FREE_AI_ENABLED: "true" },
    ),
  ).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
it("returns only structured hypotheses grounded in exact source quotes", async () => {
  const run = vi.fn().mockResolvedValue({ response: JSON.stringify(output) });
  const r = await runAnalysis(input, { AI: { run }, FREE_AI_ENABLED: "true" });
  expect(r).toMatchObject({
    source: "PV fictif",
    page: 3,
    status: "estimated",
    findings: output.findings,
  });
  expect(run.mock.calls[0][0]).toBe("@cf/meta/llama-3.1-8b-instruct");
  expect(run).toHaveBeenCalledTimes(1);
});
it("rejects invented citations instead of storing them", async () => {
  const run = vi.fn().mockResolvedValue({
    response: JSON.stringify({
      findings: [{ ...output.findings[0], quote: "Amiante constatée" }],
    }),
  });
  await expect(
    runAnalysis(input, { AI: { run }, FREE_AI_ENABLED: "true" }),
  ).rejects.toThrow("Citation IA absente");
});
it("accepts the object response returned by Workers AI JSON mode", async () => {
  const run = vi.fn().mockResolvedValue({ response: output });
  expect(
    (await runAnalysis(input, { AI: { run }, FREE_AI_ENABLED: "true" }))
      .findings,
  ).toEqual(output.findings);
  expect(run.mock.calls[0][1].response_format.type).toBe("json_schema");
});
it("rejects unsourced numeric claims", async () => {
  const run = vi.fn().mockResolvedValue({
    response: JSON.stringify({
      findings: [{ ...output.findings[0], detail: "Travaux de 50000 euros." }],
    }),
  });
  await expect(
    runAnalysis(input, { AI: { run }, FREE_AI_ENABLED: "true" }),
  ).rejects.toThrow("Chiffre IA non sourcé");
});
it.each([
  "not json",
  '{"findings":[],"verified":true}',
  '{"findings":[{"title":"x","detail":"x","quote":"travaux","confidence":"high"}]}',
])("rejects unverifiable or overconfident outputs %s", async (response) => {
  const run = vi.fn().mockResolvedValue({ response });
  await expect(
    runAnalysis(input, { AI: { run }, FREE_AI_ENABLED: "true" }),
  ).rejects.toThrow();
});
it("rejects invalid image bytes before inference", async () => {
  const run = vi.fn();
  await expect(
    runAnalysis(
      { ...input, image: btoa("not an image") },
      { AI: { run }, FREE_AI_ENABLED: "true" },
    ),
  ).rejects.toThrow("JPEG invalide");
  expect(run).not.toHaveBeenCalled();
});
it("does not retry or fabricate a fallback when provider fails", async () => {
  const run = vi.fn().mockRejectedValue(new Error("quota"));
  await expect(
    runAnalysis(input, { AI: { run }, FREE_AI_ENABLED: "true" }),
  ).rejects.toThrow("quota");
  expect(run).toHaveBeenCalledTimes(1);
});
