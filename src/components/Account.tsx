import { useState } from "react";
import { api } from "../services/account";
export default function Account({
  onConnected,
}: {
  onConnected: (email: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "recover">(
    () =>
      new URLSearchParams(location.search).get("recovery") === "1"
        ? "recover"
        : "login",
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const title = {
    login: "Reprenez votre projet.",
    signup: "Créons votre compte.",
    forgot: "Retrouvons votre accès.",
    recover: "Choisissez un nouveau mot de passe.",
  }[mode];
  return (
    <section className="narrow">
      <span className="eyebrow">VOTRE ESPACE PRIVÉ</span>
      <h1>{title}</h1>
      <p>Vos biens, vos sources et vos notes vous attendront à votre retour.</p>
      <form
        className="panel investment-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setMessage("");
          try {
            if (mode === "forgot") {
              await api("reset-password", "POST", { email: data.get("email") });
              setMessage(
                "Si ce compte existe, un email de récupération a été demandé. Vérifiez aussi les indésirables.",
              );
            } else if (mode === "recover") {
              const result = await api<{ warning?: string }>(
                "update-password",
                "POST",
                {
                  password: data.get("password"),
                },
              );
              history.replaceState(null, "", location.pathname);
              setMode("login");
              setMessage(
                result.warning || "Mot de passe modifié. Reconnectez-vous.",
              );
            } else {
              const result = await api<{
                user: { email: string } | null;
                confirmation: boolean;
              }>(mode === "signup" ? "signup" : "login", "POST", {
                email: data.get("email"),
                password: data.get("password"),
              });
              if (result.user) await onConnected(result.user.email);
              else {
                setMode("login");
                setMessage(
                  "Vérifiez votre boîte email pour confirmer votre compte, puis connectez-vous ici.",
                );
              }
            }
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Connexion impossible.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode !== "recover" && (
          <label htmlFor="email">
            Email
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label htmlFor="password">
            Mot de passe · 12 caractères minimum
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={12}
              maxLength={128}
              required
            />
          </label>
        )}
        {message && <p role="status">{message}</p>}
        <button className="primary" disabled={busy}>
          {busy
            ? "Veuillez patienter…"
            : {
                login: "Me connecter",
                signup: "Créer mon compte",
                forgot: "Recevoir le lien de récupération",
                recover: "Enregistrer le nouveau mot de passe",
              }[mode]}
        </button>
        {mode === "login" && (
          <button
            type="button"
            className="back"
            disabled={busy}
            onClick={() => {
              setMode("forgot");
              setMessage("");
            }}
          >
            Mot de passe oublié ?
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          className="back"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
          }}
        >
          {mode === "login" ? "Créer un compte" : "J’ai déjà un compte"}
        </button>
      </form>
    </section>
  );
}
