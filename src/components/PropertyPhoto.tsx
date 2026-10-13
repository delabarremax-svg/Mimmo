import { useEffect, useRef, useState } from "react";
import { ImagePlus, House, Trash2, Expand } from "lucide-react";
import Modal from "./Modal";
import { readPhoto, type PropertyPhoto as Photo } from "../domain/photo";
export default function PropertyPhoto({
  photo,
  onChange,
  compact = false,
}: {
  photo?: Photo;
  onChange?: (photo?: Photo) => void;
  compact?: boolean;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  async function choose(file?: File) {
    if (!file || !onChange) return;
    setBusy(true);
    setError("");
    try {
      const photo = await readPhoto(file);
      if (mounted.current) onChange(photo);
      else URL.revokeObjectURL(photo.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo indisponible.");
    } finally {
      if (mounted.current) setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className={`photo-container ${compact ? "photo-compact" : ""}`}>
      <div className={`photo-frame ${photo ? "has-photo" : ""}`}>
        {photo ? (
          <img
            src={photo.url}
            alt="Photo fournie pour ce projet, non vérifiée"
          />
        ) : (
          <div className="photo-empty">
            <House size={compact ? 36 : 46} />
            <span>
              {compact
                ? "Aucune photo ajoutée"
                : "Donnez un visage à votre projet"}
            </span>
            {!compact && (
              <p>
                Ajoutez votre photo du bien. Aucune image d’annonce n’est
                récupérée automatiquement.
              </p>
            )}
          </div>
        )}
        {!compact && photo && (
          <button
            className="photo-expand"
            aria-label="Agrandir la photo"
            onClick={() => setExpanded(true)}
          >
            <Expand size={18} />
          </button>
        )}
        {!compact && onChange && (
          <div className="photo-actions">
            <button
              className="photo-add"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <ImagePlus size={17} />
              {busy
                ? "Lecture de la photo…"
                : photo
                  ? "Changer la photo"
                  : "Ajouter une photo"}
            </button>
            {photo && (
              <button
                className="photo-remove"
                aria-label="Retirer la photo"
                onClick={() => onChange()}
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        )}
      </div>
      {!compact && (
        <>
          <p className="photo-caption">
            {photo
              ? "Photo fournie par vous · association au bien non vérifiée"
              : "JPG, PNG ou WebP · 10 Mo maximum"}
            <br />
            Photo temporaire, effacée au rechargement.
          </p>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choisir une photo du bien"
            className="sr-only"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
      {expanded && photo && (
        <Modal
          title="Photo du projet"
          className="photo-dialog"
          onClose={() => setExpanded(false)}
        >
          <img src={photo.url} alt="Photo fournie, non vérifiée" />
          <button
            className="primary"
            autoFocus
            onClick={() => setExpanded(false)}
          >
            Fermer la photo
          </button>
        </Modal>
      )}
    </div>
  );
}
