import { it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { extractListingText } from "../src/domain/extraction";
import InvestmentWorkspace from "../src/components/InvestmentWorkspace";
import { createProperty } from "../src/domain/property";
vi.mock("../src/services/read-document", () => ({
  readDocument: async () => [
    {
      page: 4,
      text: "Appartement 3 pièces 62,5 m². Prix 240 000 €",
      method: "ocr",
      confidence: 85,
    },
  ],
}));
it.each([
  "Loyer 850 € par mois. Charges 100 €. Honoraires 600 €.",
  "900 €/mois, taxe foncière 1200 €, travaux 20000 €.",
  "Estimation 5000 € / m²",
])(
  "does not turn rents or ancillary expenses into purchase prices: %s",
  (text) => {
    expect(extractListingText(text).filter((c) => c.field === "price")).toEqual(
      [],
    );
  },
);
it("preserves two conflicting purchase prices for review and skips expenses", () => {
  expect(
    extractListingText("Charges 100 €. Prix 240 000 €. Ancien prix 260 000 €")
      .filter((c) => c.field === "price")
      .map((c) => c.value),
  ).toEqual(["240000", "260000"]);
});
it("does not merge numbers across lines or use garden area as living area", () => {
  const r = extractListingText(
    "Référence 123\nPrix 240 000 €\nJardin de 200 m²\nSurface habitable 62,5 m²",
  );
  expect(r.filter((c) => c.field === "price").map((c) => c.value)).toEqual([
    "240000",
  ]);
  expect(r.filter((c) => c.field === "area").map((c) => c.value)).toEqual([
    "62.5",
  ]);
});
it("extracts a user-provided screenshot locally and saves the chosen fact with file and page provenance", async () => {
  const user = userEvent.setup(),
    save = vi.fn().mockResolvedValue(undefined);
  render(
    <InvestmentWorkspace
      property={createProperty("https://example.invalid/source")}
      onSave={save}
      onDirty={vi.fn()}
    />,
  );
  await user.upload(
    screen.getByLabelText("Lire un PDF ou une capture"),
    new File(["synthetic"], "capture-fictive.png", { type: "image/png" }),
  );
  await user.click(
    await screen.findByRole("button", {
      name: "Proposer les champs de cette annonce",
    }),
  );
  expect(screen.getByText("Prix demandé (€) : 240000")).toBeInTheDocument();
  await user.click(
    screen.getAllByRole("button", { name: "Intégrer ce champ" })[0],
  );
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].facts.price).toMatchObject({
    value: "240000",
    status: "listing",
  });
  expect(save.mock.calls[0][0].facts.price.source).toContain(
    "capture-fictive.png · page 4",
  );
  expect(save.mock.calls[0][0].facts.price.source).toContain("240 000 €");
});
