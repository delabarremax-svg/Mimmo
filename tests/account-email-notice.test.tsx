import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/services/account", () => ({ api: mock.api }));
import Account from "../src/components/Account";
beforeEach(() => {
  mock.api.mockReset();
  history.replaceState(null, "", "/?auth_notice=email_confirmed");
});
afterEach(() => history.replaceState(null, "", "/"));
it("shows confirmation then clears the callback notice on login so reload can restore the saved account", async () => {
  const user = userEvent.setup(),
    connected = vi.fn().mockResolvedValue(undefined);
  mock.api.mockResolvedValue({
    user: { email: "owner@example.com" },
    confirmation: false,
  });
  render(<Account onConnected={connected} />);
  expect(
    screen.getByText("Email confirmé. Connectez-vous avec votre mot de passe."),
  ).toBeInTheDocument();
  await user.type(screen.getByLabelText("Email"), "owner@example.com");
  await user.type(
    screen.getByLabelText(/Mot de passe/),
    "synthetic-password-long",
  );
  await user.click(screen.getByRole("button", { name: "Me connecter" }));
  await waitFor(() =>
    expect(connected).toHaveBeenCalledWith("owner@example.com"),
  );
  expect(location.search).toBe("");
});
it("shows actionable same-browser recovery guidance without rendering provider text or tokens", () => {
  history.replaceState(
    null,
    "",
    "/?auth_notice=email_link_invalid&error_description=untrusted-provider-text",
  );
  render(<Account onConnected={vi.fn()} />);
  expect(
    screen.getByText(/Lien expiré ou ouvert dans un autre navigateur/),
  ).toBeInTheDocument();
  expect(screen.queryByText("untrusted-provider-text")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Mot de passe oublié ?" }),
  ).toBeInTheDocument();
});
