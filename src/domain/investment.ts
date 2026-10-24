import { z } from "zod";
import type { Property } from "./property";
import type { FinanceInput } from "./finance";
export const observationSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum([
      "listing",
      "photo",
      "dpe",
      "diagnostic",
      "ag",
      "market",
      "other",
    ]),
    label: z.string().min(1).max(160),
    value: z.string().min(1).max(2000),
    source: z.string().min(1).max(500),
    page: z.number().int().min(1).max(10000).optional(),
    excerpt: z.string().max(2000),
    status: z.enum(["extracted", "estimated", "conflicting"]),
    date: z.iso.datetime(),
  })
  .strict();
export const workSchema = z
  .object({
    id: z.uuid(),
    label: z.string().min(1).max(160),
    quantity: z.number().positive().max(100000),
    artisanUnit: z.number().int().nonnegative().max(100000000),
    diyUnit: z.number().int().nonnegative().max(100000000),
    source: z.string().min(1).max(500),
    contingency: z.number().min(0).max(100),
  })
  .strict();
export const comparableSchema = z
  .object({
    id: z.uuid(),
    monthlyRent: z.number().int().positive().max(100000000),
    area: z.number().positive().max(100000),
    source: z.url({ protocol: /^https?$/ }).max(2000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(500),
  })
  .strict();
const amount = z.number().int().nonnegative().max(100000000000);
export const financeSchema = z
  .object({
    price: amount,
    acquisitionFees: amount,
    works: amount,
    furniture: amount,
    contribution: amount,
    annualRate: z.number().min(0).max(100),
    years: z.number().int().min(1).max(40),
    annualInsuranceRate: z.number().min(0).max(100),
    monthlyRent: amount,
    annualCharges: amount,
    annualPropertyTax: amount,
    annualMaintenance: amount,
    vacancyPercent: z.number().min(0).max(100),
    managementPercent: z.number().min(0).max(100),
  })
  .strict();
export const investmentSchema = z
  .object({
    observations: z.array(observationSchema).max(12),
    works: z.array(workSchema).max(20),
    comparables: z.array(comparableSchema).max(20),
    finance: financeSchema.optional(),
    financeDraft: z
      .object(
        Object.fromEntries(
          Object.keys(financeSchema.shape).map((k) => [k, z.string().max(40)]),
        ) as Record<keyof FinanceInput, z.ZodString>,
      )
      .partial()
      .strict()
      .optional(),
    notes: z.string().max(4000),
  })
  .strict();
export type Observation = z.infer<typeof observationSchema>;
export type WorkItem = z.infer<typeof workSchema>;
export type Comparable = z.infer<typeof comparableSchema>;
export type Investment = z.infer<typeof investmentSchema>;
export function emptyInvestment(): Investment {
  return { observations: [], works: [], comparables: [], notes: "" };
}
export function worksBudget(items: WorkItem[], mode: "artisan" | "diy") {
  return items.reduce(
    (sum, w) =>
      sum +
      Math.round(
        w.quantity *
          (mode === "artisan" ? w.artisanUnit : w.diyUnit) *
          (1 + w.contingency / 100),
      ),
    0,
  );
}
export function marketRange(items: Comparable[], area: number) {
  if (!items.length || !Number.isFinite(area) || area <= 0) return undefined;
  const rents = items.map((i) => i.monthlyRent / i.area).sort((a, b) => a - b);
  const median =
    rents.length % 2
      ? rents[Math.floor(rents.length / 2)]
      : (rents[rents.length / 2 - 1] + rents[rents.length / 2]) / 2;
  return {
    low: Math.round(rents[0] * area),
    median: Math.round(median * area),
    high: Math.round(rents.at(-1)! * area),
    confidence: items.length < 3 ? "Très faible" : "Faible",
    count: items.length,
  };
}
export type Risk = {
  title: string;
  detail: string;
  source: string;
  page?: number;
  severity: "attention" | "missing";
};
/** Rules identify questions, never professional diagnoses. Every textual flag retains its evidence. */
export function projectRisks(p: Property, w: Investment): Risk[] {
  const risks: Risk[] = [];
  if (!p.facts.price.value)
    risks.push({
      title: "Prix non renseigné",
      detail: "Obtenir le prix demandé et ses conditions.",
      source: "Fiche du bien",
      severity: "missing",
    });
  for (const [key, f] of Object.entries(p.facts))
    if (f.status === "conflicting")
      risks.push({
        title: "Information contradictoire : " + key,
        detail: f.value,
        source: f.source,
        severity: "attention",
      });
  for (const kind of ["dpe", "diagnostic", "ag"] as const)
    if (!w.observations.some((o) => o.kind === kind))
      risks.push({
        title: "Pièce à examiner : " + kind.toUpperCase(),
        detail: "Ajouter le document ou un extrait avec sa page.",
        source: "Inventaire du dossier",
        severity: "missing",
      });
  for (const o of w.observations) {
    if (
      o.status === "conflicting" ||
      /amiante|plomb|infiltration|fissure|impay[ée]|proc[ée]dure|ravalement|toiture|travaux vot[ée]s|classe [fg]\b/i.test(
        o.value + " " + o.excerpt,
      )
    ) {
      risks.push({
        title: o.label,
        detail: "Point à faire confirmer par un professionnel : " + o.value,
        source: o.source,
        page: o.page,
        severity: "attention",
      });
    }
  }
  return risks;
}
export function progress(p: Property, w: Investment) {
  const steps = [
    {
      label: "Informations essentielles",
      done: ["price", "area", "city"].every(
        (k) => !!p.facts[k as keyof Property["facts"]].value,
      ),
    },
    {
      label: "Pièces et sources",
      done: ["dpe", "diagnostic", "ag"].every((k) =>
        w.observations.some((o) => o.kind === k),
      ),
    },
    { label: "Marché documenté", done: w.comparables.length >= 3 },
    { label: "Travaux chiffrés", done: w.works.length > 0 },
    {
      label: "Simulation renseignée",
      done: !!w.finance && w.finance.price > 0 && w.finance.monthlyRent > 0,
    },
  ];
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
  };
}
export const FINANCE_LABELS: Record<keyof FinanceInput, string> = {
  price: "Prix d’achat (€)",
  acquisitionFees: "Frais d’acquisition (€)",
  works: "Travaux (€)",
  furniture: "Mobilier (€)",
  contribution: "Apport (€)",
  annualRate: "Taux annuel du crédit (%)",
  years: "Durée (années)",
  annualInsuranceRate: "Assurance annuelle sur capital initial (%)",
  monthlyRent: "Loyer mensuel hors charges (€)",
  annualCharges: "Charges annuelles non récupérables (€)",
  annualPropertyTax: "Taxe foncière annuelle (€)",
  annualMaintenance: "Entretien annuel (€)",
  vacancyPercent: "Vacance locative (%)",
  managementPercent: "Gestion sur loyers encaissés (%)",
};
