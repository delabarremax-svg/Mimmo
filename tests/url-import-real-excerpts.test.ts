// @vitest-environment node
/** Checks short real factual text excerpts, NOT the source HTML or live URL importing. */
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { textEvidence } from "../src/domain/listing-import";
const cases = JSON.parse(
  readFileSync("tests/fixtures/listings/real-source-excerpts.json", "utf8"),
);
for (const c of cases)
  it(
    "extracts five fields from the real text excerpt " +
      new URL(c.source).hostname,
    () => {
      const evidence = textEvidence(c.excerpt, c.source);
      for (const [field, value] of Object.entries(c.expected))
        expect(evidence).toContainEqual(
          expect.objectContaining({ field, value, source: c.source }),
        );
      expect(c.originalHtmlRetrieved).toBe(false);
      expect(c.automationPermissionQualified).toBe(false);
    },
  );
