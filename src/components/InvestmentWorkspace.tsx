import { useRef, useState } from "react";
import type { Property, FieldKey } from "../domain/property";
import { fields, validateFact } from "../domain/property";
import {
  emptyInvestment,
  FINANCE_LABELS,
  investmentSchema,
  worksBudget,
  marketRange,
  projectRisks,
  progress,
  type Investment,
  type Observation,
} from "../domain/investment";
import {
  calculateFinance,
  prudentScenario,
  euros,
  type FinanceInput,
} from "../domain/finance";
import {
  extractListingText,
  extractJsonLd,
  type Candidate,
} from "../domain/extraction";
import { createReportPdf } from "../domain/report";
import { accountsEnabled, api } from "../services/account";
import DocumentReader from "./DocumentReader";
import AnalysisAssistant from "./AnalysisAssistant";
type Tab = "sources" | "market" | "works" | "finance" | "summary";
const labels: Record<Tab, string> = {
  sources: "Sources & pièces",
  market: "Marché",
  works: "Travaux",
  finance: "Simulation",
  summary: "Synthèse & PDF",
};
const moneyFields = new Set([
  "price",
  "acquisitionFees",
  "works",
  "furniture",
  "contribution",
  "monthlyRent",
  "annualCharges",
  "annualPropertyTax",
  "annualMaintenance",
]);
function data(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form));
}
function numeric(value: FormDataEntryValue | undefined) {
  return Number(String(value ?? "").replace(",", "."));
}
type RemoteDocument = {
  name: string;
  id?: string;
  metadata?: { size?: number; mimetype?: string; originalName?: string };
};
export default function InvestmentWorkspace({
  property: p,
  onSave,
  onDirty,
}: {
  property: Property;
  onSave: (p: Property) => Promise<void>;
  onDirty: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<Investment>(() =>
    structuredClone(p.investment || emptyInvestment()),
  );
  const [tab, setTab] = useState<Tab>("sources"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]),
    [candidatesSource, setCandidatesSource] = useState("");
  const [documents, setDocuments] = useState<RemoteDocument[]>([]),
    [documentBusy, setDocumentBusy] = useState(false);
  const sourceForm = useRef<HTMLFormElement>(null);
  const [aiEvidence, setAiEvidence] = useState({
    source: p.url,
    page: 1,
    text: "",
  });
  const state = progress(p, draft),
    risks = projectRisks(p, draft);
  function change(next: Investment) {
    setDraft(next);
    setDirty(true);
    onDirty(true);
    setMessage("Brouillon non enregistré");
    setError("");
  }
  async function save(next = draft) {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("Enregistrement en cours…");
    try {
      investmentSchema.parse(next);
      await onSave({ ...p, investment: next });
      setDraft(next);
      setDirty(false);
      onDirty(false);
      setMessage(
        accountsEnabled
          ? "Dossier enregistré sur votre compte."
          : "Dossier conservé pour cette session uniquement.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      setMessage("Brouillon conservé.");
    } finally {
      setSaving(false);
    }
  }
  async function listDocuments() {
    setDocumentBusy(true);
    try {
      const r = await api<{ documents: RemoteDocument[] }>(`documents/${p.id}`);
      setDocuments(r.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Documents indisponibles.");
    } finally {
      setDocumentBusy(false);
    }
  }
  let result: ReturnType<typeof calculateFinance> | undefined,
    stress: ReturnType<typeof calculateFinance> | undefined;
  try {
    if (draft.finance) {
      result = calculateFinance(draft.finance);
      stress = calculateFinance(prudentScenario(draft.finance));
    }
  } catch {
    /* Missing inputs render as unavailable. */
  }
  const range = marketRange(
    draft.comparables,
    Number(p.facts.area.value.replace(",", ".")),
  );
  return (
    <section className="investment" aria-label="Dossier d’investissement">
      <div className="investment-heading">
        <div>
          <span className="eyebrow">VOTRE DÉCISION, DOCUMENTÉE</span>
          <h2>Explorez votre investissement.</h2>
          <p>
            {state.done} étapes renseignées sur {state.total} · Ce suivi mesure
            les pièces et hypothèses saisies, pas la qualité du bien.
          </p>
        </div>
        <button
          className="primary"
          disabled={saving || !dirty}
          onClick={() => save()}
        >
          {saving ? "Enregistrement…" : "Enregistrer le dossier"}
        </button>
      </div>
      <progress
        value={state.done}
        max={state.total}
        aria-label="Étapes renseignées"
      />
      <div className="investment-tabs" role="tablist" aria-label="Dossier">
        <>
          {(Object.keys(labels) as Tab[]).map((k) => (
            <button
              key={k}
              role="tab"
              id={"tab-" + k}
              aria-controls={"panel-" + k}
              aria-selected={tab === k}
              onClick={() => setTab(k)}
            >
              {labels[k]}
            </button>
          ))}
        </>
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div role="tabpanel" id={"panel-" + tab} aria-labelledby={"tab-" + tab}>
        {tab === "sources" && (
          <>
            <h3>Annonce et documents : gardez les preuves.</h3>
            <p>
              Chaque observation conserve sa source, sa page et son extrait. Une
              extraction n’est pas une vérification documentaire.
            </p>
            <form
              className="panel investment-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = data(e.currentTarget);
                setError("");
                setCandidatesSource(String(f.source));
                try {
                  if (f.method === "url") {
                    if (!accountsEnabled)
                      throw new Error(
                        "Import distant disponible uniquement dans l’espace connecté et pour les sources autorisées. Collez le texte ou le JSON-LD ci-dessous.",
                      );
                    const r = await api<{ candidates: Candidate[] }>(
                      "extract",
                      "POST",
                      { url: String(f.source) },
                    );
                    setCandidates(r.candidates);
                  } else
                    setCandidates(
                      f.method === "json"
                        ? extractJsonLd(String(f.content))
                        : extractListingText(String(f.content)),
                    );
                  setMessage(
                    "Propositions à examiner avant intégration. Les champs en désaccord seront signalés.",
                  );
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Extraction impossible.",
                  );
                }
              }}
            >
              <h4>Importer les informations accessibles</h4>
              <label>
                Source de l’annonce
                <input name="source" type="url" required defaultValue={p.url} />
              </label>
              <label>
                Méthode
                <select name="method">
                  <option value="text">
                    Texte de l’annonce copié par vous
                  </option>
                  <option value="json">JSON-LD fourni par la source</option>
                  <option value="url">URL d’une source autorisée</option>
                </select>
              </label>
              <label>
                Contenu à examiner
                <textarea
                  name="content"
                  maxLength={100000}
                  rows={5}
                  placeholder="Collez les informations auxquelles vous avez accès. Si l’annonce est bloquée, utilisez une capture et la saisie assistée ci-dessous."
                />
              </label>
              <button className="secondary">Proposer les champs</button>
            </form>
            {candidates.length > 0 && (
              <div className="panel">
                <h4>Propositions d’extraction</h4>
                {candidates.map((c, i) => (
                  <div className="candidate" key={i}>
                    <div>
                      <strong>
                        {fields[c.field]} : {c.value}
                      </strong>
                      <p>Extrait : {c.excerpt}</p>
                    </div>
                    <button
                      className="secondary"
                      disabled={saving}
                      onClick={async () => {
                        const old = p.facts[c.field];
                        const next = structuredClone(p);
                        next.investment = draft;
                        const conflicting =
                          !!old.value && old.value !== c.value;
                        try {
                          next.facts[c.field] = validateFact(c.field, {
                            value: c.value,
                            status: conflicting ? "conflicting" : "listing",
                            source:
                              candidatesSource +
                              " · extrait : " +
                              c.excerpt +
                              (conflicting
                                ? " · valeur précédente : " +
                                  old.value +
                                  " · source précédente : " +
                                  old.source
                                : ""),
                            updatedAt: new Date().toISOString(),
                          });
                          setSaving(true);
                          await onSave(next);
                          setCandidates((prev) =>
                            prev.filter((_, j) => j !== i),
                          );
                          setDirty(false);
                          onDirty(false);
                          setMessage(
                            conflicting
                              ? "Contradiction conservée dans la provenance."
                              : "Champ enregistré avec sa source.",
                          );
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Échec.");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      Intégrer ce champ
                    </button>
                  </div>
                ))}
              </div>
            )}
            <DocumentReader
              onUse={(text, page, source) => {
                setAiEvidence({ source, page, text: text.slice(0, 2000) });
                const form = sourceForm.current;
                if (!form) return;
                for (const [name, value] of Object.entries({
                  excerpt: text.slice(0, 2000),
                  page: String(page),
                  source,
                })) {
                  const input = form.elements.namedItem(
                    name,
                  ) as HTMLInputElement | null;
                  if (input) input.value = value;
                }
                form.scrollIntoView({ behavior: "smooth", block: "center" });
                setMessage(
                  "Extrait préparé dans le formulaire. Précisez le point observé et vérifiez le texte.",
                );
              }}
            />
            <AnalysisAssistant
              evidence={aiEvidence}
              onAdd={(o) => {
                try {
                  const next = {
                    ...draft,
                    observations: [...draft.observations, o],
                  };
                  investmentSchema.parse(next);
                  change(next);
                } catch {
                  setError(
                    "Limite du dossier atteinte. Retirez ou raccourcissez une observation avant de réessayer.",
                  );
                }
              }}
            />
            <form
              ref={sourceForm}
              className="panel investment-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = data(e.currentTarget);
                try {
                  const o: Observation = {
                    id: crypto.randomUUID(),
                    kind: f.kind as Observation["kind"],
                    label: String(f.label),
                    value: String(f.value),
                    source: String(f.source),
                    excerpt: String(f.excerpt),
                    status: f.status as Observation["status"],
                    date: new Date().toISOString(),
                    ...(f.page ? { page: numeric(f.page) } : {}),
                  };
                  const next = {
                    ...draft,
                    observations: [...draft.observations, o],
                  };
                  investmentSchema.parse(next);
                  change(next);
                  e.currentTarget.reset();
                } catch {
                  setError(
                    "Vérifiez les champs et les limites du dossier (12 observations maximum).",
                  );
                }
              }}
            >
              <h4>Ajouter une observation ou un extrait documentaire</h4>
              <label>
                Type
                <select name="kind">
                  <option value="dpe">DPE</option>
                  <option value="diagnostic">Diagnostic</option>
                  <option value="ag">Procès-verbal d’AG</option>
                  <option value="photo">Photo ou capture</option>
                  <option value="listing">Annonce</option>
                  <option value="other">Autre</option>
                </select>
              </label>
              <label>
                Point observé
                <input name="label" required maxLength={160} />
              </label>
              <label>
                Information relevée
                <textarea name="value" required maxLength={2000} />
              </label>
              <div className="form-grid">
                <label>
                  Document ou référence
                  <input name="source" required maxLength={500} />
                </label>
                <label>
                  Page (si document)
                  <input name="page" type="number" min={1} max={10000} />
                </label>
              </div>
              <label>
                Extrait exact
                <textarea name="excerpt" maxLength={2000} />
              </label>
              <label>
                Provenance
                <select name="status">
                  <option value="extracted">
                    Extraite / transcrite, non vérifiée
                  </option>
                  <option value="estimated">Hypothèse personnelle</option>
                  <option value="conflicting">Contradictoire</option>
                </select>
              </label>
              <button className="secondary">Ajouter au brouillon</button>
            </form>
            <div className="notice">
              <p>
                La lecture locale relève du texte. Les propositions IA restent
                des hypothèses à contrôler dans les originaux. En cas de pièce
                illisible ou de service indisponible, utilisez un extrait ou la
                saisie assistée. MIMMO n’établit pas de diagnostic
                professionnel.
              </p>
            </div>
            {draft.observations.map((o) => (
              <article className="panel evidence" key={o.id}>
                <span className="eyebrow">
                  {o.kind} · {o.status}
                </span>
                <h4>{o.label}</h4>
                <p>{o.value}</p>
                <blockquote>{o.excerpt}</blockquote>
                <p className="subtle">
                  {o.source}
                  {o.page ? " · page " + o.page : ""}
                </p>
                <button
                  className="back"
                  onClick={() =>
                    change({
                      ...draft,
                      observations: draft.observations.filter(
                        (x) => x.id !== o.id,
                      ),
                    })
                  }
                >
                  Retirer du brouillon
                </button>
              </article>
            ))}
            {accountsEnabled && (
              <div className="panel investment-form">
                <h4>Fichiers privés du projet</h4>
                <p>
                  PDF, JPEG, PNG ou WebP · 10 Mo maximum. Les fichiers restent
                  privés. Leur dépôt ne déclenche pas une analyse IA.
                </p>
                <input
                  aria-label="Ajouter un document privé"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  disabled={documentBusy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setDocumentBusy(true);
                    setError("");
                    try {
                      if (file.size > 10 * 1024 * 1024)
                        throw new Error("Fichier limité à 10 Mo.");
                      const response = await fetch("/api/documents/" + p.id, {
                        method: "POST",
                        headers: {
                          "Content-Type": file.type,
                          "X-File-Name": encodeURIComponent(file.name),
                        },
                        body: file,
                        credentials: "same-origin",
                      });
                      if (!response.ok)
                        throw new Error(
                          "Dépôt impossible. Réessayez ou utilisez un extrait.",
                        );
                      await listDocuments();
                      setMessage("Fichier privé enregistré.");
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Dépôt impossible.",
                      );
                    } finally {
                      setDocumentBusy(false);
                    }
                  }}
                />
                <button
                  className="secondary"
                  onClick={listDocuments}
                  disabled={documentBusy}
                >
                  Actualiser les fichiers
                </button>
                {documents.map((doc) => (
                  <div className="candidate" key={doc.name}>
                    <span>{doc.metadata?.originalName || doc.name}</span>
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          const r = await api<{ url: string }>(
                            `documents/${p.id}/${encodeURIComponent(doc.name)}`,
                          );
                          window.open(r.url, "_blank", "noopener,noreferrer");
                        } catch {
                          setError("Lecture du fichier impossible.");
                        }
                      }}
                    >
                      Ouvrir (lien temporaire)
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {tab === "market" && (
          <>
            <h3>Construisez une hypothèse de loyer sourcée.</h3>
            <p>
              Ajoutez des annonces comparables : même secteur, surface et état
              proches. Les loyers affichés ne sont pas des loyers signés. La
              fourchette reste une estimation à vérifier.
            </p>
            <form
              className="panel investment-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = data(e.currentTarget);
                const next = {
                  ...draft,
                  comparables: [
                    ...draft.comparables,
                    {
                      id: crypto.randomUUID(),
                      monthlyRent: Math.round(numeric(f.rent) * 100),
                      area: numeric(f.area),
                      source: String(f.source),
                      date: String(f.date),
                      note: String(f.note),
                    },
                  ],
                };
                try {
                  investmentSchema.parse(next);
                  change(next);
                  e.currentTarget.reset();
                } catch {
                  setError("Comparable invalide (20 maximum).");
                }
              }}
            >
              <div className="form-grid">
                <label>
                  Loyer mensuel hors charges (€)
                  <input
                    name="rent"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                  />
                </label>
                <label>
                  Surface (m²)
                  <input
                    name="area"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                  />
                </label>
              </div>
              <label>
                URL de la source
                <input name="source" type="url" required maxLength={2000} />
              </label>
              <label>
                Date de consultation
                <input name="date" type="date" required />
              </label>
              <label>
                Comparabilité / différences
                <textarea name="note" maxLength={500} />
              </label>
              <button className="secondary">Ajouter le comparable</button>
            </form>
            {range ? (
              <div className="metric-grid">
                <article>
                  <small>Fourchette indicative pour votre surface</small>
                  <strong>
                    {euros(range.low)} – {euros(range.high)}
                  </strong>
                  <span>Médiane : {euros(range.median)}/mois</span>
                </article>
                <article>
                  <small>Confiance : {range.confidence}</small>
                  <strong>{range.count} comparables</strong>
                  <span>
                    Échantillon choisi par vous, sans représentativité garantie.
                  </span>
                </article>
              </div>
            ) : (
              <p className="notice">
                Renseignez la surface du bien et au moins un comparable pour
                calculer une fourchette.
              </p>
            )}
            {draft.comparables.map((c) => (
              <article className="panel" key={c.id}>
                <strong>
                  {euros(c.monthlyRent)}/mois · {c.area} m²
                </strong>
                <p>{c.note}</p>
                <a href={c.source} target="_blank" rel="noreferrer">
                  Consulter la source
                </a>
                <p>{c.date}</p>
                <button
                  className="back"
                  onClick={() =>
                    change({
                      ...draft,
                      comparables: draft.comparables.filter(
                        (x) => x.id !== c.id,
                      ),
                    })
                  }
                >
                  Retirer du brouillon
                </button>
              </article>
            ))}
            <p>
              Sources à consulter :{" "}
              <a
                href="https://app.dvf.etalab.gouv.fr/"
                target="_blank"
                rel="noreferrer"
              >
                DVF (ventes)
              </a>{" "}
              ·{" "}
              <a
                href="https://www.observatoires-des-loyers.org/"
                target="_blank"
                rel="noreferrer"
              >
                Observatoires locaux des loyers
              </a>
              . Aucune donnée de ces services n’est importée automatiquement
              ici.
            </p>
          </>
        )}
        {tab === "works" && (
          <>
            <h3>Comparez les travaux, poste par poste.</h3>
            <p>
              Utilisez vos devis ou des références datées. Les coûts ne sont pas
              préremplis. Le scénario « soi-même » doit inclure matériaux et
              location d’outillage ; votre temps reste à valoriser.
            </p>
            <div className="metric-grid">
              <article>
                <small>Artisans, provision incluse</small>
                <strong>
                  {draft.works.length
                    ? euros(worksBudget(draft.works, "artisan"))
                    : "À chiffrer"}
                </strong>
              </article>
              <article>
                <small>Vous-même, provision incluse</small>
                <strong>
                  {draft.works.length
                    ? euros(worksBudget(draft.works, "diy"))
                    : "À chiffrer"}
                </strong>
              </article>
            </div>
            <form
              className="panel investment-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = data(e.currentTarget);
                const next = {
                  ...draft,
                  works: [
                    ...draft.works,
                    {
                      id: crypto.randomUUID(),
                      label: String(f.label),
                      quantity: numeric(f.quantity),
                      artisanUnit: Math.round(numeric(f.artisan) * 100),
                      diyUnit: Math.round(numeric(f.diy) * 100),
                      source: String(f.source),
                      contingency: numeric(f.contingency),
                    },
                  ],
                };
                try {
                  investmentSchema.parse(next);
                  change(next);
                  e.currentTarget.reset();
                } catch {
                  setError("Poste invalide (20 maximum).");
                }
              }}
            >
              <label>
                Poste / unité
                <input
                  name="label"
                  placeholder="Ex. peinture, m²"
                  required
                  maxLength={160}
                />
              </label>
              <div className="form-grid">
                <label>
                  Quantité
                  <input
                    name="quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Provision pour imprévus (%)
                  <input
                    name="contingency"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    required
                  />
                </label>
                <label>
                  Prix unitaire artisan (€)
                  <input
                    name="artisan"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Prix unitaire soi-même (€)
                  <input
                    name="diy"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                  />
                </label>
              </div>
              <label>
                Devis ou méthode, date et exclusions
                <input name="source" required maxLength={500} />
              </label>
              <button className="secondary">Ajouter le poste</button>
            </form>
            {draft.works.map((w) => (
              <article className="panel" key={w.id}>
                <h4>{w.label}</h4>
                <p>
                  {w.quantity} unités · {w.contingency} % d’imprévus ·{" "}
                  {w.source}
                </p>
                <p>
                  Artisan : {euros(worksBudget([w], "artisan"))} · Soi-même :{" "}
                  {euros(worksBudget([w], "diy"))}
                </p>
                <button
                  className="back"
                  onClick={() =>
                    change({
                      ...draft,
                      works: draft.works.filter((x) => x.id !== w.id),
                    })
                  }
                >
                  Retirer du brouillon
                </button>
              </article>
            ))}
            <p className="notice">
              Électricité, gaz, structure, amiante et autres postes réglementés
              : vérifier qualifications, assurances et faisabilité auprès de
              professionnels. Aucun diagnostic à partir des seules photos.
            </p>
          </>
        )}
        {tab === "finance" && (
          <>
            <h3>Faites varier les hypothèses.</h3>
            <p>
              Résultats instantanés, calculés par du code déterministe. Tous les
              montants sont avant impôts. Renseignez explicitement 0 lorsqu’un
              poste est nul.
            </p>
            <form
              className="panel investment-form"
              onChange={(e) => {
                const f = data(e.currentTarget);
                const keys = Object.keys(
                  FINANCE_LABELS,
                ) as (keyof FinanceInput)[];
                if (keys.some((k) => f[k] === "")) {
                  change({ ...draft, finance: undefined });
                  return;
                }
                const values = Object.fromEntries(
                  keys.map((k) => [
                    k,
                    moneyFields.has(k)
                      ? Math.round(numeric(f[k]) * 100)
                      : numeric(f[k]),
                  ]),
                ) as FinanceInput;
                change({ ...draft, finance: values });
              }}
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="form-grid">
                {(Object.keys(FINANCE_LABELS) as (keyof FinanceInput)[]).map(
                  (k) => (
                    <label key={k}>
                      {FINANCE_LABELS[k]}
                      <input
                        name={k}
                        type="number"
                        min={k === "years" ? 1 : 0}
                        max={
                          k === "years"
                            ? 40
                            : moneyFields.has(k)
                              ? 1000000000
                              : 100
                        }
                        step={k === "years" ? 1 : "0.01"}
                        required
                        defaultValue={
                          draft.finance
                            ? draft.finance[k] / (moneyFields.has(k) ? 100 : 1)
                            : undefined
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              <button className="primary" disabled={saving}>
                Enregistrer les hypothèses
              </button>
            </form>
            {result && stress ? (
              <>
                <div className="metric-grid">
                  <article>
                    <small>Mensualité + assurance</small>
                    <strong>
                      {euros(result.monthlyPayment + result.monthlyInsurance)}
                    </strong>
                  </article>
                  <article
                    className={result.monthlyCashFlow < 0 ? "negative" : ""}
                  >
                    <small>Cash-flow mensuel avant impôts</small>
                    <strong>{euros(result.monthlyCashFlow)}</strong>
                  </article>
                  <article>
                    <small>Rendement brut / net avant impôts</small>
                    <strong>
                      {result.grossYieldPercent.toFixed(2)} % /{" "}
                      {result.netYieldPercent.toFixed(2)} %
                    </strong>
                  </article>
                  <article>
                    <small>Coût global / capital emprunté</small>
                    <strong>{euros(result.totalCost)}</strong>
                    <span>{euros(result.principal)} à financer</span>
                  </article>
                </div>
                <article className="panel">
                  <h4>Et si les conditions sont moins favorables ?</h4>
                  <p>
                    Loyer −10 %, travaux +15 %, entretien +20 %, vacance +5
                    points. Il s’agit d’un test de résistance, pas d’une
                    prévision.
                  </p>
                  <strong>
                    Cash-flow prudent : {euros(stress.monthlyCashFlow)}/mois
                  </strong>
                  <p>
                    Coût des intérêts du scénario central :{" "}
                    {euros(result.totalInterest)}, hors assurance. Apport
                    mobilisé : {euros(result.cashRequired)}.
                  </p>
                </article>
              </>
            ) : (
              <p className="notice">
                Complétez toutes les hypothèses avec des valeurs valides pour
                afficher les résultats.
              </p>
            )}
          </>
        )}
        {tab === "summary" && (
          <>
            <h3>Les bonnes questions avant de vous engager.</h3>
            <ul className="checklist">
              {state.steps.map((s) => (
                <li key={s.label}>
                  {s.done ? "✓" : "○"} {s.label}
                </li>
              ))}
            </ul>
            {risks.length ? (
              risks.map((r, i) => (
                <article className="panel" key={i}>
                  <span className="eyebrow">
                    {r.severity === "missing"
                      ? "Information manquante"
                      : "Point à vérifier"}
                  </span>
                  <h4>{r.title}</h4>
                  <p>{r.detail}</p>
                  <p className="subtle">
                    Source : {r.source}
                    {r.page ? " · page " + r.page : ""}
                  </p>
                </article>
              ))
            ) : (
              <p>
                Aucun point détecté par ces règles. Cela ne garantit pas
                l’absence de risque.
              </p>
            )}
            <article className="panel">
              <h4>Préparer la négociation</h4>
              <p>
                Demandez des justificatifs pour chaque point signalé. Appuyez
                toute demande de baisse sur des devis, des ventes comparables ou
                des dépenses documentées. MIMMO ne déduit aucun rabais
                arbitraire.
              </p>
              <label>
                Votre synthèse et prochaines vérifications
                <textarea
                  value={draft.notes}
                  maxLength={4000}
                  onChange={(e) => change({ ...draft, notes: e.target.value })}
                />
              </label>
            </article>
            <button
              className="primary"
              onClick={() => {
                const url = URL.createObjectURL(
                  createReportPdf({ ...p, investment: draft }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "mimmo-dossier.pdf";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              }}
            >
              Télécharger le dossier PDF
            </button>
            <p className="subtle">
              Le PDF reprend le brouillon affiché, ses sources et ses
              hypothèses. Il prépare un échange bancaire ; ce n’est ni une
              expertise ni une offre de prêt.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
