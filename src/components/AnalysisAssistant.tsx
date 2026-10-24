import { useEffect, useState } from "react";
import type { Observation } from "../domain/investment";
type Finding = {
  title: string;
  detail: string;
  quote: string;
  confidence: "low" | "medium";
};
export default function AnalysisAssistant({
  evidence,
  onAdd,
}: {
  evidence: { source: string; page: number; text: string };
  onAdd: (o: Observation) => void;
}) {
  const [source, setSource] = useState(evidence.source),
    [page, setPage] = useState(evidence.page),
    [text, setText] = useState(evidence.text),
    [image, setImage] = useState<string>(),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [findings, setFindings] = useState<Finding[]>([]),
    [used, setUsed] = useState<number[]>([]),
    [model, setModel] = useState("");
  useEffect(() => {
    setSource(evidence.source);
    setPage(evidence.page);
    setText(evidence.text);
    setImage(undefined);
    setFindings([]);
    setUsed([]);
  }, [evidence]);
  if (import.meta.env.VITE_EU_AI_ENABLED !== "true")
    return (
      <section className="panel">
        <h4>Analyse IA européenne</h4>
        <p>
          L’analyse IA des documents réels attend le raccordement d’un
          fournisseur garantissant un traitement dans l’Union européenne. Aucun
          contenu n’est envoyé à une IA dans cet aperçu. La lecture PDF, l’OCR
          local et les observations sourcées restent disponibles.
        </p>
      </section>
    );
  return (
    <section className="panel investment-form">
      <h4>Un second regard, avec l’IA</h4>
      <p>
        Expérimental : l’IA propose des points à vérifier. Elle ne remplace ni
        un diagnostiqueur ni un artisan et ne calcule aucun rendement ou budget.
        L’activation nécessite un fournisseur et des conditions garantissant le
        traitement dans l’Union européenne.
      </p>
      <form
        className="investment-form"
        onChange={() => {
          setFindings([]);
          setUsed([]);
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setFindings([]);
          setUsed([]);
          try {
            const path =
              import.meta.env.MODE === "v1demo"
                ? "/demo-api/analyze"
                : "/api/analyze";
            const response = await fetch(path, {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source,
                page,
                text,
                consent,
                ...(image ? { image } : {}),
              }),
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(result.error || "Analyse indisponible.");
            setFindings(result.findings);
            setModel(result.model);
            if (!result.findings.length)
              setError(
                "Aucun élément exploitable identifié. Cela ne garantit pas l’absence de risque.",
              );
          } catch (e) {
            setError(e instanceof Error ? e.message : "Analyse indisponible.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Source à analyser
          <input
            required
            maxLength={400}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <label>
          Page de l’extrait
          <input
            type="number"
            min={1}
            max={10000}
            required
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          />
        </label>
        <label>
          Extrait envoyé à l’IA
          <textarea
            maxLength={6000}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          Ou une photo / capture à examiner
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError("");
              setFindings([]);
              try {
                if (
                  file.size > 10 * 1024 * 1024 ||
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                )
                  throw new Error("Image JPG/PNG/WebP, 10 Mo maximum.");
                const bitmap = await createImageBitmap(file);
                if (bitmap.width * bitmap.height > 16000000) {
                  bitmap.close();
                  throw new Error("Image limitée à 16 mégapixels.");
                }
                const ratio = Math.min(
                  1,
                  400 / Math.max(bitmap.width, bitmap.height),
                );
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
                canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  bitmap.close();
                  throw new Error("Image illisible.");
                }
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
                let value = canvas.toDataURL("image/jpeg", 0.55).split(",")[1];
                if (value.length > 56000)
                  value = canvas.toDataURL("image/jpeg", 0.3).split(",")[1];
                if (value.length > 56000)
                  throw new Error(
                    "Image encore trop volumineuse. Recadrez la zone utile.",
                  );
                setImage(value);
                setSource(file.name);
                setPage(1);
              } catch (e) {
                setImage(undefined);
                setError(e instanceof Error ? e.message : "Image illisible.");
              }
            }}
          />
        </label>
        {image && (
          <button
            type="button"
            className="back"
            onClick={() => setImage(undefined)}
          >
            Retirer la vignette de l’envoi
          </button>
        )}
        <label className="consent">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            J’accepte d’envoyer cet extrait ou cette vignette au fournisseur
            configuré avec un traitement garanti dans l’Union européenne. Je
            dispose des droits nécessaires et vérifierai le résultat.
          </span>
        </label>
        <button
          className="secondary"
          disabled={busy || !consent || (!text.trim() && !image)}
        >
          {busy ? "Analyse en cours…" : "Proposer les points à vérifier"}
        </button>
      </form>
      {error && <p role="status">{error}</p>}
      {findings.map((f, i) => (
        <article className="evidence" key={i}>
          <span className="eyebrow">
            Hypothèse IA · confiance{" "}
            {f.confidence === "low" ? "faible" : "moyenne, non calibrée"}
          </span>
          <h4>{f.title}</h4>
          <p>{f.detail}</p>
          {f.quote && <blockquote>{f.quote}</blockquote>}
          <p className="subtle">
            {source} · page {page} · {model}
          </p>
          <button
            className="secondary"
            disabled={used.includes(i)}
            onClick={() => {
              onAdd({
                id: crypto.randomUUID(),
                kind: image ? "photo" : "other",
                label: f.title,
                value: f.detail,
                source: (
                  "Proposition IA (confiance " +
                  (f.confidence === "low" ? "faible" : "moyenne non calibrée") +
                  ") " +
                  model +
                  " · " +
                  source
                ).slice(0, 500),
                page,
                excerpt: f.quote,
                status: "estimated",
                date: new Date().toISOString(),
              });
              setUsed((prev) => [...prev, i]);
            }}
          >
            {used.includes(i)
              ? "Ajoutée au brouillon"
              : "Conserver comme hypothèse à vérifier"}
          </button>
        </article>
      ))}
    </section>
  );
}
