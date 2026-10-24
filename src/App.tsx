import Account from "./components/Account";
import { accountsEnabled, api, persist } from "./services/account";
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
import InvestmentWorkspace from "./components/InvestmentWorkspace";
import { demoProjects } from "./domain/demo";
type Page = "home" | "list" | "import" | "detail";
export default function App() {
  const [user, setUser] = useState<string>();
  const [loading, setLoading] = useState(accountsEnabled);
  const [busy, setBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  useEffect(() => {
    if (!accountsEnabled) return;
    if (new URLSearchParams(location.search).get("recovery") === "1") {
      setLoading(false);
      return;
    }
    api<{ user: { email: string } }>("session")
      .then(async ({ user }) => {
        const result = await api<{ properties: Property[] }>("properties");
        setProperties(result.properties);
        setUser(user.email);
      })
      .catch(() => setUser(undefined))
      .finally(() => setLoading(false));
  }, []);
  async function connected(email: string) {
    const result = await api<{ properties: Property[] }>("properties");
    setProperties(result.properties);
    setUser(email);
    setPage("list");
  }
  async function saveProperty(updated: Property) {
    setBusy(true);
    setSyncMessage("Enregistrement en cours…");
    try {
      const saved = accountsEnabled ? await persist(updated) : updated;
      setProperties((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setSyncMessage("");
    } catch (error) {
      setSyncMessage("Échec de l’enregistrement. Brouillon conservé.");
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const [page, setPage] = useState<Page>("home");
  const [detailView, setDetailView] = useState<"facts" | "investment">("facts");
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
  const [investmentDirty, setInvestmentDirty] = useState(false);
  const [pending, setPending] = useState<{
    run: () => void;
    deleting?: boolean;
  }>();
  const property = properties.find((p) => p.id === active);
  useEffect(
    () => () => {
      photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (
        (!accountsEnabled && properties.length) ||
        dirty ||
        investmentDirty ||
        busy
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [properties.length, dirty, investmentDirty, busy]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const title = Array.from(
      document.querySelectorAll<HTMLElement>("main h1"),
    ).find((node) => !node.closest("[hidden]"));
    title?.setAttribute("tabindex", "-1");
    title?.focus({ preventScroll: true });
  }, [page, active, detailView]);
  function perform(run: () => void) {
    if (busy) return;
    if (dirty || investmentDirty) setPending({ run });
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
      setDetailView(import.meta.env.MODE === "v1demo" ? "investment" : "facts");
      setPage("detail");
    });
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    try {
      setBusy(true);
      const draft = createProperty(url);
      const p = accountsEnabled ? await persist(draft) : draft;
      setProperties((prev) => [p, ...prev]);
      setActive(p.id);
      setInitialMode("edit");
      setDetailView("facts");
      setUrl("");
      setPage("detail");
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Impossible de créer le bien.",
      );
    } finally {
      setBusy(false);
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
      <header className={accountsEnabled ? "accounts-header" : undefined}>
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
        {accountsEnabled ? (
          user && (
            <button
              className="back"
              onClick={() =>
                perform(async () => {
                  setBusy(true);
                  try {
                    await api("logout", "POST", {});
                    setProperties([]);
                    setUser(undefined);
                    setActive(undefined);
                    setPhotos({});
                    photoUrls.current.forEach(URL.revokeObjectURL);
                    photoUrls.current.clear();
                    setDirty(false);
                    setInvestmentDirty(false);
                    setSyncMessage("");
                    setPage("home");
                  } catch {
                    setSyncMessage("Déconnexion impossible. Réessayez.");
                  } finally {
                    setBusy(false);
                  }
                })
              }
            >
              Se déconnecter
            </button>
          )
        ) : (
          <span className="preview-label">APERÇU DU PARCOURS</span>
        )}
      </header>
      <div className="session-note">
        <Info size={15} />
        <span>
          {accountsEnabled
            ? user
              ? `Espace privé · ${user} · Photos temporaires, non sauvegardées.`
              : "Vos biens sauvegardés dans votre espace privé."
            : "Mode aperçu · Pas encore de compte MIMMO ni de sauvegarde privée. Vos saisies et photos restent en mémoire et disparaissent au rechargement."}
        </span>
      </div>
      <main>
        {import.meta.env.MODE === "v1demo" && (
          <div className="demo-banner">
            <strong>DÉMONSTRATION FICTIVE</strong>
            <span>
              Aucune donnée réelle ni analyse IA. Vos essais restent dans cette
              session.
            </span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                perform(() => {
                  setProperties(demoProjects());
                  setPage("list");
                  setInvestmentDirty(false);
                })
              }
            >
              Charger les deux projets fictifs
            </button>
          </div>
        )}
        {syncMessage && (
          <p role="status" className="session-note">
            {syncMessage}
          </p>
        )}
        {page === "detail" && property && (
          <div className="detail-switch" aria-label="Vue du bien">
            <button
              className={detailView === "facts" ? "primary" : "secondary"}
              onClick={() => setDetailView("facts")}
            >
              Fiche du bien
            </button>
            <button
              className={detailView === "investment" ? "primary" : "secondary"}
              onClick={() => setDetailView("investment")}
            >
              Dossier d’investissement
            </button>
          </div>
        )}
        {loading ? (
          <section className="narrow" role="status">
            Ouverture de votre espace…
          </section>
        ) : accountsEnabled && !user ? (
          <Account onConnected={connected} />
        ) : (
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
                  nom au projet, ajouter votre photo et compléter les
                  informations connues.
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
                  <button className="primary" type="submit" disabled={busy}>
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
              <div className="detail-panel" hidden={detailView !== "facts"}>
                <PropertyDetail
                  key={property.id}
                  property={property}
                  photo={photos[property.id]}
                  onPhoto={photo}
                  initialMode={initialMode}
                  onSave={saveProperty}
                  onBack={() => navigate("list")}
                  onDirty={setDirty}
                />
              </div>
            ) : null}
          </div>
        )}
        {page === "detail" && property && (!accountsEnabled || user) && (
          <div className="detail-panel" hidden={detailView !== "investment"}>
            <h1>
              {property.facts.title.value || "Votre dossier d’investissement"}
            </h1>
            <InvestmentWorkspace
              key={property.id}
              property={property}
              onSave={saveProperty}
              onDirty={setInvestmentDirty}
            />
          </div>
        )}
        {page === "detail" && property && (
          <button
            className="back"
            disabled={busy}
            onClick={() => {
              setPending({
                deleting: true,
                run: async () => {
                  setBusy(true);
                  try {
                    if (accountsEnabled)
                      await api(`properties/${property.id}`, "DELETE", {});
                    setProperties((prev) =>
                      prev.filter((p) => p.id !== property.id),
                    );
                    photo();
                    setDirty(false);
                    setPage("list");
                    setSyncMessage("Bien supprimé.");
                  } catch {
                    setSyncMessage("Suppression impossible. Réessayez.");
                  } finally {
                    setBusy(false);
                  }
                },
              });
            }}
          >
            Supprimer ce bien
          </button>
        )}
      </main>
      <footer>
        <span className="brand">mimmo.</span>
        <span>Les bonnes questions, avant les grandes décisions.</span>
        <span>Parcours guidé · v0.2</span>
      </footer>
      {pending && (
        <Modal
          title={
            pending.deleting
              ? "Supprimer ce bien"
              : "Modifications non enregistrées"
          }
          onClose={() => setPending(undefined)}
        >
          <h2>
            {pending.deleting
              ? "Supprimer définitivement ce bien ?"
              : "Gardez vos dernières modifications."}
          </h2>
          <p>
            {pending.deleting
              ? "Cette suppression est définitive. Le bien et ses informations seront retirés de votre espace."
              : "Quitter abandonnera les modifications non enregistrées. Les informations déjà enregistrées resteront disponibles."}
          </p>
          <div className="modal-actions">
            <button
              className="primary"
              autoFocus
              onClick={() => setPending(undefined)}
            >
              {pending.deleting ? "Annuler" : "Continuer la saisie"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                const run = pending.run;
                setPending(undefined);
                setDirty(false);
                setInvestmentDirty(false);
                run();
              }}
            >
              {pending.deleting
                ? "Supprimer définitivement"
                : "Quitter sans enregistrer"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
