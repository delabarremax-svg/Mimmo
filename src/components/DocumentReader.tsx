import { useState } from "react";
import { readDocument, type DocumentPage } from "../services/read-document";
export default function DocumentReader({
  onUse,
}: {
  onUse: (text: string, page: number, source: string) => void;
}) {
  const [pages, setPages] = useState<DocumentPage[]>([]),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="panel investment-form">
      <h4>Lire un PDF ou une capture sur votre appareil</h4>
      <p>
        Extraction locale du texte : vos fichiers ne sont pas envoyés à une IA.
        Vérifiez les chiffres dans l’original. Un PDF scanné sans texte peut
        être lu à partir d’une capture JPG/PNG de la page.
      </p>
      <input
        aria-label="Lire un PDF ou une capture"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError("");
          setPages([]);
          setName(file.name);
          try {
            setPages(await readDocument(file, setMessage));
            setMessage(
              "Lecture terminée. Examinez le texte avant de l’intégrer.",
            );
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Lecture impossible. Utilisez une transcription manuelle.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pages.map((p) => (
        <details key={p.page}>
          <summary>
            Page {p.page} ·{" "}
            {p.method === "ocr" ? "OCR, à contrôler" : "Texte du PDF"}
            {p.confidence !== undefined
              ? " · indice OCR " + Math.round(p.confidence) + "/100"
              : ""}
          </summary>
          {p.text ? (
            <>
              <pre className="document-text">{p.text}</pre>
              <button
                className="secondary"
                type="button"
                onClick={() => onUse(p.text, p.page, name)}
              >
                Utiliser cet extrait (2 000 caractères maximum)
              </button>
            </>
          ) : (
            <p>
              Page sans texte exploitable. Ajoutez une capture ou transcrivez le
              passage utile.
            </p>
          )}
        </details>
      ))}
    </div>
  );
}
