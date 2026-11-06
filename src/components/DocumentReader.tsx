import { useEffect, useRef, useState } from "react";
import { readDocument, type DocumentPage } from "../services/read-document";
export default function DocumentReader({
  onUse,
  onExtract,
  autoExtract = false,
}: {
  onUse: (text: string, page: number, source: string) => void;
  onExtract?: (
    text: string,
    page: number,
    source: string,
    method: "pdf" | "ocr",
  ) => void;
  autoExtract?: boolean;
}) {
  const [pages, setPages] = useState<DocumentPage[]>([]),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  return (
    <div className="panel investment-form">
      <h4>Lire un PDF ou une capture sur votre appareil</h4>
      <p>
        Extraction locale du texte : vos fichiers ne sont pas envoyés à une IA.
        Vérifiez les chiffres dans l’original. Un PDF scanné sans texte peut est
        aussi lu par OCR local (jusqu’à 10 pages scannées par fichier).
      </p>
      <input
        aria-label="Lire un PDF ou une capture"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const request = ++epoch.current;
          setBusy(true);
          setError("");
          setPages([]);
          setName(file.name);
          try {
            const read = await readDocument(file, (message) => {
              if (request === epoch.current) setMessage(message);
            });
            if (request !== epoch.current) return;
            setPages(read);
            if (autoExtract)
              for (const page of read)
                if (page.text)
                  onExtract?.(
                    page.text,
                    page.page,
                    file.name,
                    page.method === "ocr" ? "ocr" : "pdf",
                  );
            setMessage(
              read.some((p) => p.issue)
                ? "Lecture terminée avec des pages à compléter. Consultez les indications par page."
                : "Lecture terminée. Examinez le texte avant de l’intégrer.",
            );
          } catch (e) {
            if (request !== epoch.current) return;
            setError(
              e instanceof Error
                ? e.message
                : "Lecture impossible. Utilisez une transcription manuelle.",
            );
          } finally {
            if (request === epoch.current) setBusy(false);
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
          {p.issue && (
            <p className="error" role="status">
              {p.issue}
            </p>
          )}
          {p.text ? (
            <>
              <pre className="document-text">{p.text}</pre>
              {onExtract && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    onExtract(
                      p.text,
                      p.page,
                      name,
                      p.method === "ocr" ? "ocr" : "pdf",
                    )
                  }
                >
                  Proposer les champs de cette annonce
                </button>
              )}
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
