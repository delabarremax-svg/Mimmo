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
      text: "Appartement FICTIF OCR\nVille : Lille\nPrix 155000 €\nSurface habitable 51 m²\n3 pièces\nDPE : D\nCharges : 90 € / mois",
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
    "Appartement FICTIF TEST\nVille : Lille\nPrix 155000 €\nSurface habitable 51 m²\n3 pièces\nDPE : D\nCharges : 90 € / mois",
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
        value: "90 € / mois",
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
  await user.click(screen.getByRole("button", { name: "Analyser le fichier" }));
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
it("separates an old price from the current price without creating a conflict", async () => {
  const { user, save } = await start();
  await user.type(
    screen.getByLabelText("Texte copié de l’annonce"),
    "Prix 155000 € ; ancien prix 160000 €",
  );
  await user.click(
    screen.getByRole("button", { name: "Extraire de ce texte" }),
  );
  expect(
    screen.queryByText("Contradiction à examiner"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Prix (€)")).toHaveValue("155000");
  expect(screen.getByLabelText("Ancien prix")).toHaveValue("160000");
  await user.click(
    screen.getByRole("button", { name: "Enregistrer dans mes biens" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].facts.price.status).toBe("listing");
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
  await user.click(screen.getByRole("button", { name: "Analyser le fichier" }));
  await user.type(screen.getByLabelText("URL de l’annonce"), "9");
  await user.click(screen.getByRole("button", { name: "Lire l’annonce" }));
  await screen.findByText("Source sans autorisation de lecture.");
  finish([{ page: 1, text: "Prix 999999 €", method: "ocr" }]);
  await waitFor(() =>
    expect(screen.getByLabelText("Prix (€)")).toHaveValue(""),
  );
});

it("queues 12 captures, adds/removes before reading, then analyzes once with individual provenance", async () => {
  const { user, save } = await start();
  const files = Array.from(
    { length: 12 },
    (_, i) =>
      new File(["capture" + i], `capture-${i}.png`, { type: "image/png" }),
  );
  await user.upload(screen.getByLabelText("Lire un PDF ou une capture"), files);
  expect(mock.readDocument).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Retirer capture-0.png" }),
  );
  expect(screen.getByText("11 fichiers sélectionnés")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Analyser les 11 fichiers" }),
  );
  await screen.findByText(/Lecture terminée/);
  expect(mock.readDocument).toHaveBeenCalledTimes(11);
  expect(
    screen.queryByText("Contradiction à examiner"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Prix (€)")).toHaveValue("155000");
  await user.click(
    screen.getByRole("button", { name: "Enregistrer dans mes biens" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].listingImport.transcripts.pages).toBe(11);
  const { unpackTranscripts } = await import(
    "../src/services/capture-transcripts"
  );
  const pages = await unpackTranscripts(
    save.mock.calls[0][0].listingImport.transcripts,
  );
  expect(pages.map((p) => p.source)).toEqual(files.slice(1).map((f) => f.name));
  expect(
    screen.queryByRole("button", { name: /Utiliser/ }),
  ).not.toBeInTheDocument();
});
it("leaves low-quality OCR in the confirmation section and blocks save after the queue changes", async () => {
  const { user, save } = await start();
  mock.readDocument.mockResolvedValue([
    { page: 1, text: "Prix 155000 €", method: "ocr", confidence: 30 },
  ]);
  await user.upload(
    screen.getByLabelText("Lire un PDF ou une capture"),
    new File(["x"], "floue.png", { type: "image/png" }),
  );
  await user.click(screen.getByRole("button", { name: "Analyser le fichier" }));
  await screen.findByText(/Lecture terminée/);
  expect(screen.getByLabelText("Prix (€)")).toHaveValue("");
  await user.selectOptions(
    screen.getByLabelText("Proposition pour Prix (€)"),
    "155000",
  );
  await user.upload(
    screen.getByLabelText("Lire un PDF ou une capture"),
    new File(["y"], "autre.png", { type: "image/png" }),
  );
  expect(
    screen.getByRole("button", { name: "Enregistrer dans mes biens" }),
  ).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
});
it("flags genuinely conflicting sale prices across two captures without choosing one", async () => {
  const { user } = await start();
  mock.readDocument
    .mockResolvedValueOnce([
      { page: 1, text: "Prix 155000 €", method: "ocr", confidence: 90 },
    ])
    .mockResolvedValueOnce([
      { page: 1, text: "Prix 165000 €", method: "ocr", confidence: 90 },
    ]);
  await user.upload(screen.getByLabelText("Lire un PDF ou une capture"), [
    new File(["a"], "1.png", { type: "image/png" }),
    new File(["b"], "2.png", { type: "image/png" }),
  ]);
  await user.click(
    screen.getByRole("button", { name: "Analyser les 2 fichiers" }),
  );
  await screen.findByText(/Lecture terminée/);
  expect(screen.getByLabelText("Prix (€)")).toHaveValue("");
  expect(screen.getByText("Contradiction à examiner")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Proposition pour Prix (€)"),
  ).toBeInTheDocument();
});
