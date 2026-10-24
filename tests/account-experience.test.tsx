import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createProperty } from "../src/domain/property";
const mock = vi.hoisted(() => ({ api: vi.fn(), persist: vi.fn() }));
vi.mock("../src/services/account", () => ({
  accountsEnabled: true,
  api: mock.api,
  persist: mock.persist,
}));
import App from "../src/App";
let stored = [createProperty("https://example.com/private")];
beforeEach(() => {
  stored = [createProperty("https://example.com/private")];
  mock.api.mockReset();
  mock.persist.mockReset();
  mock.api.mockImplementation(async (path: string) => {
    if (path === "session") return { user: { email: "alice@example.com" } };
    if (path === "properties") return { properties: structuredClone(stored) };
    if (path.startsWith("properties/")) {
      stored = [];
      return { ok: true };
    }
    return { ok: true };
  });
});
it("restores account projects after remount, confirms deletion, and clears screen on logout", async () => {
  const user = userEvent.setup();
  const first = render(<App />);
  await screen.findByText(/alice@example.com/);
  await user.click(screen.getByRole("button", { name: /Mes biens/ }));
  await user.click(screen.getByRole("button", { name: /Voir le projet/ }));
  await user.click(screen.getByRole("button", { name: "Supprimer ce bien" }));
  expect(stored).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Annuler" }));
  first.unmount();
  render(<App />);
  await screen.findByText(/alice@example.com/);
  await user.click(screen.getByRole("button", { name: /Mes biens/ }));
  await user.click(screen.getByRole("button", { name: /Voir le projet/ }));
  await user.click(screen.getByRole("button", { name: "Supprimer ce bien" }));
  await user.click(
    screen.getByRole("button", { name: "Supprimer définitivement" }),
  );
  await waitFor(() => expect(stored).toHaveLength(0));
  await user.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("heading", { name: "Reprenez votre projet." });
  expect(screen.queryByText(/alice@example.com/)).not.toBeInTheDocument();
});
it("shows sign-in only after server confirmation and never invents a successful session", async () => {
  mock.api.mockRejectedValue(new Error("Service indisponible."));
  const user = userEvent.setup();
  render(<App />);
  await screen.findByLabelText("Email");
  await user.type(screen.getByLabelText("Email"), "alice@example.com");
  await user.type(screen.getByLabelText(/Mot de passe/), "password-long-test");
  await user.click(screen.getByRole("button", { name: "Me connecter" }));
  await screen.findByText("Service indisponible.");
  expect(
    screen.queryByRole("button", { name: "Se déconnecter" }),
  ).not.toBeInTheDocument();
});
it("keeps the draft on failed save and confirms only after a successful retry", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText(/alice@example.com/);
  await user.click(screen.getByRole("button", { name: /Mes biens/ }));
  await user.click(screen.getByRole("button", { name: /Voir le projet/ }));
  await user.click(screen.getByRole("button", { name: /Compléter le bien/ }));
  await user.type(screen.getByLabelText("Nom du bien"), "Mon brouillon privé");
  await user.selectOptions(
    document.getElementById("title-status")!,
    "estimated",
  );
  await user.type(document.getElementById("title-source")!, "Mon hypothèse");
  mock.persist.mockRejectedValueOnce(new Error("Réseau interrompu."));
  await user.click(
    screen.getByRole("button", { name: "Enregistrer les modifications" }),
  );
  await screen.findByText("Réseau interrompu.");
  expect(screen.getByLabelText("Nom du bien")).toHaveValue(
    "Mon brouillon privé",
  );
  expect(
    screen.queryByText("Modifications enregistrées sur votre compte."),
  ).not.toBeInTheDocument();
  mock.persist.mockImplementation(async (p) => ({ ...p, version: 2 }));
  await user.click(
    screen.getByRole("button", { name: "Enregistrer les modifications" }),
  );
  await screen.findByText("Modifications enregistrées sur votre compte.");
  expect(mock.persist).toHaveBeenCalledTimes(2);
});
it("restores the private project photo from the saved reference", async () => {
  stored[0].photoRef = {
    name: "44444444-4444-4444-8444-444444444444.jpg",
    originalName: "photo-test.jpg",
    providedAt: new Date().toISOString(),
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText(/alice@example.com/);
  await user.click(screen.getByRole("button", { name: /Mes biens/ }));
  expect(
    screen.getByAltText("Photo fournie pour ce projet, non vérifiée"),
  ).toHaveAttribute(
    "src",
    "/api/photos/" + stored[0].id + "/" + stored[0].photoRef.name,
  );
});
