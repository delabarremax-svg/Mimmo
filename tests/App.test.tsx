import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
it("parcours complet : URL → fiche vide → modification sourcée → Mes biens", async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  expect(screen.getByText(/disparaissent au rechargement/)).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: /Ajouter mon premier bien/ }),
  );
  expect(
    screen.getByText(/extraction automatique n’est pas encore disponible/),
  ).toBeVisible();
  await user.type(
    screen.getByLabelText("URL de l’annonce"),
    "https://example.com/annonce",
  );
  await user.click(screen.getByRole("button", { name: /Créer la fiche/ }));
  expect(
    screen.getByRole("heading", { name: "Bien à compléter" }),
  ).toBeVisible();
  await user.type(screen.getByLabelText("Nom du bien"), "Mon projet");
  await user.selectOptions(
    screen.getByLabelText(/Provenance/, { selector: "#title-status" }),
    "estimated",
  );
  await user.click(
    screen.getByRole("button", { name: /Enregistrer les modifications/ }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Précisez la source");
  await user.type(
    document.getElementById("title-source")!,
    "Nom personnel du projet",
  );
  await user.click(
    screen.getByRole("button", { name: /Enregistrer les modifications/ }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Modifications enregistrées",
  );
  await user.click(screen.getAllByRole("button", { name: /Mes biens/ })[0]);
  expect(screen.getByRole("heading", { name: "Mon projet" })).toBeVisible();
  view.unmount();
  render(<App />);
  expect(screen.getByText("0")).toBeVisible();
});
it("la mémoire ne survit pas à une nouvelle instance de l’application", () => {
  const view = render(<App />);
  view.unmount();
  render(<App />);
  expect(screen.getByText("0")).toBeVisible();
});
