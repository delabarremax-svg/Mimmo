/** Read-only inspection of existing previews. Never creates an account or writes a project. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("Secret de démonstration absent du runner.");
const auth = "Basic " + Buffer.from("mimmo:" + password).toString("base64");
const report = {
  checkedAt: new Date().toISOString(),
  checks: [],
  blockers: [],
};
const sites = [
  "mimmo-demo-privee",
  "mimmo-demo-ux",
  "mimmo-v1-privee",
  "mimmo-v1-comptes-privee",
];
async function get(url, headers = {}) {
  return fetch(url, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
}
for (const name of sites) {
  const base = `https://${name}.delabarre-max.workers.dev`;
  try {
    const denied = await get(base),
      allowed = await get(base, { Authorization: auth });
    const html = await allowed.text();
    const js = html.match(/<script[^>]+src="([^"]+)"/);
    const protectedAsset = js ? await get(new URL(js[1], base)) : null;
    const authorizedAsset = js
      ? await get(new URL(js[1], base), { Authorization: auth })
      : null;
    const ok =
      denied.status === 401 &&
      allowed.status === 200 &&
      protectedAsset?.status === 401 &&
      authorizedAsset?.status === 200;
    report.checks.push({
      name,
      anonymous: denied.status,
      authenticated: allowed.status,
      assetAnonymous: protectedAsset?.status,
      assetAuthenticated: authorizedAsset?.status,
      ok,
    });
    if (!ok)
      report.blockers.push(`Protection ou disponibilité à examiner : ${name}`);
    if (name === "mimmo-v1-comptes-privee") {
      const session = await get(base + "/api/session", { Authorization: auth });
      const payload = await session.json();
      const ok = session.status === 401 && payload.user === null;
      report.checks.push({
        name: "accounts-no-session",
        status: session.status,
        ok,
      });
      if (!ok)
        report.blockers.push(
          "API comptes indisponible ou session anonyme inattendue",
        );
    }
  } catch {
    report.blockers.push(`Inspection distante impossible : ${name}`);
  }
}
const config = JSON.parse(
  await readFile("deploy/wrangler-v1-accounts.json", "utf8"),
);
if (config.vars.SUPABASE_URL !== "https://nfhkfjtyfojiwajvbukk.supabase.co")
  throw new Error("Projet inattendu");
try {
  const headers = { apikey: config.vars.SUPABASE_PUBLISHABLE_KEY };
  const settingsResponse = await get(
    config.vars.SUPABASE_URL + "/auth/v1/settings",
    headers,
  );
  const settings = await settingsResponse.json();
  // Only public flags; never persist email addresses, keys, tokens or response bodies.
  report.checks.push({
    name: "supabase-public-auth-settings",
    status: settingsResponse.status,
    emailEnabled: settings.external?.email,
    signupDisabled: settings.disable_signup,
    emailAutoconfirm: settings.mailer_autoconfirm,
    ok: settingsResponse.status === 200,
  });
  if (
    settingsResponse.status !== 200 ||
    settings.disable_signup ||
    settings.mailer_autoconfirm ||
    !settings.external?.email
  )
    report.blockers.push("Réglages publics Auth à examiner");
  const anon = await get(
    config.vars.SUPABASE_URL + "/rest/v1/private_projects?select=id&limit=1",
    headers,
  );
  let visible = null;
  if (anon.ok) {
    const result = await anon.json();
    visible = Array.isArray(result) ? result.length : null;
  }
  const ok =
    anon.status === 401 ||
    anon.status === 403 ||
    (anon.status === 200 && visible === 0);
  report.checks.push({
    name: "anonymous-project-access",
    status: anon.status,
    visibleRows: visible,
    ok,
  });
  if (!ok)
    report.blockers.push("Accès anonyme aux projets à examiner immédiatement");
} catch {
  report.blockers.push("Inspection publique Supabase impossible");
}
await mkdir("work", { recursive: true });
await writeFile("work/live-v1-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.blockers.length) process.exitCode = 1;
