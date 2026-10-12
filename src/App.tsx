import { useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  House,
  Layers,
  Link as LinkIcon,
  ShieldCheck,
  ChevronRight,
  Search,
  FileText,
  Check,
  Info,
} from "lucide-react";
import {
  createProperty,
  completeness,
  fields,
  statuses,
  validateFact,
  type Property,
  type FieldKey,
  type Status,
} from "./domain/property";
export default function App() {
  const [page, setPage] = useState<"home" | "list" | "import" | "detail">(
    "home",
  );
  const [properties, setProperties] = useState<Property[]>([]);
  const [active, setActive] = useState<string>();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const property = properties.find((p) => p.id === active);
  function navigate(next: typeof page) {
    setPage(next);
    setError("");
    setMessage("");
  }
  function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const p = createProperty(url);
      setProperties((prev) => [p, ...prev]);
      setActive(p.id);
      setUrl("");
      navigate("detail");
    } catch {
      setError("Saisissez une URL http ou https valide, sans identifiants.");
    }
  }
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!property) return;
    const data = new FormData(e.currentTarget);
    try {
      const facts = { ...property.facts };
      for (const key of Object.keys(fields) as FieldKey[])
        facts[key] = validateFact(key, {
          value: String(data.get(key) || ""),
          status: String(data.get(`${key}-status`)) as Status,
          source: String(data.get(`${key}-source`) || ""),
          updatedAt: "",
        });
      setProperties((prev) =>
        prev.map((p) => (p.id === active ? { ...p, facts } : p)),
      );
      setError("");
      setMessage("Modifications enregistrées pour cette session.");
    } catch (err) {
      setMessage("");
      setError(
        err instanceof Error ? err.message : "Impossible d’enregistrer.",
      );
    }
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
            onClick={() => navigate("home")}
          >
            Accueil
          </button>
          <button
            className={page !== "home" ? "selected" : ""}
            onClick={() => navigate("list")}
          >
            Mes biens <span className="count">{properties.length}</span>
          </button>
        </nav>
        <span className="preview-label">PREMIER APERÇU</span>
      </header>
      <div className="session-note">
        <Info size={15} />
        <span>
          Mode aperçu · Aucune connexion ni sauvegarde privée. Vos saisies
          restent en mémoire et disparaissent au rechargement.
        </span>
      </div>
      <main>
        {page === "home" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span className="tiny-dot" /> INVESTIR AVEC LES BONNES
                  INFORMATIONS
                </span>
                <h1>
                  Tu as trouvé un bien ?<br />
                  <span>
                    Découvre ce que
                    <br />
                    l’annonce ne te dit pas.
                  </span>
                </h1>
                <p>
                  Un investissement se prépare au-delà des belles photos.
                  Rassemble les faits, identifie les informations manquantes et
                  avance avec plus de clarté.
                </p>
                <button className="primary" onClick={() => navigate("import")}>
                  Ajouter mon premier bien <ArrowUpRight size={19} />
                </button>
                <div className="hero-foot">
                  <ShieldCheck size={16} /> Des faits sourcés. Des incertitudes
                  visibles.
                </div>
              </div>
              <div
                className="hero-visual"
                aria-label="Illustration d’un dossier immobilier à compléter"
              >
                <div className="visual-grid" />
                <div className="outline-building">
                  <div />
                  <div />
                  <div />
                  <div />
                  <div />
                  <div />
                </div>
                <div className="floating-tag">
                  <Search size={17} /> Regardez au-delà de l’annonce
                </div>
                <div className="dossier">
                  <div className="dossier-top">
                    <span className="mini-house">
                      <House />
                    </span>
                    <span className="pill">À COMPLÉTER</span>
                  </div>
                  <h3>Votre prochain investissement</h3>
                  <p>Le point de départ : des informations fiables.</p>
                  <div className="fact-line">
                    <span>Prix du bien</span>
                    <span className="missing">Manquant</span>
                  </div>
                  <div className="fact-line">
                    <span>Surface habitable</span>
                    <span className="missing">Manquante</span>
                  </div>
                  <div className="fact-line">
                    <span>Documents justificatifs</span>
                    <span className="missing">Non fournis</span>
                  </div>
                  <div className="dossier-bottom">
                    <span className="signal" /> Chaque information a une
                    origine.
                  </div>
                </div>
                <span className="visual-caption">
                  VOTRE DÉCISION COMMENCE PAR LES FAITS.
                </span>
              </div>
            </section>
            <section className="steps-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">VOTRE PREMIER PAS</span>
                  <h2>De l’annonce à une vision plus claire.</h2>
                </div>
                <span className="subtle">Un bien à la fois.</span>
              </div>
              <div className="steps">
                {[
                  [
                    LinkIcon,
                    "01",
                    "Ajoutez votre annonce",
                    "Conservez son URL pour retrouver la source.",
                  ],
                  [
                    FileText,
                    "02",
                    "Rassemblez les informations",
                    "Complétez les faits connus et leur provenance.",
                  ],
                  [
                    Layers,
                    "03",
                    "Repérez ce qui manque",
                    "Distinguez les faits des hypothèses avant d’avancer.",
                  ],
                ].map(([Icon, n, title, text]) => {
                  const I = Icon as typeof LinkIcon;
                  return (
                    <article key={String(n)}>
                      <div className="step-top">
                        <I size={23} />
                        <span>{String(n)}</span>
                      </div>
                      <h3>{String(title)}</h3>
                      <p>{String(text)}</p>
                    </article>
                  );
                })}
              </div>
            </section>
            <div className="roadmap">
              <ShieldCheck />
              <div>
                <strong>Un socle clair, avant les analyses.</strong>
                <p>
                  Les modules DPE, copropriété, travaux, financement et dossier
                  bancaire viendront ensuite. Aucune analyse automatique n’est
                  disponible dans cet aperçu.
                </p>
              </div>
            </div>
          </>
        ) : page === "list" ? (
          <section className="content">
            <div className="section-heading">
              <div>
                <span className="eyebrow">VOTRE ESPACE DE TRAVAIL</span>
                <h1>Mes biens</h1>
                <p className="subtle">
                  Vos pistes d’investissement, réunies au même endroit.
                </p>
              </div>
              <button className="primary" onClick={() => navigate("import")}>
                <Plus size={18} /> Ajouter un bien
              </button>
            </div>
            {properties.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">
                  <House size={36} />
                </span>
                <h2>Votre prochain projet commence ici.</h2>
                <p>
                  Ajoutez l’URL d’une annonce, puis complétez les informations
                  que vous connaissez.
                </p>
                <button className="primary" onClick={() => navigate("import")}>
                  Ajouter mon premier bien <ArrowUpRight size={18} />
                </button>
              </div>
            ) : (
              <div className="property-grid">
                {properties.map((p) => (
                  <button
                    className="property-card"
                    key={p.id}
                    onClick={() => {
                      setActive(p.id);
                      navigate("detail");
                    }}
                  >
                    <div className="property-art">
                      <House size={45} />
                      <span className="pill">SAISIE MANUELLE</span>
                    </div>
                    <div className="property-body">
                      <h2>{p.facts.title.value || "Bien à compléter"}</h2>
                      <p>{p.facts.city.value || "Ville manquante"}</p>
                      <strong>
                        {p.facts.price.value
                          ? `${Number(p.facts.price.value.replace(",", ".")).toLocaleString("fr-FR")} €`
                          : "Prix manquant"}
                      </strong>
                      <div className="card-bottom">
                        <span>
                          {completeness(p)} / 6 informations renseignées
                        </span>
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : page === "import" ? (
          <section className="narrow">
            <button className="back" onClick={() => navigate("list")}>
              <ArrowLeft size={17} /> Mes biens
            </button>
            <span className="eyebrow">UNE NOUVELLE PISTE</span>
            <h1>Ajoutez votre annonce.</h1>
            <p className="intro">
              Tout commence par un lien. Les informations du bien seront ensuite
              à compléter par vos soins.
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
                  </strong>{" "}
                  MIMMO conserve le lien, mais ne lit pas l’annonce. Aucun prix,
                  surface ou autre détail ne sera inventé.
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
          </section>
        ) : property ? (
          <section className="content detail">
            <button className="back" onClick={() => navigate("list")}>
              <ArrowLeft size={17} /> Mes biens
            </button>
            <div className="section-heading">
              <div>
                <span className="eyebrow">FICHE DU BIEN</span>
                <h1>{property.facts.title.value || "Bien à compléter"}</h1>
                <p className="subtle">
                  {completeness(property)} informations renseignées sur 6 ·
                  Aucune analyse réalisée
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
            <div className="notice">
              <Info size={20} />
              <p>
                Le lien n’a pas été analysé. Complétez les informations
                manuellement et indiquez leur origine. Une information recopiée
                n’est pas une vérification.
              </p>
            </div>
            <form onSubmit={save}>
              <div className="field-grid">
                {(Object.keys(fields) as FieldKey[]).map((key) => (
                  <FactEditor
                    key={`${property.id}-${key}`}
                    fieldKey={key}
                    property={property}
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
              <div className="save-bar">
                <span>
                  Enregistrement temporaire · Cette session uniquement
                </span>
                <button className="primary" type="submit">
                  Enregistrer les modifications <Check size={18} />
                </button>
              </div>
            </form>
            <aside className="roadmap">
              <ShieldCheck />
              <div>
                <strong>La vérification par document arrive plus tard.</strong>
                <p>
                  Aucun document ne peut être téléversé ici. Les analyses et
                  calculs financiers ne sont pas encore activés.
                </p>
              </div>
            </aside>
          </section>
        ) : null}
      </main>
      <footer>
        <span className="brand">mimmo.</span>
        <span>Les bonnes questions, avant les grandes décisions.</span>
        <span>Fondations · v0.1</span>
      </footer>
    </div>
  );
}
function FactEditor({
  fieldKey: key,
  property,
}: {
  fieldKey: FieldKey;
  property: Property;
}) {
  const fact = property.facts[key];
  const [status, setStatus] = useState<Status>(fact.status);
  return (
    <fieldset className="fact-editor">
      <legend>{fields[key]}</legend>
      <label htmlFor={key} className="sr-only">
        {fields[key]}
      </label>
      <input
        id={key}
        name={key}
        defaultValue={fact.value}
        placeholder="Non renseigné"
        inputMode={
          ["price", "area", "rooms"].includes(key) ? "decimal" : undefined
        }
        maxLength={4000}
      />
      <label htmlFor={`${key}-status`}>
        Provenance{" "}
        <span className={`status status-${status}`}>{statuses[status]}</span>
      </label>
      <select
        id={`${key}-status`}
        name={`${key}-status`}
        value={status}
        onChange={(e) => setStatus(e.target.value as Status)}
      >
        <option value="missing">Manquante</option>
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
      <label htmlFor={`${key}-source`}>
        Source ou méthode{" "}
        {status === "conflicting" && " · précisez les valeurs en désaccord"}
      </label>
      <input
        id={`${key}-source`}
        name={`${key}-source`}
        defaultValue={fact.source}
        placeholder={
          status === "listing"
            ? "URL et passage de l’annonce"
            : "Origine, hypothèse ou sources contradictoires"
        }
        maxLength={2000}
      />
    </fieldset>
  );
}
