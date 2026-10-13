import { it, expect, describe } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import { createProperty } from "../src/domain/property";
import { projectSummary } from "../src/domain/project-summary";
import { validatePhoto } from "../src/domain/photo";
async function start() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    screen.getByRole("button", { name: "Ajouter mon premier bien" }),
  );
  await user.type(
    screen.getByLabelText("URL de l’annonce"),
    "https://example.com/annonce",
  );
  await user.click(screen.getByRole("button", { name: /Créer la fiche/ }));
  return user;
}
async function fill(
  user: ReturnType<typeof userEvent.setup>,
  key: string,
  value: string,
  status = "estimated",
  source = "Hypothèse personnelle",
) {
  await user.type(document.getElementById(key)!, value);
  await user.selectOptions(document.getElementById(`${key}-status`)!, status);
  await user.type(document.getElementById(`${key}-source`)!, source);
}
it("conserve le brouillon entre étapes, sauvegarde les étapes séparément et compte les champs réels", async () => {
  const user = await start();
  expect(screen.getByText("0 sur 6 champs renseignés")).toBeVisible();
  await fill(user, "title", "Ma piste");
  await user.click(screen.getByRole("button", { name: /Étape suivante/ }));
  expect(screen.queryByLabelText("Nom du bien")).not.toBeInTheDocument();
  await fill(user, "area", "42,5", "listing", "Annonce, passage surface");
  await user.click(
    screen.getByRole("button", { name: /Enregistrer les modifications/ }),
  );
  expect(screen.getByText("1 sur 6 champs renseignés")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Étape précédente/ }));
  expect(screen.getByLabelText("Nom du bien")).toHaveValue("Ma piste");
  await user.click(
    screen.getByRole("button", { name: /Enregistrer les modifications/ }),
  );
  expect(screen.getByText("2 sur 6 champs renseignés")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Vue d’ensemble" }));
  expect(
    screen.getByText(/Aucune information vérifiée par document/),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: /Renseigner : Ville/ }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Aucun score, rendement ou résultat d’analyse n’est calculé actuellement.",
    ),
  ).toBeVisible();
});
it("avertit avant d’abandonner un brouillon et permet de continuer la saisie", async () => {
  const user = await start();
  await user.type(screen.getByLabelText("Nom du bien"), "Brouillon");
  await user.click(screen.getAllByRole("button", { name: /Mes biens/ })[0]);
  const dialog = screen.getByRole("dialog", {
    name: "Modifications non enregistrées",
  });
  await user.click(
    within(dialog).getByRole("button", { name: "Continuer la saisie" }),
  );
  expect(screen.getByLabelText("Nom du bien")).toHaveValue("Brouillon");
  await user.click(screen.getAllByRole("button", { name: /Mes biens/ })[0]);
  await user.click(
    screen.getByRole("button", { name: "Quitter sans enregistrer" }),
  );
  expect(
    screen.getByRole("heading", { name: "Bien à compléter" }),
  ).toBeVisible();
});
it("affiche les contradictions saisies et filtre les projets sans inventer d’alertes", async () => {
  const user = await start();
  await fill(
    user,
    "price",
    "150000",
    "conflicting",
    "Annonce : 150000 €, message vendeur : 155000 €",
  );
  await user.click(
    screen.getByRole("button", { name: /Enregistrer les modifications/ }),
  );
  await user.click(screen.getByRole("button", { name: "Vue d’ensemble" }));
  expect(screen.getByText("1 information contradictoire")).toBeVisible();
  expect(
    screen.getByRole("button", { name: /Clarifier : Prix/ }),
  ).toBeVisible();
  await user.click(screen.getAllByRole("button", { name: /Mes biens/ })[0]);
  await user.click(screen.getByRole("button", { name: "Contradictions" }));
  expect(
    screen.getByRole("heading", { name: "Bien à compléter" }),
  ).toBeVisible();
  await user.type(
    screen.getByRole("searchbox", { name: "Rechercher un bien" }),
    "inexistant",
  );
  expect(
    screen.getByRole("heading", { name: "Aucun projet ne correspond." }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Réinitialiser les filtres" }),
  );
  expect(
    screen.getByRole("heading", { name: "Bien à compléter" }),
  ).toBeVisible();
});
describe("synthèse et photos", () => {
  it("un nouveau projet ne contient aucun fait ni résultat inventé", () => {
    expect(
      projectSummary(createProperty("https://example.com/annonce")),
    ).toMatchObject({
      known: 0,
      verified: 0,
      conflicts: [],
      missingEssentials: ["title", "city", "price"],
    });
  });
  it.each([
    ["text/html", "danger.html"],
    ["image/svg+xml", "vector.svg"],
    ["image/heic", "photo.heic"],
  ])("refuse le format %s", (type, name) => {
    expect(() => validatePhoto(new File(["a"], name, { type }))).toThrow();
  });
  it("refuse une photo trop lourde", () => {
    expect(() =>
      validatePhoto(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).toThrow("10 Mo");
  });
  it("accepte un fichier JPEG dans la limite sans prétendre le vérifier", () => {
    expect(() =>
      validatePhoto(new File(["jpeg"], "photo.jpg", { type: "image/jpeg" })),
    ).not.toThrow();
  });
});
