import { describe, it, expect } from "vitest";
import {
  calculateFinance,
  prudentScenario,
  type FinanceInput,
} from "../src/domain/finance";
const input: FinanceInput = {
  price: 20000000,
  acquisitionFees: 1600000,
  works: 1000000,
  furniture: 200000,
  contribution: 5000000,
  annualRate: 3.5,
  years: 20,
  annualInsuranceRate: 0.3,
  monthlyRent: 120000,
  annualCharges: 120000,
  annualPropertyTax: 100000,
  annualMaintenance: 60000,
  vacancyPercent: 5,
  managementPercent: 7,
};
describe("financial references and boundaries", () => {
  it("uses all acquisition costs and cents", () => {
    const r = calculateFinance(input);
    expect(r.totalCost).toBe(22800000);
    expect(r.principal).toBe(17800000);
    expect(r.monthlyPayment).toBe(103233);
    expect(r.monthlyInsurance).toBe(4450);
    expect(r.annualRent).toBe(1368000);
    expect(r.annualOperatingIncome).toBe(992240);
    expect(r.monthlyCashFlow).toBe(-24996);
  });
  it("handles zero interest without division by zero", () => {
    const r = calculateFinance({ ...input, annualRate: 0 });
    expect(r.monthlyPayment).toBe(74167);
    expect(r.totalInterest).toBe(0);
  });
  it("caps mobilized contribution and never creates a negative loan", () => {
    const r = calculateFinance({ ...input, contribution: 30000000 });
    expect(r.principal).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.monthlyInsurance).toBe(0);
    expect(r.cashRequired).toBe(r.totalCost);
  });
  it("stress assumptions lower cash flow and do not mutate original inputs", () => {
    const s = prudentScenario(input);
    expect(s.monthlyRent).toBe(108000);
    expect(s.works).toBe(1150000);
    expect(s.vacancyPercent).toBe(10);
    expect(calculateFinance(s).monthlyCashFlow).toBeLessThan(
      calculateFinance(input).monthlyCashFlow,
    );
    expect(input.works).toBe(1000000);
  });
  it.each([
    { price: 0 },
    { monthlyRent: 0 },
    { price: -1 },
    { price: 1.5 },
    { annualRate: NaN },
    { vacancyPercent: 101 },
    { years: 0 },
    { years: 41 },
    { years: 2.5 },
    { annualCharges: Infinity },
  ])("rejects invalid or missing assumptions %j", (part) =>
    expect(() => calculateFinance({ ...input, ...part })).toThrow(),
  );
  it("handles 100 percent vacancy without invented income", () => {
    const r = calculateFinance({ ...input, vacancyPercent: 100 });
    expect(r.annualRent).toBe(0);
    expect(r.annualOperatingIncome).toBe(-280000);
  });
});
