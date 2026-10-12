import { describe, it, expect } from "vitest";
import {
  createProperty,
  validateUrl,
  validateFact,
  completeness,
} from "../src/domain/property";
describe("Données et provenance", () => {
  it("crée uniquement des données manquantes, sans extraction fictive", () => {
    const p = createProperty("https://example.com/annonce");
    expect(completeness(p)).toBe(0);
    expect(
      Object.values(p.facts).every(
        (f) => f.status === "missing" && f.value === "",
      ),
    ).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "texte",
  ])("rejette une URL dangereuse ou invalide : %s", (url) => {
    expect(() => validateUrl(url)).toThrow();
  });
  it("ne valide pas une donnée sans source ni une vérification fictive", () => {
    expect(() =>
      validateFact("city", {
        value: "Lyon",
        status: "estimated",
        source: "",
        updatedAt: "",
      }),
    ).toThrow();
    expect(() =>
      validateFact("city", {
        value: "Lyon",
        status: "verified",
        source: "document",
        updatedAt: "",
      }),
    ).toThrow();
  });
  it.each(["-1", "0", "NaN", "Infinity", "abc"])(
    "rejette un montant invalide %s",
    (value) => {
      expect(() =>
        validateFact("price", {
          value,
          status: "estimated",
          source: "test",
          updatedAt: "",
        }),
      ).toThrow();
    },
  );
  it("accepte les décimales françaises et conserve la source", () => {
    const f = validateFact("area", {
      value: "32,5",
      status: "listing",
      source: "URL, passage Surface",
      updatedAt: "",
    });
    expect(f.value).toBe("32,5");
    expect(f.source).toContain("Surface");
  });
  it("rend manquante une valeur effacée", () => {
    expect(
      validateFact("city", {
        value: " ",
        status: "listing",
        source: "source",
        updatedAt: "",
      }),
    ).toMatchObject({ value: "", status: "missing", source: "" });
  });
  it("exige un nombre entier pour les pièces", () => {
    expect(() =>
      validateFact("rooms", {
        value: "1.5",
        status: "estimated",
        source: "hypothèse",
        updatedAt: "",
      }),
    ).toThrow();
  });
});
