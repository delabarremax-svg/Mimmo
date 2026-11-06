import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { blankReport } from "../src/domain/listing-import";
const mock = vi.hoisted(() => ({ api: vi.fn(), readDocument: vi.fn() }));
vi.mock("../src/services/account", () => ({
  accountsEnabled: true,
  api: mock.api,
}));
vi.mock("../src/services/read-document", () => ({
  readDocument: mock.readDocument,
}));
import ListingImport from "../src/components/ListingImport";
const url = "https://www.leboncoin.fr/ad/ventes_immobilieres/123";
beforeEach(() => {
  mock.readDocument.mockReset();
  mock.readDocument.mockResolvedValue([
    {
      page: 3,
      text: "Appartement FICTIF OCR\nVille : Lille\nPrix 155000 €\nSurface 51 m²\n3 pièces\nDPE : D\nCharges : 90 € / mois",
      method: "ocr",
      confidence: 89,
    },
  ]);
  mock.api.mockReset();
  mock.api.mockImplementation(async (_path, _method, { url }) => ({
    ...blankReport(url),
    outcome: "authorization_required",
    message: "Source sans autorisation de lecture.",
    code: "authorization_required",
  }));
});
afterEach(() => vi.restoreAllMocks());
async function start(save = vi.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  render(<ListingImport onSave={save} onCancel={vi.fn()} onDirty={vi.fn()} />);
  await user.type(screen.getByLabelText("URL de l’annonce"), url);
  await user.click(screen.getByRole("button", { name: "Lire l’annonce" }));
  await screen.findByText("Source sans autorisation de lecture.");
  return { user, save };
}
it("automatically opens the fallback on a portal restriction, shows unknowns, and saves nothing during import", async () => {
  const { save } = await start();
  expect(
    screen.getByText("Aucune lecture distante de l’annonce effectuée.", {
      exact: false,
    }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Texte copié de l’annonce")).toBeVisible();
  expect(screen.getAllByText("Manquante")).toHaveLength(8);
  expect(save).not.toHaveBeenCalled();
});
it("previews copied facts, allows correction, and only then commits to the private save handler", async () => {
  const { user, save } = await start();
  await user.type(
    screen.getByLabelText("Texte copié de l’annonce"),
    "Appartement FICTIF TEST\nVille : Lille\nPrix 155000 €\n51 m²\n3 pièces\nDPE : D\nCharges : 90 € / mois",
  );
  await user.click(
    screen.getByRole("button", { name: "Extraire de ce texte" }),
  );
  expect(screen.getByLabelText("Prix (€)")).toHaveValue("155000");
  expect(save).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Surface (m²)"));
  await user.type(screen.getByLabelText("Surface (m²)"), "50");
  await user.click(
    screen.getByRole("button", { name: "Enregistrer dans mes biens" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const p = save.mock.calls[0][0];
  expect(p.facts.price).toMatchObject({ value: "155000", status: "listing" });
  expect(p.facts.area).toMatchObject({ value: "50", status: "estimated" });
  expect(
    p.listingImport.evidence.some(
      (e: any) => e.field === "area" && e.value === "51",
    ),
  ).toBe(true);
  expect(p.investment.observations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "DPE", value: "D" }),
      expect.objectContaining({
        label: "Charges",
        value: "Charges : 90 € / mois",
      }),
    ]),
  );
});
it("automatically prefills OCR fields with filename and page, without claiming verification", async () => {
  const { user, save } = await start();
  await user.upload(
    screen.getByLabelText("Lire un PDF ou une capture"),
    new File(["synthetic"], "annonce-test.png", { type: "image/png" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Prix (€)")).toHaveValue("155000"),
  );
  expect(screen.getByLabelText("DPE")).toHaveValue("D");
  await user.click(
    screen.getByRole("button", { name: "Enregistrer dans mes biens" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].facts.price.source).toContain(
    "annonce-test.png · page 3",
  );
  expect(save.mock.calls[0][0].facts.price.status).toBe("listing");
});
it("preserves relecture on failed save and lets the owner retry", async () => {
  const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connexion interrompue"))
      .mockResolvedValue(undefined),
    { user } = await start(save);
  await user.type(screen.getByLabelText("Titre"), "FICTIF À conserver");
  await user.click(
    screen.getByRole("button", { name: "Enregistrer dans mes biens" }),
  );
  await screen.findByText("Connexion interrompue");
  expect(screen.getByLabelText("Titre")).toHaveValue("FICTIF À conserver");
  await user.click(
    screen.getByRole("button", { name: "Enregistrer dans mes biens" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});
it("keeps contradictory prices visible and records their provenance even when choosing one", async () => {
  const { user, save } = await start();
  await user.type(
    screen.getByLabelText("Texte copié de l’annonce"),
    "Prix 155000 € ; ancien prix 160000 €",
  );
  await user.click(
    screen.getByRole("button", { name: "Extraire de ce texte" }),
  );
  expect(screen.getByText("Contradiction à examiner")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Utiliser 160000" }));
  await user.click(
    screen.getByRole("button", { name: "Enregistrer dans mes biens" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].facts.price).toMatchObject({
    value: "160000",
    status: "conflicting",
  });
});
it("clears previous-source evidence when switching URLs", async () => {
  const { user, save } = await start();
  await user.type(screen.getByLabelText("Titre"), "FICTIF ancien");
  await user.type(screen.getByLabelText("URL de l’annonce"), "4");
  expect(screen.queryByLabelText("Titre")).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

it("does not insert stale OCR from a previous URL after changing the source", async () => {
  let finish: (value: unknown) => void = () => {};
  mock.readDocument.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = await start();
  await user.upload(
    screen.getByLabelText("Lire un PDF ou une capture"),
    new File(["synthetic"], "ancienne.png", { type: "image/png" }),
  );
  await user.type(screen.getByLabelText("URL de l’annonce"), "9");
  await user.click(screen.getByRole("button", { name: "Lire l’annonce" }));
  await screen.findByText("Source sans autorisation de lecture.");
  finish([{ page: 1, text: "Prix 999999 €", method: "ocr" }]);
  await waitFor(() =>
    expect(screen.getByLabelText("Prix (€)")).toHaveValue(""),
  );
});
