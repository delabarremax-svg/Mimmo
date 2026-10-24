import { fields, statuses, type Property } from "./property";
import {
  emptyInvestment,
  projectRisks,
  worksBudget,
  marketRange,
  FINANCE_LABELS,
} from "./investment";
import { calculateFinance, euros, prudentScenario } from "./finance";
export function reportLines(p: Property): string[] {
  const w = p.investment || emptyInvestment();
  const lines = [
    "MIMMO - Dossier de preparation bancaire",
    new Date().toLocaleDateString("fr-FR"),
    p.facts.title.value || "Projet sans nom",
    "Source annonce : " + p.url,
    "Informations declarees / extraites, non certifiees. Aucun accord de financement.",
    "",
    "LE BIEN",
  ];
  for (const [k, f] of Object.entries(p.facts))
    lines.push(
      fields[k as keyof typeof fields] +
        " : " +
        (f.value || "Manquant") +
        " [" +
        statuses[f.status] +
        "]",
      "Source : " + (f.source || "Non fournie"),
    );
  lines.push("", "HYPOTHESES ET FINANCEMENT");
  if (w.finance) {
    for (const [k, v] of Object.entries(w.finance)) {
      const label = FINANCE_LABELS[k as keyof typeof FINANCE_LABELS];
      const isMoney = ![
        "years",
        "annualRate",
        "annualInsuranceRate",
        "vacancyPercent",
        "managementPercent",
      ].includes(k);
      lines.push(label + " : " + (isMoney ? euros(v) : v));
    }
    try {
      const r = calculateFinance(w.finance),
        s = calculateFinance(prudentScenario(w.finance));
      lines.push(
        "Moteur : " + r.version,
        "Cout global : " + euros(r.totalCost),
        "Capital emprunte : " + euros(r.principal),
        "Apport mobilise : " + euros(r.cashRequired),
        "Mensualite hors assurance : " + euros(r.monthlyPayment),
        "Assurance mensuelle : " + euros(r.monthlyInsurance),
        "Cash-flow mensuel avant impots : " + euros(r.monthlyCashFlow),
        "Rendement net avant impots : " + r.netYieldPercent.toFixed(2) + " %",
        "Scenario prudent : loyer -10 %, travaux +15 %, entretien +20 %, vacance +5 points.",
        "Cash-flow prudent : " + euros(s.monthlyCashFlow),
      );
    } catch {
      lines.push("Simulation incomplete ou invalide.");
    }
  } else if (w.financeDraft) {
    lines.push("Hypotheses partielles a completer : aucun resultat calcule.");
    for (const [key, value] of Object.entries(w.financeDraft))
      if (value)
        lines.push(
          FINANCE_LABELS[key as keyof typeof FINANCE_LABELS] +
            " : " +
            value +
            " (brouillon non valide)",
        );
  } else lines.push("Hypotheses non renseignees : aucun resultat calcule.");
  lines.push("", "TRAVAUX - HYPOTHESES UTILISATEUR");
  for (const item of w.works)
    lines.push(
      item.label +
        " - quantite " +
        item.quantity +
        " - source : " +
        item.source,
    );
  lines.push(
    "Budget artisans : " + euros(worksBudget(w.works, "artisan")),
    "Budget soi-meme : " + euros(worksBudget(w.works, "diy")),
    "Autoconstruction : temps, assurances, qualifications et faisabilite a verifier.",
  );
  lines.push("", "MARCHE ET SOURCES");
  for (const c of w.comparables)
    lines.push(
      c.date +
        " - " +
        euros(c.monthlyRent) +
        "/mois - " +
        c.area +
        " m2 - " +
        c.source +
        " - " +
        c.note,
    );
  const range = marketRange(
    w.comparables,
    Number(p.facts.area.value.replace(",", ".")),
  );
  if (range)
    lines.push(
      "Fourchette indicative : " +
        euros(range.low) +
        " a " +
        euros(range.high) +
        " ; confiance " +
        range.confidence +
        ". Echantillon non representatif.",
    );
  lines.push("", "OBSERVATIONS DOCUMENTAIRES");
  for (const o of w.observations)
    lines.push(
      o.label + " [" + o.status + "] : " + o.value,
      "Source : " + o.source + (o.page ? " - page " + o.page : ""),
      "Extrait : " + o.excerpt,
    );
  lines.push("", "VERIFICATIONS ET NEGOCIATION");
  for (const risk of projectRisks(p, w))
    lines.push(
      risk.title +
        " : " +
        risk.detail +
        " - " +
        risk.source +
        (risk.page ? " p. " + risk.page : ""),
    );
  lines.push(
    "Demander les devis et justificatifs avant de chiffrer une negociation. Aucun rabais automatique.",
    w.notes,
    "Calculs avant fiscalite, revente et evolution des loyers. Estimations non garanties.",
  );
  return lines;
}
/** Dependency-free multipage text PDF; transliteration keeps the built-in Helvetica encoding valid. */
export function createReportPdf(p: Property): Blob {
  const ascii = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/€/g, "EUR")
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/[^\x20-\x7e]/g, " ");
  const lines = reportLines(p).flatMap((s) => {
    const words = ascii(s).split(/\s+/);
    let line = "";
    const out: string[] = [];
    for (const word of words) {
      if ((line + " " + word).length > 88) {
        out.push(line);
        line = "";
      }
      for (let i = 0; i < word.length; i += 88) {
        const part = word.slice(i, i + 88);
        if (i > 0) {
          out.push(line);
          line = "";
        }
        line += (line ? " " : "") + part;
      }
    }
    out.push(line);
    return out;
  });
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const refs: number[] = [];
  pages.forEach((page, i) => {
    const id = objects.length + 1;
    refs.push(id);
    const stream =
      "BT /F1 10 Tf 48 790 Td 14 TL\n" +
      page
        .map(
          (line, n) =>
            (n ? "T* " : "") + "(" + line.replace(/([\\()])/g, "\\$1") + ") Tj",
        )
        .join("\n") +
      "\nT* (MIMMO - " +
      (i + 1) +
      " / " +
      pages.length +
      ") Tj ET";
    objects.push(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents " +
        (id + 1) +
        " 0 R >>",
      "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
    );
  });
  objects[1] =
    "<< /Type /Pages /Count " +
    refs.length +
    " /Kids [" +
    refs.map((r) => r + " 0 R").join(" ") +
    "] >>";
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += i + 1 + " 0 obj\n" + o + "\nendobj\n";
  });
  const start = pdf.length;
  pdf +=
    "xref\n0 " +
    offsets.length +
    "\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("");
  pdf +=
    "trailer\n<< /Size " +
    offsets.length +
    " /Root 1 0 R >>\nstartxref\n" +
    start +
    "\n%%EOF";
  return new Blob([pdf], { type: "application/pdf" });
}
