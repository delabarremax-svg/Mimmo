import { createProperty } from "./property";
import { emptyInvestment } from "./investment";
/** Synthetic exercise, loaded only by explicit action in the dedicated demo build. */
export function demoProjects() {
  return ["Atelier des Tilleuls", "Appartement des Jardins"].map(
    (title, index) => {
      const p = createProperty(
        "https://example.invalid/mimmo-demonstration-" + index,
      );
      const now = new Date().toISOString(),
        source = "DONNÉES FICTIVES — exercice de démonstration MIMMO";
      for (const [key, value] of Object.entries({
        title: "[FICTIF] " + title,
        city: "Ville de démonstration",
        price: String(180000 + index * 40000),
        area: String(45 + index * 12),
        rooms: String(2 + index),
        description:
          "Projet entièrement fictif. Aucun bien réel ni estimation du marché.",
      }))
        p.facts[key as keyof typeof p.facts] = {
          value,
          status: "estimated",
          source,
          updatedAt: now,
        };
      p.investment = {
        ...emptyInvestment(),
        finance: {
          price: (180000 + index * 40000) * 100,
          acquisitionFees: 1500000,
          works: 2000000,
          furniture: 300000,
          contribution: 4000000,
          annualRate: 3.5,
          years: 25,
          annualInsuranceRate: 0.3,
          monthlyRent: 105000,
          annualCharges: 120000,
          annualPropertyTax: 100000,
          annualMaintenance: 60000,
          vacancyPercent: 5,
          managementPercent: 7,
        },
        observations: [
          {
            id: crypto.randomUUID(),
            kind: "dpe",
            label: "DPE fictif",
            value:
              "Classe F déclarée dans cet exemple fictif, à faire confirmer.",
            status: "extracted",
            source: "Exercice MIMMO — DPE FICTIF",
            page: 1,
            excerpt: "Extrait inventé pour la démonstration : classe F.",
            date: now,
          },
          {
            id: crypto.randomUUID(),
            kind: "ag",
            label: "Travaux de toiture — exemple fictif",
            value: "Travaux votés, montant à obtenir.",
            status: "extracted",
            source: "Exercice MIMMO — PV AG FICTIF",
            page: 2,
            excerpt:
              "Extrait inventé : travaux de toiture votés, devis en attente.",
            date: now,
          },
          {
            id: crypto.randomUUID(),
            kind: "diagnostic",
            label: "Diagnostic fictif à contrôler",
            value: "Le rapport fourni dans cet exercice est une simulation.",
            status: "estimated",
            source: "Exercice MIMMO — DIAGNOSTIC FICTIF",
            page: 1,
            excerpt: "Extrait inventé : contrôle complémentaire à prévoir.",
            date: now,
          },
        ],
        works: [
          {
            id: crypto.randomUUID(),
            label: "Peinture — hypothèse fictive",
            quantity: 45,
            artisanUnit: 4500,
            diyUnit: 1800,
            contingency: 15,
            source,
          },
        ],
        comparables: [85000, 105000, 115000].map((monthlyRent, j) => ({
          id: crypto.randomUUID(),
          monthlyRent,
          area: 45,
          source: "https://example.invalid/comparable-fictif-" + j,
          date: now.slice(0, 10),
          note: "COMPARABLE FICTIF — aucun loyer réel ni donnée du marché.",
        })),
        notes: source,
      };
      return p;
    },
  );
}
