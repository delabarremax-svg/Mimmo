import { useEffect, useState } from "react";
import { unpackTranscripts } from "../services/capture-transcripts";
import type { ListingRecord } from "../domain/listing-import";
import type { CapturePage } from "../domain/capture-analysis";
export function RawTranscripts({ pages }: { pages: CapturePage[] }) {
  return (
    <details className="panel raw-transcripts">
      <summary>
        Textes bruts et provenance · {pages.length} page
        {pages.length > 1 ? "s" : ""}
      </summary>
      <p>
        Texte original de la lecture, parasites et erreurs inclus. Il ne
        constitue pas une information vérifiée.
      </p>
      <button
        className="secondary"
        type="button"
        onClick={() => {
          const blob = new Blob([JSON.stringify(pages, null, 2)], {
              type: "application/json",
            }),
            url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "mimmo-textes-bruts.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Télécharger le texte brut
      </button>
      {pages.map((p, i) => (
        <details key={i}>
          <summary>
            {p.source} · page {p.page} ·{" "}
            {p.method === "ocr" ? "OCR à contrôler" : "Texte fourni"}
          </summary>
          {p.issue && <p className="error">{p.issue}</p>}
          <pre className="document-text">
            {p.text || "Aucun texte reconnu."}
          </pre>
        </details>
      ))}
    </details>
  );
}
export default function TranscriptArchive({
  archive,
}: {
  archive: NonNullable<ListingRecord["transcripts"]>;
}) {
  const [pages, setPages] = useState<CapturePage[]>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setPages(undefined);
    unpackTranscripts(archive)
      .then((p) => {
        if (active) setPages(p);
      })
      .catch(() => {
        if (active) setError("Le texte brut n’a pas pu être relu.");
      });
    return () => {
      active = false;
    };
  }, [archive]);
  return pages ? (
    <RawTranscripts pages={pages} />
  ) : (
    <p role="status">{error || "Préparation des textes bruts…"}</p>
  );
}
