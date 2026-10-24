/** MIMMO finance 1.0.0. Amounts are integer cents; rates are annual percentages. */
export const FINANCE_VERSION = "1.0.0";
export type FinanceInput = {
  price: number;
  acquisitionFees: number;
  works: number;
  furniture: number;
  contribution: number;
  annualRate: number;
  years: number;
  annualInsuranceRate: number;
  monthlyRent: number;
  annualCharges: number;
  annualPropertyTax: number;
  annualMaintenance: number;
  vacancyPercent: number;
  managementPercent: number;
};
export type FinanceResult = {
  version: string;
  totalCost: number;
  principal: number;
  cashRequired: number;
  monthlyPayment: number;
  monthlyInsurance: number;
  annualRent: number;
  annualOperatingIncome: number;
  monthlyCashFlow: number;
  grossYieldPercent: number;
  netYieldPercent: number;
  totalInterest: number;
};
const moneyKeys = [
  "price",
  "acquisitionFees",
  "works",
  "furniture",
  "contribution",
  "monthlyRent",
  "annualCharges",
  "annualPropertyTax",
  "annualMaintenance",
] as const;
export function validateFinance(i: FinanceInput) {
  for (const k of moneyKeys)
    if (!Number.isSafeInteger(i[k]) || i[k] < 0 || i[k] > 100_000_000_000)
      throw new Error("Montant invalide : " + k);
  if (i.price <= 0 || i.monthlyRent <= 0)
    throw new Error("Prix et loyer attendus, avec vos propres hypothèses.");
  for (const k of [
    "annualRate",
    "annualInsuranceRate",
    "vacancyPercent",
    "managementPercent",
  ] as const) {
    if (!Number.isFinite(i[k]) || i[k] < 0 || i[k] > 100)
      throw new Error("Taux invalide : " + k);
  }
  if (!Number.isInteger(i.years) || i.years < 1 || i.years > 40)
    throw new Error("Durée attendue : 1 à 40 ans.");
}
export function calculateFinance(i: FinanceInput): FinanceResult {
  validateFinance(i);
  const totalCost = i.price + i.acquisitionFees + i.works + i.furniture;
  const principal = Math.max(0, totalCost - i.contribution);
  const r = i.annualRate / 1200,
    months = i.years * 12;
  const payment =
    principal === 0
      ? 0
      : r === 0
        ? principal / months
        : (principal * r) / (1 - (1 + r) ** -months);
  const monthlyPayment = Math.round(payment);
  const monthlyInsurance = Math.round(
    (principal * i.annualInsuranceRate) / 1200,
  );
  const annualRent = Math.round(
    i.monthlyRent * 12 * (1 - i.vacancyPercent / 100),
  );
  const management = Math.round((annualRent * i.managementPercent) / 100);
  const annualOperatingIncome =
    annualRent -
    management -
    i.annualCharges -
    i.annualPropertyTax -
    i.annualMaintenance;
  return {
    version: FINANCE_VERSION,
    totalCost,
    principal,
    cashRequired: Math.min(i.contribution, totalCost),
    monthlyPayment,
    monthlyInsurance,
    annualRent,
    annualOperatingIncome,
    monthlyCashFlow:
      Math.round(annualOperatingIncome / 12) -
      monthlyPayment -
      monthlyInsurance,
    grossYieldPercent: ((i.monthlyRent * 12) / totalCost) * 100,
    netYieldPercent: (annualOperatingIncome / totalCost) * 100,
    totalInterest: Math.max(0, Math.round(payment * months - principal)),
  };
}
/** Explicit stress assumptions, not forecasts or market data. */
export function prudentScenario(i: FinanceInput): FinanceInput {
  return {
    ...i,
    monthlyRent: Math.round(i.monthlyRent * 0.9),
    works: Math.round(i.works * 1.15),
    annualMaintenance: Math.round(i.annualMaintenance * 1.2),
    vacancyPercent: Math.min(100, i.vacancyPercent + 5),
  };
}
export const euros = (c: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(c / 100);
