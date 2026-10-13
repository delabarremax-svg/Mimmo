import { useEffect, useRef, useState } from "react";
import {
  House,
  Info,
  ArrowLeft,
  ArrowUpRight,
  Link as LinkIcon,
} from "lucide-react";
import { createProperty, type Property } from "./domain/property";
import type { PropertyPhoto as Photo } from "./domain/photo";
import Home from "./components/Home";
import PropertyList from "./components/PropertyList";
import PropertyDetail from "./components/PropertyDetail";
import Modal from "./components/Modal";
type Page = "home" | "list" | "import" | "detail";
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [properties, setProperties] = useState<Property[]>([]);
  const [active, setActive] = useState<string>();
  const [initialMode, setInitialMode] = useState<"edit" | "overview">(
    "overview",
  );
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const photoUrls = useRef(new Set<string>());
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<{ run: () => void }>();
  const property = properties.find((p) => p.id === active);
  useEffect(
    () => () => {
      photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (properties.length || dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [properties.length, dirty]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const title = document.querySelector("main h1") as HTMLElement | null;
    title?.setAttribute("tabindex", "-1");
    title?.focus({ preventScroll: true });
  }, [page, active]);
  function perform(run: () => void) {
    if (dirty) setPending({ run });
    else run();
  }
  function navigate(next: Page) {
    perform(() => {
      setPage(next);
      setError("");
    });
  }
  function open(id: string) {
    perform(() => {
      setActive(id);
      setInitialMode("overview");
      setPage("detail");
    });
  }
  function add(event: React.FormEvent) {
    event.preventDefault();
    try {
      const p = createProperty(url);
      setProperties((prev) => [p, ...prev]);
      setActive(p.id);
      setInitialMode("edit");
      setUrl("");
      setPage("detail");
      setError("");
    } catch {
      setError("Saisissez une URL http ou https valide, sans identifiants.");
    }
  }
  function photo(p?: Photo) {
    if (!active) return;
    const old = photos[active];
    if (old) {
      URL.revokeObjectURL(old.url);
      photoUrls.current.delete(old.url);
    }
    if (p) photoUrls.current.add(p.url);
    setPhotos((prev) => {
      const next = { ...prev };
      if (p) next[active] = p;
      else delete next[active];
      return next;
    });
  }
  return (
    <div className="app">
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-icon">
            <House size={21} />
          </span>
          mimmo<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Navigation principale">
          <button
            className={page === "home" ? "selected" : ""}
            aria-current={page === "home" ? "page" : undefined}
            onClick={() => navigate("home")}
          >
            Accueil
          </button>
          <button
            className={page !== "home" ? "selected" : ""}
            aria-current={page !== "home" ? "page" : undefined}
            onClick={() => navigate("list")}
          >
            Mes biens <span className="count">{properties.length}</span>
          </button>
        </nav>
        <span className="preview-label">APERÇU DU PARCOURS</span>
      </header>
      <div className="session-note">
        <Info size={15} />
        <span>
          Mode aperçu · Pas encore de compte MIMMO ni de sauvegarde privée. Vos
          saisies et photos restent en mémoire et disparaissent au rechargement.
        </span>
      </div>
      <main>
        <div className="page-content" key={page}>
          {page === "home" ? (
            <Home navigate={navigate} hasProjects={properties.length > 0} />
          ) : page === "list" ? (
            <PropertyList
              properties={properties}
              photos={photos}
              onAdd={() => navigate("import")}
              onOpen={open}
            />
          ) : page === "import" ? (
            <section className="narrow">
              <button className="back" onClick={() => navigate("list")}>
                <ArrowLeft size={17} />
                Mes biens
              </button>
              <span className="eyebrow">UNE NOUVELLE PISTE</span>
              <h1>Ajoutez votre annonce.</h1>
              <p className="intro">
                Un lien suffit pour commencer. Vous pourrez ensuite donner un
                nom au projet, ajouter votre photo et compléter les informations
                connues.
              </p>
              <form className="panel" onSubmit={add}>
                <label htmlFor="url">URL de l’annonce</label>
                <div className="url-input">
                  <LinkIcon size={19} />
                  <input
                    id="url"
                    type="url"
                    required
                    placeholder="https://…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <div className="notice">
                  <Info size={20} />
                  <p>
                    <strong>
                      L’extraction automatique n’est pas encore disponible.
                    </strong>
                    MIMMO conserve le lien, mais ne lit pas l’annonce. Aucun
                    prix, surface ou autre détail ne sera inventé.
                  </p>
                </div>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <button className="primary" type="submit">
                  Créer la fiche à compléter <ArrowUpRight size={18} />
                </button>
              </form>
              <div className="import-reassurance">
                <span>01 · Garder le lien</span>
                <span>02 · Compléter à votre rythme</span>
                <span>03 · Retrouver vos repères</span>
              </div>
            </section>
          ) : property ? (
            <PropertyDetail
              key={property.id}
              property={property}
              photo={photos[property.id]}
              onPhoto={photo}
              initialMode={initialMode}
              onSave={(updated) =>
                setProperties((prev) =>
                  prev.map((p) => (p.id === updated.id ? updated : p)),
                )
              }
              onBack={() => navigate("list")}
              onDirty={setDirty}
            />
          ) : null}
        </div>
      </main>
      <footer>
        <span className="brand">mimmo.</span>
        <span>Les bonnes questions, avant les grandes décisions.</span>
        <span>Parcours guidé · v0.2</span>
      </footer>
      {pending && (
        <Modal
          title="Modifications non enregistrées"
          onClose={() => setPending(undefined)}
        >
          <h2>Gardez vos dernières modifications.</h2>
          <p>
            Vous avez des saisies en brouillon sur cette fiche. Quitter
            abandonnera ces modifications ; les informations déjà enregistrées
            resteront dans cette session.
          </p>
          <div className="modal-actions">
            <button
              className="primary"
              autoFocus
              onClick={() => setPending(undefined)}
            >
              Continuer la saisie
            </button>
            <button
              className="secondary"
              onClick={() => {
                const run = pending.run;
                setPending(undefined);
                setDirty(false);
                run();
              }}
            >
              Quitter sans enregistrer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
