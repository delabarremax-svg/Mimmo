import { z } from "zod";
import type { Investment } from "./investment";
export const statuses = {
  missing: "Manquante",
  estimated: "Estimée",
  listing: "Extraite de l’annonce",
  verified: "Vérifiée par document",
  conflicting: "Contradictoire",
} as const;
export type Status = keyof typeof statuses;
export const fields = {
  title: "Nom du bien",
  city: "Ville",
  price: "Prix demandé (€)",
  area: "Surface (m²)",
  rooms: "Nombre de pièces",
  description: "Notes sur le bien",
} as const;
export type FieldKey = keyof typeof fields;
export type Fact = {
  value: string;
  status: Status;
  source: string;
  updatedAt: string;
};
export type Property = {
  investment?: Investment;
  version?: number;
  id: string;
  url: string;
  createdAt: string;
  facts: Record<FieldKey, Fact>;
};
export function validateUrl(raw: string): string {
  const parsed = z.url({ protocol: /^https?$/ }).parse(raw.trim());
  const url = new URL(parsed);
  if (url.username || url.password)
    throw new Error("L’URL ne doit pas contenir d’identifiants.");
  return url.href;
}
export function createProperty(raw: string): Property {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    url: validateUrl(raw),
    createdAt: now,
    facts: Object.fromEntries(
      Object.keys(fields).map((key) => [
        key,
        { value: "", status: "missing", source: "", updatedAt: now },
      ]),
    ) as Property["facts"],
  };
}
export function validateFact(key: FieldKey, fact: Fact): Fact {
  if (!Object.hasOwn(statuses, fact.status))
    throw new Error("Provenance invalide.");
  const value = fact.value.trim();
  if (value.length > 4000 || fact.source.length > 2000)
    throw new Error("Le texte est trop long.");
  if (!value)
    return {
      ...fact,
      value: "",
      status: "missing",
      source: "",
      updatedAt: new Date().toISOString(),
    };
  if (["price", "area", "rooms"].includes(key)) {
    const n = Number(value.replace(",", "."));
    if (
      !/^\d+(?:[.,]\d+)?$/.test(value) ||
      !Number.isFinite(n) ||
      n <= 0 ||
      (key === "rooms" && !Number.isInteger(n))
    )
      throw new Error(
        "Saisissez un nombre positif valide (entier pour les pièces).",
      );
  }
  if (fact.status === "missing")
    throw new Error("Choisissez la provenance de cette information.");
  // Only estimates and transcriptions can be entered in this preview. Verification requires a document service.
  if (fact.status === "verified")
    throw new Error(
      "La vérification par document n’est pas encore disponible.",
    );
  if (!fact.source.trim())
    throw new Error("Précisez la source ou la méthode de cette information.");
  return {
    ...fact,
    value,
    source: fact.source.trim(),
    updatedAt: new Date().toISOString(),
  };
}
export function completeness(p: Property): number {
  return Object.values(p.facts).filter((f) => f.value).length;
}
