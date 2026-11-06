import { useEffect, useRef, useState } from "react";
import { readDocument, type DocumentSession } from "../services/read-document";
import type { CapturePage } from "../domain/capture-analysis";
function CaptureThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (
      !file.type.startsWith("image/") ||
      typeof URL.createObjectURL !== "function"
    )
      return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? (
    <img className="capture-thumbnail" src={url} alt={"Aperçu " + file.name} />
  ) : null;
}
export default function CaptureBatchReader({
  onAnalyze,
  onPending,
}: {
  onAnalyze: (pages: CapturePage[]) => void;
  onPending: (pending: boolean) => void;
}) {
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [completed, setCompleted] = useState(0);
  const epoch = useRef(0),
    active = useRef<DocumentSession | undefined>(undefined);
  useEffect(
    () => () => {
      epoch.current++;
      if (active.current) active.current.aborted = true;
      void active.current?.worker?.terminate().catch(() => {});
    },
    [],
  );
  function changed(next: typeof files) {
    setFiles(next);
    setMessage("");
    setError("");
    onPending(next.length > 0);
    if (!next.length) onAnalyze([]);
  }
  async function analyze() {
    if (!files.length) return;
    const id = ++epoch.current;
    setBusy(true);
    onPending(true);
    setError("");
    setCompleted(0);
    const pages: CapturePage[] = [],
      session: DocumentSession = {};
    active.current = session;
    try {
      for (let i = 0; i < files.length; i++) {
        if (id !== epoch.current) return;
        const { file } = files[i];
        setMessage(
          `Capture ou document ${i + 1} / ${files.length} · ${file.name}`,
        );
        try {
          const read = await readDocument(
            file,
            (m) => {
              if (id === epoch.current)
                setMessage(`${i + 1} / ${files.length} · ${file.name} · ${m}`);
            },
            session,
          );
          for (const p of read)
            pages.push({
              source: file.name,
              page: p.page,
              text: p.text,
              method: p.method === "ocr" ? "ocr" : "pdf",
              ...(p.confidence !== undefined
                ? { confidence: p.confidence }
                : {}),
              ...(p.issue ? { issue: p.issue } : {}),
            });
        } catch (e) {
          pages.push({
            source: file.name,
            page: 1,
            text: "",
            method: "ocr",
            issue: e instanceof Error ? e.message : "Lecture impossible.",
          });
        }
        if (id === epoch.current) setCompleted(i + 1);
        if (pages.length > 200)
          throw new Error("Le lot dépasse 200 pages. Réduisez les PDF.");
      }
      if (id !== epoch.current) return;
      onAnalyze(pages);
      onPending(false);
      setMessage(
        pages.every((p) => !p.text.trim())
          ? "Lecture terminée sans texte exploitable. Choisissez des captures plus lisibles ou collez le texte accessible."
          : pages.some((p) => p.issue)
            ? "Lecture terminée partiellement. Consultez les erreurs par fichier dans les textes bruts."
            : "Lecture terminée. Une seule fiche est proposée pour l’ensemble du lot.",
      );
    } catch (e) {
      if (id === epoch.current)
        setError(e instanceof Error ? e.message : "Analyse interrompue.");
    } finally {
      await session.worker?.terminate().catch(() => {});
      if (active.current === session) active.current = undefined;
      if (id === epoch.current) setBusy(false);
    }
  }
  return (
    <section className="capture-batch" aria-label="Captures de la même annonce">
      <h3>Les captures d’une même annonce</h3>
      <p>
        Sélectionnez jusqu’à 20 captures ou PDF. Ajoutez, retirez ou réordonnez
        les fichiers, puis lancez une seule analyse. Lecture locale : les
        fichiers ne sont pas envoyés à une IA.
      </p>
      <label className="secondary capture-picker">
        Ajouter des captures ou PDF
        <input
          aria-label="Lire un PDF ou une capture"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            const incoming = Array.from(e.target.files || []);
            e.target.value = "";
            const next = [...files];
            for (const file of incoming)
              if (
                !next.some(
                  (x) =>
                    x.file.name === file.name &&
                    x.file.size === file.size &&
                    x.file.lastModified === file.lastModified,
                )
              )
                next.push({ id: crypto.randomUUID(), file });
            if (
              next.length > 20 ||
              next.reduce((n, x) => n + x.file.size, 0) > 100 * 1024 * 1024 ||
              next.some((x) => x.file.size > 10 * 1024 * 1024)
            ) {
              setError(
                "Maximum 20 fichiers, 10 Mo par fichier et 100 Mo au total. Réduisez la sélection.",
              );
              return;
            }
            changed(next);
          }}
        />
      </label>
      {!!files.length && (
        <>
          <p>
            {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné
            {files.length > 1 ? "s" : ""}
          </p>
          <ol className="capture-queue">
            {files.map((x, i) => (
              <li key={x.id}>
                <CaptureThumbnail file={x.file} />
                <span>{x.file.name}</span>
                <div>
                  <button
                    type="button"
                    className="back"
                    aria-label={`Monter ${x.file.name}`}
                    disabled={busy || i === 0}
                    onClick={() => {
                      const next = [...files];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      changed(next);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="back"
                    aria-label={`Descendre ${x.file.name}`}
                    disabled={busy || i === files.length - 1}
                    onClick={() => {
                      const next = [...files];
                      [next[i + 1], next[i]] = [next[i], next[i + 1]];
                      changed(next);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="back"
                    disabled={busy}
                    aria-label={`Retirer ${x.file.name}`}
                    onClick={() => changed(files.filter((f) => f.id !== x.id))}
                  >
                    Retirer
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => void analyze()}
          >
            {busy
              ? "Lecture des captures…"
              : files.length === 1
                ? "Analyser le fichier"
                : `Analyser les ${files.length} fichiers`}
          </button>
        </>
      )}
      {busy && (
        <>
          <progress
            max={files.length}
            value={completed}
            aria-label="Fichiers lus"
          />
          <button
            type="button"
            className="back"
            onClick={() => {
              epoch.current++;
              void sessionStop();
            }}
          >
            Interrompre
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="subtle">
        L’OCR peut prendre du temps sur iPhone. Une petite police, un flou ou un
        graphique DPE peuvent rester illisibles. Aucun résultat n’est considéré
        comme vérifié.
      </p>
    </section>
  );
  async function sessionStop() {
    if (active.current) active.current.aborted = true;
    await active.current?.worker?.terminate().catch(() => {});
    active.current = undefined;
    setBusy(false);
    setMessage(
      "Lecture interrompue. Relancez l’analyse du lot avant sauvegarde.",
    );
    onPending(true);
  }
}
