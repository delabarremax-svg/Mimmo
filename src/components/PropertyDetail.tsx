import { accountsEnabled } from "../services/account";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  Check,
  Info,
  TriangleAlert,
  ShieldCheck,
  ChevronRight,
  Bookmark,
  ClipboardList,
  Clock,
} from "lucide-react";
import {
  fields,
  validateFact,
  type Property,
  type FieldKey,
  type Fact,
  type Status,
} from "../domain/property";
import { formatFact, projectSummary } from "../domain/project-summary";
import type { PropertyPhoto as Photo } from "../domain/photo";
import PropertyPhoto from "./PropertyPhoto";
import ProvenanceBadge from "./ProvenanceBadge";
const groups: [string, string, FieldKey[]][] = [
  [
    "L’essentiel",
    "Donnez un nom à votre projet et rassemblez les premiers repères.",
    ["title", "city", "price"],
  ],
  [
    "Le logement",
    "Notez ce que vous connaissez, sans combler les inconnues.",
    ["area", "rooms"],
  ],
  [
    "Mes notes",
    "Gardez vos observations et les questions à poser.",
    ["description"],
  ],
];
const groupOf = (key: FieldKey) =>
  groups.findIndex(([, , keys]) => keys.includes(key));
const sameFact = (a: Fact, b: Fact) =>
  a.value === b.value && a.status === b.status && a.source === b.source;
export default function PropertyDetail({
  property,
  photo,
  initialMode,
  onSave,
  onPhoto,
  onBack,
  onDirty,
}: {
  property: Property;
  photo?: Photo;
  initialMode: "overview" | "edit";
  onSave: (p: Property) => void | Promise<void>;
  onPhoto: (p?: Photo) => void;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => structuredClone(property.facts));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const summary = projectSummary(property);
  const dirty = (Object.keys(fields) as FieldKey[]).some(
    (key) => !sameFact(draft[key], property.facts[key]),
  );
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  function edit(key?: FieldKey) {
    setStep(key ? groupOf(key) : 0);
    setMode("edit");
    setError("");
    setMessage("");
  }
  function update(key: FieldKey, change: Partial<Fact>) {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
    setMessage("");
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = { ...property.facts };
    const nextDraft = { ...draft };
    for (const key of groups[step][2]) {
      try {
        next[key] = validateFact(key, draft[key]);
        nextDraft[key] = next[key];
      } catch (e) {
        setMessage("");
        setError(
          `${fields[key]} : ${e instanceof Error ? e.message : "Saisie invalide."}`,
        );
        document.getElementById(key)?.focus();
        return;
      }
    }
    if (saving) return;
    setSaving(true);
    setMessage("Enregistrement en cours…");
    try {
      await onSave({ ...property, facts: next });
    } catch (e) {
      setMessage("");
      setError(e instanceof Error ? e.message : "Échec. Réessayez.");
      return;
    } finally {
      setSaving(false);
    }
    setDraft(nextDraft);
    setError("");
    setMessage(
      accountsEnabled
        ? "Modifications enregistrées sur votre compte."
        : "Modifications enregistrées pour cette session.",
    );
  }
  function move(next: number) {
    setStep(next);
    setError("");
    setMessage("");
  }
  return (
    <section className="content detail">
      <button className="back" onClick={onBack}>
        <ArrowLeft size={17} />
        Mes biens
      </button>
      <div className="section-heading">
        <div>
          <span className="eyebrow">VOTRE PROJET IMMOBILIER</span>
          <h1>{property.facts.title.value || "Bien à compléter"}</h1>
          <p className="subtle">
            {property.facts.city.value || "Ville à renseigner"} · Aucune analyse
            réalisée
          </p>
        </div>
        <a
          className="source-link"
          href={property.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir l’annonce <ArrowUpRight size={17} />
        </a>
      </div>
      <div className="project-hero">
        <PropertyPhoto photo={photo} onChange={onPhoto} />
        <div className="project-highlights">
          <span className="eyebrow">LES REPÈRES DU PROJET</span>
          <div className="highlight-price">
            <strong>
              {property.facts.price.value
                ? formatFact(property, "price")
                : "Prix à renseigner"}
            </strong>
            <ProvenanceBadge status={property.facts.price.status} />
          </div>
          <div className="highlight-grid">
            {(["area", "rooms"] as FieldKey[]).map((key) => (
              <div key={key}>
                <span>{key === "area" ? "Surface" : "Pièces"}</span>
                <strong>{formatFact(property, key)}</strong>
                <ProvenanceBadge status={property.facts[key].status} />
              </div>
            ))}
          </div>
          <div className="collection">
            <div>
              <strong>{summary.known} sur 6 champs renseignés</strong>
              <span>Collecte des informations</span>
            </div>
            <progress
              value={summary.known}
              max={6}
              aria-label="Champs renseignés"
              aria-valuetext={`${summary.known} champs sur 6 renseignés`}
            />
            <p>Ce suivi concerne la saisie, pas l’analyse du bien.</p>
          </div>
        </div>
      </div>
      <div className="project-tabs" aria-label="Vues du projet">
        <button
          aria-pressed={mode === "overview"}
          onClick={() => setMode("overview")}
        >
          <ClipboardList size={17} />
          Vue d’ensemble
        </button>
        <button aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
          <Bookmark size={17} />
          Compléter le bien{" "}
          {dirty && (
            <span
              className="draft-dot"
              aria-label="Modifications non enregistrées"
            />
          )}
        </button>
      </div>
      {mode === "overview" ? (
        <div className="overview-layout">
          <div>
            <section className="dashboard-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">VOTRE PROCHAIN PAS</span>
                  <h2>
                    {summary.conflicts.length
                      ? "Rapprochez les sources en désaccord."
                      : summary.missing.length
                        ? "Complétez les informations qui manquent."
                        : "Vos premiers repères sont réunis."}
                  </h2>
                </div>
              </div>
              {summary.conflicts.length > 0 && (
                <div className="real-alert">
                  <TriangleAlert size={19} />
                  <div>
                    <strong>
                      {summary.conflicts.length} information
                      {summary.conflicts.length > 1 ? "s" : ""} contradictoire
                      {summary.conflicts.length > 1 ? "s" : ""}
                    </strong>
                    <p>
                      Des sources ont été marquées comme étant en désaccord.
                      Aucun arbitrage automatique n’a été réalisé.
                    </p>
                  </div>
                </div>
              )}
              <div className="next-actions">
                {(summary.conflicts.length
                  ? summary.conflicts
                  : summary.missingEssentials.length
                    ? summary.missingEssentials
                    : summary.missing
                )
                  .slice(0, 3)
                  .map((key) => (
                    <button key={key} onClick={() => edit(key)}>
                      <span>
                        <span className="action-icon">
                          {property.facts[key].status === "conflicting" ? (
                            <TriangleAlert size={16} />
                          ) : (
                            <ArrowRight size={16} />
                          )}
                        </span>
                        <span>
                          {property.facts[key].status === "conflicting"
                            ? "Clarifier"
                            : "Renseigner"}{" "}
                          : {fields[key]}
                          <small>
                            {property.facts[key].status === "conflicting"
                              ? "Comparez les valeurs et leurs sources."
                              : "Une information connue vaut mieux qu’une hypothèse cachée."}
                          </small>
                        </span>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
              </div>
              {!summary.missing.length && !summary.conflicts.length && (
                <p className="subtle">
                  Les 6 champs sont renseignés. Cela ne signifie pas que les
                  informations sont vérifiées ou que le bien a été analysé.
                </p>
              )}
              <div className="verification-note">
                <ShieldCheck size={19} />
                <div>
                  <strong>
                    {summary.verified
                      ? `${summary.verified} information(s) vérifiée(s) par document`
                      : "Aucune information vérifiée par document"}
                  </strong>
                  <p>
                    La vérification documentaire sera disponible après la mise
                    en place des comptes et du stockage privé.
                  </p>
                </div>
              </div>
            </section>
            <section className="dashboard-panel">
              <div className="panel-heading">
                <h2>Les informations connues</h2>
                <button className="text-action" onClick={() => edit()}>
                  Modifier <ArrowRight size={16} />
                </button>
              </div>
              <p className="subtle">
                Cette vue reflète vos informations enregistrées.
              </p>
              <div className="known-facts">
                {(Object.keys(fields) as FieldKey[]).map((key) => (
                  <article className="known-fact" key={key}>
                    <div>
                      <span>{fields[key]}</span>
                      <ProvenanceBadge status={property.facts[key].status} />
                    </div>
                    <strong>{formatFact(property, key)}</strong>
                    {property.facts[key].source && (
                      <details>
                        <summary>Voir la source</summary>
                        <p>{property.facts[key].source}</p>
                        <small>
                          Dernière saisie :{" "}
                          {new Date(
                            property.facts[key].updatedAt,
                          ).toLocaleString("fr-FR")}
                        </small>
                      </details>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
          <aside>
            <section className="dashboard-panel future-panel">
              <span className="eyebrow">LA SUITE DU PARCOURS</span>
              <h2>Des bases solides avant de simuler.</h2>
              <p>
                Vos futures analyses s’appuieront sur des données sourcées et
                des hypothèses explicites.
              </p>
              {[
                "Documents et vérifications",
                "Risques et points à éclaircir",
                "Simulation financière",
              ].map((title) => (
                <div className="future-step" key={title}>
                  <Clock size={16} />
                  <div>
                    <strong>{title}</strong>
                    <span>
                      À explorer dans le dossier d’investissement ci-dessous
                    </span>
                  </div>
                </div>
              ))}
              <p className="future-caption">
                Les simulations dépendent exclusivement des hypothèses que vous
                renseignez dans le dossier.
              </p>
            </section>
            <ProvenanceLegend />
          </aside>
        </div>
      ) : (
        <section className="guided-panel">
          <div className="guide-intro">
            <span className="eyebrow">COMPLÉTEZ À VOTRE RYTHME</span>
            <h2>Quelques repères, une étape à la fois.</h2>
            <p>
              Vous pouvez laisser les inconnues vides. Rien n’est extrait
              automatiquement de l’annonce.
            </p>
          </div>
          <div className="guide-steps" aria-label="Étapes de saisie">
            {groups.map(([title, , keys], index) => (
              <button
                key={title}
                aria-pressed={index === step}
                onClick={() => move(index)}
              >
                <span className="step-number">{index + 1}</span>
                <span>
                  {title}
                  <small>
                    {keys.filter((key) => property.facts[key].value).length} sur{" "}
                    {keys.length} renseignés
                  </small>
                </span>
              </button>
            ))}
          </div>
          <form onSubmit={save}>
            <fieldset className="save-fields" disabled={saving}>
              <div className="step-description">
                <h3>{groups[step][0]}</h3>
                <p>{groups[step][1]}</p>
              </div>
              <div className="guided-fields">
                {groups[step][2].map((key) => (
                  <GuidedFact
                    key={key}
                    fieldKey={key}
                    fact={draft[key]}
                    url={property.url}
                    onChange={(change) => update(key, change)}
                  />
                ))}
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {message && (
                <p role="status" className="success">
                  <Check size={18} />
                  {message}
                </p>
              )}
              <div className="guided-save">
                <span>
                  {dirty
                    ? "Modifications à enregistrer"
                    : "Vos données restent temporaires"}
                </span>
                <button className="primary" type="submit" disabled={saving}>
                  Enregistrer les modifications <Check size={18} />
                </button>
              </div>
              <div className="guide-navigation">
                {step > 0 ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => move(step - 1)}
                  >
                    <ArrowLeft size={16} />
                    Étape précédente
                  </button>
                ) : (
                  <span />
                )}
                {step < 2 ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => move(step + 1)}
                  >
                    Étape suivante <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setMode("overview")}
                  >
                    Voir le tableau de bord <ArrowRight size={16} />
                  </button>
                )}
              </div>
              <p className="guide-footnote">
                Chaque enregistrement concerne l’étape affichée. Les autres
                modifications restent en brouillon tant que vous êtes sur cette
                fiche.
              </p>
            </fieldset>
          </form>
          <details className="legend-details">
            <summary>Comment lire la provenance des informations ?</summary>
            <ProvenanceLegend />
          </details>
        </section>
      )}
    </section>
  );
}
function GuidedFact({
  fieldKey: key,
  fact,
  url,
  onChange,
}: {
  fieldKey: FieldKey;
  fact: Fact;
  url: string;
  onChange: (change: Partial<Fact>) => void;
}) {
  const [sourceOpen, setSourceOpen] = useState(
    Boolean(fact.value) || Boolean(fact.source),
  );
  const valueId = key;
  return (
    <fieldset className="guided-fact">
      <legend>{fields[key]}</legend>
      <div className="field-label">
        <label htmlFor={valueId}>{fields[key]}</label>
        <ProvenanceBadge status={fact.value ? fact.status : "missing"} />
      </div>
      {key === "description" ? (
        <textarea
          id={valueId}
          name={key}
          value={fact.value}
          onChange={(e) => {
            onChange({ value: e.target.value });
            if (e.target.value) setSourceOpen(true);
          }}
          rows={4}
          maxLength={4000}
          placeholder="Vos observations et questions à poser…"
        />
      ) : (
        <input
          id={valueId}
          name={key}
          value={fact.value}
          onChange={(e) => {
            onChange({ value: e.target.value });
            if (e.target.value) setSourceOpen(true);
          }}
          placeholder={
            key === "title"
              ? "Le nom que vous donnez au projet"
              : "À renseigner si vous connaissez cette information"
          }
          inputMode={
            ["price", "area", "rooms"].includes(key) ? "decimal" : undefined
          }
          maxLength={4000}
        />
      )}
      {key === "title" && (
        <p className="field-hint">
          Un nom personnel de projet peut être indiqué comme « Estimée », avec «
          Nom personnel du projet » comme source.
        </p>
      )}
      <button
        className="source-toggle"
        type="button"
        aria-expanded={sourceOpen}
        aria-controls={`${key}-provenance`}
        onClick={() => setSourceOpen(!sourceOpen)}
      >
        Préciser la provenance <ChevronRight size={16} />
      </button>
      {sourceOpen && (
        <div id={`${key}-provenance`} className="source-fields">
          <label htmlFor={`${key}-status`}>Provenance</label>
          <select
            id={`${key}-status`}
            name={`${key}-status`}
            value={fact.status}
            onChange={(e) => onChange({ status: e.target.value as Status })}
          >
            <option value="missing">
              Manquante · aucune information connue
            </option>
            <option value="listing">
              Extraite de l’annonce · recopiée manuellement
            </option>
            <option value="estimated">
              Estimée · saisie manuelle non vérifiée
            </option>
            <option value="conflicting">
              Contradictoire · sources en désaccord
            </option>
            <option value="verified" disabled>
              Vérifiée par document · indisponible
            </option>
          </select>
          <label htmlFor={`${key}-source`}>Source ou méthode</label>
          <input
            id={`${key}-source`}
            name={`${key}-source`}
            value={fact.source}
            onChange={(e) => onChange({ source: e.target.value })}
            maxLength={2000}
            placeholder={
              fact.status === "conflicting"
                ? "Les valeurs en désaccord et leurs sources"
                : "Origine de la valeur ou méthode de votre estimation"
            }
          />
          {fact.status === "listing" && (
            <>
              <button
                className="text-action"
                type="button"
                onClick={() => onChange({ source: url })}
              >
                Utiliser le lien de l’annonce
              </button>
              <p className="field-hint">
                Ajoutez le passage de l’annonce. Une transcription n’est pas une
                vérification.
              </p>
            </>
          )}
          {fact.status === "conflicting" && (
            <p className="field-hint">
              Conservez les différentes valeurs dans la source. MIMMO ne tranche
              pas entre elles.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
function ProvenanceLegend() {
  return (
    <section className="provenance-legend">
      <h3>Chaque information a une origine.</h3>
      {(
        [
          [
            "verified",
            "Contrôlée à partir d’un document. Indisponible pour le moment.",
          ],
          ["listing", "Recopiée par vous depuis l’annonce."],
          ["estimated", "Votre hypothèse ou saisie non vérifiée."],
          ["conflicting", "Des sources sont en désaccord."],
          ["missing", "Une information encore inconnue."],
        ] as [Status, string][]
      ).map(([status, text]) => (
        <div key={status}>
          <ProvenanceBadge status={status} />
          <p>{text}</p>
        </div>
      ))}
    </section>
  );
}
