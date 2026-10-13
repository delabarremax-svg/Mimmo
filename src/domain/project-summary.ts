import { fields, type Property, type FieldKey } from "./property";
export const essentials: FieldKey[] = ["title", "city", "price"];
export function projectSummary(property: Property) {
  const entries = Object.entries(property.facts) as [
    FieldKey,
    Property["facts"][FieldKey],
  ][];
  return {
    known: entries.filter(([, f]) => f.value).length,
    missing: entries.filter(([, f]) => !f.value).map(([key]) => key),
    missingEssentials: essentials.filter((key) => !property.facts[key].value),
    conflicts: entries
      .filter(([, f]) => f.value && f.status === "conflicting")
      .map(([key]) => key),
    verified: entries.filter(([, f]) => f.value && f.status === "verified")
      .length,
  };
}
export function formatFact(property: Property, key: FieldKey): string {
  const value = property.facts[key].value;
  if (!value) return "Non renseigné";
  if (key === "price")
    return `${Number(value.replace(",", ".")).toLocaleString("fr-FR")} €`;
  if (key === "area") return `${value} m²`;
  if (key === "rooms") return `${value} pièce${value === "1" ? "" : "s"}`;
  return value;
}
export const fieldLabel = (key: FieldKey) => fields[key];
