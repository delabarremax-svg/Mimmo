import {
  Plus,
  ArrowUpRight,
  House,
  ChevronRight,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import type { Property } from "../domain/property";
import type { PropertyPhoto as Photo } from "../domain/photo";
import { projectSummary, formatFact } from "../domain/project-summary";
import PropertyPhoto from "./PropertyPhoto";
import ProvenanceBadge from "./ProvenanceBadge";
export default function PropertyList({
  properties,
  photos,
  onAdd,
  onOpen,
}: {
  properties: Property[];
  photos: Record<string, Photo>;
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "missing" | "conflicts">("all");
  const filtered = properties.filter((p) => {
    const matches = `${p.facts.title.value} ${p.facts.city.value}`
      .toLocaleLowerCase("fr")
      .includes(query.trim().toLocaleLowerCase("fr"));
    const summary = projectSummary(p);
    return (
      matches &&
      (filter === "all" ||
        (filter === "missing" && summary.missing.length > 0) ||
        (filter === "conflicts" && summary.conflicts.length > 0))
    );
  });
  return (
    <section className="content">
      <div className="section-heading">
        <div>
          <span className="eyebrow">VOTRE ESPACE DE TRAVAIL</span>
          <h1>Mes biens</h1>
          <p className="subtle">
            Retrouvez vos pistes. Faites avancer votre prochain projet.
          </p>
        </div>
        <button className="primary" onClick={onAdd}>
          <Plus size={18} />
          Ajouter un bien
        </button>
      </div>
      {properties.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">
            <House size={36} />
          </span>
          <h2>Votre prochain projet commence ici.</h2>
          <p>
            Une annonce vous intéresse ? Ajoutez son lien, puis rassemblez les
            faits à votre rythme.
          </p>
          <button className="primary" onClick={onAdd}>
            Ajouter mon premier bien <ArrowUpRight size={18} />
          </button>
        </div>
      ) : (
        <>
          <div className="list-toolbar">
            <label className="search-input">
              <Search size={18} />
              <input
                aria-label="Rechercher un bien"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom du projet ou ville"
              />
            </label>
            <div className="filter-buttons" aria-label="Filtrer les projets">
              {(
                [
                  ["all", "Tous"],
                  ["missing", "À compléter"],
                  ["conflicts", "Contradictions"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="results-count" role="status">
            {filtered.length} projet{filtered.length > 1 ? "s" : ""} affiché
            {filtered.length > 1 ? "s" : ""}
          </p>
          <div className="property-grid">
            {filtered.map((p) => {
              const summary = projectSummary(p);
              return (
                <button
                  className="property-card"
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                >
                  <PropertyPhoto compact photo={photos[p.id]} />
                  <div className="property-body">
                    <div className="card-heading">
                      <h2>{p.facts.title.value || "Bien à compléter"}</h2>
                      <ChevronRight size={18} />
                    </div>
                    <p>{p.facts.city.value || "Ville à renseigner"}</p>
                    <div className="card-price">
                      <strong>
                        {p.facts.price.value
                          ? formatFact(p, "price")
                          : "Prix à renseigner"}
                      </strong>
                      <ProvenanceBadge status={p.facts.price.status} />
                    </div>
                    <div className="card-facts">
                      <span>
                        {p.facts.area.value
                          ? formatFact(p, "area")
                          : "Surface à renseigner"}
                      </span>
                      <span>
                        {p.facts.rooms.value
                          ? formatFact(p, "rooms")
                          : "Pièces à renseigner"}
                      </span>
                    </div>
                    {summary.conflicts.length > 0 && (
                      <div className="card-warning">
                        <TriangleAlert size={14} />
                        {summary.conflicts.length} information
                        {summary.conflicts.length > 1 ? "s" : ""} contradictoire
                        {summary.conflicts.length > 1 ? "s" : ""}
                      </div>
                    )}
                    <div className="card-bottom">
                      <span>{summary.known} / 6 champs renseignés</span>
                      <span>Voir le projet</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {!filtered.length && (
            <div className="empty empty-small">
              <h2>Aucun projet ne correspond.</h2>
              <p>Essayez un autre nom ou un autre filtre.</p>
              <button
                className="secondary"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
