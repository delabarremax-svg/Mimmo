import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Link as LinkIcon,
  FileSearch,
  Camera,
  Check,
  AlertCircle,
} from "lucide-react";
import { validateUrl, type Property } from "../domain/property";
import { accountsEnabled, api } from "../services/account";
import {
  blankReport,
  detectPlatform,
  importLabels,
  fieldLimits,
  prepareImportedProperty,
  textEvidence,
  uniqueEvidence,
  type ImportEvidence,
  type ImportField,
  type ImportReport,
} from "../domain/listing-import";
import CaptureBatchReader from "./CaptureBatchReader";
import { RawTranscripts } from "./TranscriptArchive";
import {
  contextualEvidence,
  hasConflict,
  canonicalValue,
  mergeDescriptions,
  primaryFields,
  type CapturePage,
} from "../domain/capture-analysis";
import { packTranscripts } from "../services/capture-transcripts";
export function ImportedMedia({ photos }: { photos: ImportReport["photos"] }) {
  if (!photos.length)
    return (
      <p className="subtle">
        Photos non récupérées. Vous pourrez ajouter vos propres photos à la
        fiche.
      </p>
    );
  return (
    <div className="import-media">
      <h3>
        {photos.length} lien{photos.length > 1 ? "s" : ""} photo repéré
        {photos.length > 1 ? "s" : ""}
      </h3>
      <p>
        Les images ne sont ni copiées ni chargées automatiquement. Consultez
        leur source pour vérifier le bien et les droits d’utilisation.
      </p>
      {photos.map((p, i) => (
        <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer">
          <Camera size={18} /> Photo {i + 1} · {new URL(p.url).hostname}
        </a>
      ))}
    </div>
  );
}
export default function ListingImport({
  onSave,
  onCancel,
  onDirty,
}: {
  onSave: (p: Property) => Promise<void>;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [url, setUrl] = useState(""),
    [report, setReport] = useState<ImportReport>(),
    [evidence, setEvidence] = useState<ImportEvidence[]>([]),
    [values, setValues] = useState<Partial<Record<ImportField, string>>>({}),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [capturePages, setCapturePages] = useState<CapturePage[]>([]),
    [pending, setPending] = useState(false);
  const touched = useRef(new Set<ImportField>());
  const request = useRef(0),
    controller = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      request.current++;
      controller.current?.abort();
    },
    [],
  );
  function merge(items: ImportEvidence[], replaceDocuments = false) {
    const next = uniqueEvidence([
      ...(replaceDocuments
        ? evidence.filter((e) => !["ocr", "pdf"].includes(e.method))
        : evidence),
      ...items,
    ]);
    setEvidence(next);
    setValues((prev) => {
      const values = { ...prev };
      for (const field of Object.keys(importLabels) as ImportField[]) {
        if (touched.current.has(field)) continue;
        const proofs = next.filter((e) => e.field === field),
          safe = proofs.filter((e) => e.certainty !== "uncertain");
        values[field] =
          hasConflict(field, proofs) ||
          (!["title", "description", "features"].includes(field) &&
            new Set(safe.map((e) => canonicalValue(field, e.value))).size > 1)
            ? ""
            : safe[0]?.value || "";
      }
      return values;
    });
    onDirty(true);
  }
  function analyzeCaptures(pages: CapturePage[]) {
    setCapturePages(pages);
    const items = pages
      .flatMap((p) =>
        contextualEvidence(
          p.text,
          `${report?.url} · ${p.source}`,
          p.method,
          p.page,
          p.confidence,
        ),
      )
      .filter((e) => e.field !== "description");
    const featureItems = items.filter(
      (e) => e.field === "features" && e.certainty !== "uncertain",
    );
    const features = [...new Set(featureItems.map((e) => e.value))]
      .join("\n")
      .slice(0, 1000);
    const description = mergeDescriptions(pages);
    if (description)
      items.push({
        field: "description",
        value: description,
        source: (
          "Synthèse des captures · " + pages.map((p) => p.source).join(", ")
        ).slice(0, 500),
        excerpt: description.slice(0, 500),
        method: "ocr",
      });
    if (features) {
      const representative = featureItems[0];
      items.push({
        ...representative,
        value: features,
        source: (
          "Synthèse des captures · " + pages.map((p) => p.source).join(", ")
        ).slice(0, 500),
      });
      const combined = items.pop()!;
      merge(
        [
          combined,
          ...items.filter(
            (e) => e.field !== "features" || e.certainty === "uncertain",
          ),
        ],
        true,
      );
    } else merge(items, true);
  }
  async function read() {
    setError("");
    setCapturePages([]);
    setPending(false);
    touched.current.clear();
    let normalized: string;
    try {
      normalized = validateUrl(url);
    } catch {
      setError(
        "Ajoutez une URL complète http:// ou https:// sans identifiants.",
      );
      return;
    }
    const id = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    setReport(undefined);
    setEvidence([]);
    setValues({});
    try {
      const result = accountsEnabled
        ? await api<ImportReport>(
            "import-listing",
            "POST",
            { url: normalized },
            controller.current.signal,
          )
        : {
            ...blankReport(normalized),
            outcome: "authorization_required" as const,
            code: "demo_offline",
            message:
              "La lecture distante exige votre espace connecté et une source autorisée. Ajoutez le contenu auquel vous avez accès.",
          };
      if (id !== request.current) return;
      setUrl(normalized);
      setReport(result);
      merge(result.evidence);
    } catch (e) {
      if (id !== request.current) return;
      setReport({
        ...blankReport(normalized),
        code: "unavailable",
        message:
          e instanceof Error && e.name === "AbortError"
            ? "Lecture interrompue. Vous pouvez ajouter une capture ou du texte."
            : "Lecture indisponible. Ajoutez une capture, un PDF ou du texte, puis réessayez la sauvegarde.",
      });
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  async function save(empty = false) {
    if (!report || saving || pending) return;
    setSaving(true);
    setError("");
    try {
      const transcripts = capturePages.length
        ? await packTranscripts(capturePages)
        : undefined;
      await onSave(
        prepareImportedProperty(
          report.url,
          empty ? {} : values,
          empty ? [] : evidence,
          {
            ...report,
            evidence: empty ? [] : evidence,
            ...(transcripts ? { transcripts } : {}),
          },
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Enregistrement impossible. La relecture est conservée.",
      );
    } finally {
      setSaving(false);
    }
  }
  let platform = "";
  try {
    platform = detectPlatform(url);
  } catch {
    /* incomplete URL */
  }
  const reviewGroup = (f: ImportField) =>
    values[f] ? 0 : evidence.some((e) => e.field === f) ? 1 : 2;
  const count = primaryFields.filter((k) =>
    values[k as ImportField]?.trim(),
  ).length;
  return (
    <section
      className="listing-import narrow"
      aria-label="Importer une annonce"
    >
      <button className="back" disabled={busy || saving} onClick={onCancel}>
        <ArrowLeft size={17} />
        Mes biens
      </button>
      <span className="eyebrow">UNE NOUVELLE PISTE</span>
      <h1>Votre annonce, vos premiers repères.</h1>
      <p className="intro">
        Un lien, puis une fiche à relire. Chaque information garde sa source ;
        les éléments absents restent signalés.
      </p>
      <ol className="import-steps" aria-label="Étapes de l’import">
        <li aria-current={!report ? "step" : undefined}>1 · Le lien</li>
        <li aria-current={report ? "step" : undefined}>2 · Vos informations</li>
        <li>3 · Sauvegarde privée</li>
      </ol>
      <form
        className="panel investment-form"
        onSubmit={(e) => {
          e.preventDefault();
          void read();
        }}
      >
        <label htmlFor="import-url">URL de l’annonce</label>
        <div className="url-input">
          <LinkIcon size={18} />
          <input
            id="import-url"
            type="url"
            required
            maxLength={8000}
            placeholder="https://…"
            value={url}
            disabled={busy || saving}
            onChange={(e) => {
              setCapturePages([]);
              setPending(false);
              touched.current.clear();
              setUrl(e.target.value);
              setCapturePages([]);
              setPending(false);
              touched.current.clear();
              setReport(undefined);
              setEvidence([]);
              setValues({});
              setText("");
              onDirty(true);
            }}
          />
        </div>
        {platform && <p className="import-platform">{platform}</p>}
        <div className="import-alternatives">
          <button
            type="button"
            className="back"
            disabled={busy || saving}
            onClick={() => {
              setUrl(
                location.origin + "/import-examples/appartement-fictif.html",
              );
              setCapturePages([]);
              setPending(false);
              touched.current.clear();
              setReport(undefined);
              setEvidence([]);
              setValues({});
              onDirty(true);
            }}
          >
            Essayer l’appartement fictif MIMMO
          </button>
          <button
            type="button"
            className="back"
            disabled={busy || saving}
            onClick={() => {
              setUrl(location.origin + "/import-examples/maison-fictive.html");
              setCapturePages([]);
              setPending(false);
              touched.current.clear();
              setReport(undefined);
              setEvidence([]);
              setValues({});
              onDirty(true);
            }}
          >
            Essayer la maison fictive MIMMO
          </button>
        </div>
        <button className="primary" disabled={busy || saving}>
          {busy ? "Vérification de la source et lecture…" : "Lire l’annonce"}
          <FileSearch size={18} />
        </button>
        {busy && (
          <div role="status">
            <progress aria-label="Lecture de l’annonce en cours" />
            <p>
              La lecture peut prendre quelques secondes. Aucun bien n’est
              enregistré à cette étape.
            </p>
            <button
              type="button"
              className="back"
              onClick={() => controller.current?.abort()}
            >
              Interrompre la lecture
            </button>
          </div>
        )}
      </form>
      {report && (
        <>
          <div
            className={
              report.evidence.length ? "notice" : "notice import-fallback"
            }
            role="status"
          >
            <AlertCircle size={20} />
            <div>
              <strong>
                {report.evidence.length
                  ? "Premières informations disponibles"
                  : "Complétons à partir de votre contenu"}
              </strong>
              <p>{report.message}</p>
              <p>
                {report.attempted
                  ? "Vérification distante tentée."
                  : "Aucune lecture distante de l’annonce effectuée."}{" "}
                · {report.platform}
              </p>
            </div>
          </div>
          <details
            className="panel import-rescue"
            open={count < 8 || undefined}
          >
            <summary>Ajouter des captures, un PDF ou du texte</summary>
            <p>
              Utilisez le contenu auquel vous avez accès et les droits
              nécessaires. La lecture reste sur votre appareil, sans appel à une
              IA.
            </p>
            <CaptureBatchReader
              onAnalyze={analyzeCaptures}
              onPending={setPending}
            />
            {!!capturePages.length && <RawTranscripts pages={capturePages} />}
            <label htmlFor="listing-copy">Texte copié de l’annonce</label>
            <textarea
              id="listing-copy"
              rows={6}
              maxLength={100000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Collez le texte accessible : prix, surface, pièces, DPE, charges…"
            />
            <button
              type="button"
              className="secondary"
              disabled={!text.trim() || saving}
              onClick={() => merge(textEvidence(text, report.url))}
            >
              Extraire de ce texte
            </button>
          </details>
          <div className="panel import-review">
            <div className="investment-heading">
              <div>
                <span className="eyebrow">À RELIRE AVANT SAUVEGARDE</span>
                <h2>
                  {count} information{count > 1 ? "s" : ""} sur 8 renseignée
                  {count > 1 ? "s" : ""}
                </h2>
                <p>Ce suivi compte les champs, pas la qualité du bien.</p>
              </div>
            </div>
            <progress
              value={count}
              max={8}
              aria-label="Informations renseignées"
            />
            <p className="subtle">
              Prix et surface habitable ne sont pas déduits d’un nombre isolé.
              Les autres montants et surfaces sont conservés séparément.
            </p>
            {(Object.keys(importLabels) as ImportField[])
              .filter(
                (field) =>
                  primaryFields.includes(field) ||
                  evidence.some((e) => e.field === field) ||
                  values[field],
              )
              .sort((a, b) => {
                return reviewGroup(a) - reviewGroup(b);
              })
              .map((field, index, all) => {
                const proofs = evidence.filter((c) => c.field === field),
                  alternatives = proofs
                    .filter(
                      (c, i, a) =>
                        a.findIndex(
                          (x) =>
                            canonicalValue(field, x.value) ===
                            canonicalValue(field, c.value),
                        ) === i,
                    )
                    .map((c) => c.value),
                  conflict = hasConflict(field, proofs),
                  corrected =
                    !!values[field] &&
                    !proofs.some((p) => p.value === values[field]);
                return (
                  <div className="import-field" key={field}>
                    {(index === 0 ||
                      reviewGroup(field) !== reviewGroup(all[index - 1])) && (
                      <p className="eyebrow">
                        {values[field]
                          ? "Fiche synthétique · à relire"
                          : proofs.length
                            ? "À confirmer avant utilisation"
                            : "Informations manquantes"}
                      </p>
                    )}
                    <label htmlFor={"review-" + field}>
                      {importLabels[field]}
                    </label>
                    <span
                      className={
                        conflict ? "import-badge conflict" : "import-badge"
                      }
                    >
                      {conflict
                        ? "Contradiction à examiner"
                        : !values[field]
                          ? proofs.length
                            ? "À confirmer"
                            : "Manquante"
                          : proofs.some(
                                (p) =>
                                  p.value === values[field] &&
                                  p.certainty === "uncertain",
                              )
                            ? touched.current.has(field)
                              ? "Confirmation personnelle · OCR incertain"
                              : "À confirmer"
                            : corrected
                              ? "Saisie ou correction personnelle"
                              : "Extraite · à contrôler"}
                    </span>
                    {field === "description" ? (
                      <textarea
                        id={"review-" + field}
                        rows={5}
                        maxLength={fieldLimits[field]}
                        value={values[field] || ""}
                        disabled={saving}
                        onChange={(e) => {
                          touched.current.add(field);
                          setValues({ ...values, [field]: e.target.value });
                          onDirty(true);
                        }}
                      />
                    ) : (
                      <input
                        id={"review-" + field}
                        inputMode={
                          ["price", "area", "rooms"].includes(field)
                            ? "decimal"
                            : "text"
                        }
                        maxLength={fieldLimits[field]}
                        value={values[field] || ""}
                        disabled={saving}
                        onChange={(e) => {
                          touched.current.add(field);
                          setValues({ ...values, [field]: e.target.value });
                          onDirty(true);
                        }}
                      />
                    )}
                    {(conflict ||
                      (!values[field] && alternatives.length > 0)) && (
                      <select
                        aria-label={"Proposition pour " + importLabels[field]}
                        value=""
                        disabled={saving}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          touched.current.add(field);
                          setValues({ ...values, [field]: e.target.value });
                          onDirty(true);
                        }}
                      >
                        <option value="">
                          Choisir une proposition à confirmer…
                        </option>
                        {alternatives.map((value) => (
                          <option key={value} value={value}>
                            {value.slice(0, 160)}
                          </option>
                        ))}
                      </select>
                    )}
                    {field === "charges" &&
                      values.charges &&
                      !/(?:mois|annuel|mensuel|\/\s*an\b|par\s+an)/i.test(
                        values.charges,
                      ) && (
                        <p className="subtle">
                          La période de ces charges n’est pas précisée. Vérifiez
                          si elles sont mensuelles ou annuelles avant tout
                          calcul.
                        </p>
                      )}
                    {proofs.length > 0 ? (
                      <details>
                        <summary>
                          Voir {proofs.length > 1 ? "les sources" : "la source"}
                        </summary>
                        {proofs.map((c, i) => (
                          <div key={i} className="import-proof">
                            <p>
                              {c.source}
                              {c.page ? ` · page ${c.page}` : ""} ·{" "}
                              {
                                {
                                  ocr: "OCR à contrôler",
                                  pdf: "Texte du PDF",
                                  text: "Texte fourni",
                                  jsonld: "Données structurées de l’annonce",
                                  metadata: "Informations de la page",
                                  partner: "Flux partenaire autorisé",
                                }[c.method]
                              }
                            </p>
                            <blockquote>{c.excerpt}</blockquote>
                          </div>
                        ))}
                      </details>
                    ) : (
                      <p className="subtle">
                        Aucune valeur extraite pour ce champ. Vous pouvez le
                        compléter ou le laisser vide.
                      </p>
                    )}
                  </div>
                );
              })}
            <ImportedMedia photos={report.photos} />
            <p className="subtle">
              DPE et charges sont conservés comme observations sourcées. Un lien
              photo ne constitue pas une analyse du logement.
            </p>
            {pending && (
              <p role="status">
                La sélection a changé. Analysez le lot avant de sauvegarder.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="import-save">
              <button
                type="button"
                className="primary"
                disabled={saving || pending || !count}
                onClick={() => void save()}
              >
                {saving
                  ? "Sauvegarde en cours…"
                  : accountsEnabled
                    ? "Enregistrer dans mes biens"
                    : "Conserver pour cette session"}
                <Check size={18} />
              </button>
              <button
                type="button"
                className="back"
                disabled={saving || pending}
                onClick={() => void save(true)}
              >
                Garder seulement le lien, sans information
              </button>
            </div>
          </div>
        </>
      )}
      {!report && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
