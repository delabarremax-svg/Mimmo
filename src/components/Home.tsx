import {
  ArrowUpRight,
  ShieldCheck,
  Search,
  House,
  Link as LinkIcon,
  FileText,
  Layers,
  ChevronRight,
} from "lucide-react";
export default function Home({
  navigate,
  hasProjects,
}: {
  navigate: (page: "import" | "list") => void;
  hasProjects: boolean;
}) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-dot" /> INVESTIR AVEC LES BONNES INFORMATIONS
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
            Un investissement se prépare au-delà des belles photos. Rassemble
            les faits, identifie les informations manquantes et avance avec plus
            de clarté.
          </p>
          <button className="primary" onClick={() => navigate("import")}>
            {hasProjects
              ? "Ajouter une nouvelle piste"
              : "Ajouter mon premier bien"}{" "}
            <ArrowUpRight size={19} />
          </button>
          {hasProjects && (
            <button className="text-action" onClick={() => navigate("list")}>
              Reprendre mes projets <ChevronRight size={16} />
            </button>
          )}
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
              <span className="signal" /> Chaque information a une origine.
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
  );
}
