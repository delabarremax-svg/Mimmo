import { it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvestmentWorkspace from "../src/components/InvestmentWorkspace";
import { createProperty } from "../src/domain/property";
import { demoProjects } from "../src/domain/demo";
it("persists a sourced observation and page in the project aggregate", async () => {
  const user = userEvent.setup(),
    save = vi.fn().mockResolvedValue(undefined),
    dirty = vi.fn();
  render(
    <InvestmentWorkspace
      property={createProperty("https://example.invalid")}
      onSave={save}
      onDirty={dirty}
    />,
  );
  await user.type(screen.getByLabelText("Point observé"), "Toiture à examiner");
  await user.type(
    screen.getByLabelText("Information relevée"),
    "Travaux votés",
  );
  await user.type(screen.getByLabelText("Document ou référence"), "PV fictif");
  await user.type(screen.getByLabelText("Page (si document)"), "4");
  await user.type(screen.getByLabelText("Extrait exact"), "Extrait test");
  await user.click(
    screen.getByRole("button", { name: "Ajouter au brouillon" }),
  );
  expect(save).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Enregistrer le dossier" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].investment.observations[0]).toMatchObject({
    label: "Toiture à examiner",
    page: 4,
    source: "PV fictif",
    status: "extracted",
  });
});
it("preserves a failed workspace save and allows retry", async () => {
  const user = userEvent.setup(),
    save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Réseau coupé"))
      .mockResolvedValue(undefined);
  render(
    <InvestmentWorkspace
      property={demoProjects()[0]}
      onSave={save}
      onDirty={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("tab", { name: "Synthèse & PDF" }));
  const field = screen.getByLabelText(
    "Votre synthèse et prochaines vérifications",
  );
  await user.clear(field);
  await user.type(field, "À vérifier avec le syndic");
  await user.click(
    screen.getByRole("button", { name: "Enregistrer le dossier" }),
  );
  await screen.findByText("Réseau coupé");
  expect(field).toHaveValue("À vérifier avec le syndic");
  await user.click(
    screen.getByRole("button", { name: "Enregistrer le dossier" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});
it("keeps dossier drafts across its tabs and shows actual finance results", async () => {
  const user = userEvent.setup();
  render(
    <InvestmentWorkspace
      property={demoProjects()[0]}
      onSave={vi.fn()}
      onDirty={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("tab", { name: "Simulation" }));
  expect(
    screen.getByText("Cash-flow mensuel avant impôts"),
  ).toBeInTheDocument();
  expect(screen.getByText(/Cash-flow prudent/)).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Travaux" }));
  expect(screen.getByText("Peinture — hypothèse fictive")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Sources & pièces" }));
  expect(screen.getByText("DPE fictif")).toBeInTheDocument();
});
it("keeps partially entered financial assumptions across tabs and saves them without invented results", async () => {
  const user = userEvent.setup(),
    save = vi.fn().mockResolvedValue(undefined);
  render(
    <InvestmentWorkspace
      property={createProperty("https://example.invalid")}
      onSave={save}
      onDirty={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("tab", { name: "Simulation" }));
  await user.type(screen.getByLabelText("Prix d’achat (€)"), "200000");
  await user.click(screen.getByRole("tab", { name: "Travaux" }));
  await user.click(screen.getByRole("tab", { name: "Simulation" }));
  expect(screen.getByLabelText("Prix d’achat (€)")).toHaveValue(200000);
  expect(
    screen.queryByText("Cash-flow mensuel avant impôts"),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Enregistrer le dossier" }),
  );
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][0].investment.financeDraft.price).toBe("200000");
  expect(save.mock.calls[0][0].investment.finance).toBeUndefined();
});
