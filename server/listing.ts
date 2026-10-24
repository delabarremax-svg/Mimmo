import { extractJsonLd } from "../src/domain/extraction";
/** Host allowlist is an operator authorization decision, not a user-provided setting. */
export async function extractAuthorizedListing(
  raw: string,
  authorizedHosts: string[] | string,
) {
  const u = new URL(raw),
    hosts =
      typeof authorizedHosts === "string"
        ? authorizedHosts
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean)
        : authorizedHosts;
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !hosts.includes(u.hostname) ||
    /^(localhost|\d|\[)/.test(u.hostname)
  )
    throw new Error(
      "Source non autorisée pour la collecte. Collez le texte de l’annonce ou ajoutez une capture.",
    );
  async function read(url: string, limit: number) {
    const r = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mimmo/1.0 (authorized listing import)" },
    });
    if (!r.ok)
      throw new Error("Source inaccessible. Utilisez le texte ou une capture.");
    const reader = r.body?.getReader();
    if (!reader) throw new Error("Contenu absent.");
    let size = 0,
      text = "";
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Contenu trop volumineux.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }
  const robots = await read(u.origin + "/robots.txt", 64000);
  // Conservative: any matching Disallow blocks import, even if intended for another crawler.
  for (const line of robots.split("\n")) {
    const m = line.match(/^\s*disallow\s*:\s*([^#\s]+)/i);
    if (m) {
      const prefix = m[1].split("*")[0].replace(/\$$/, "");
      if (!prefix || u.pathname.startsWith(prefix))
        throw new Error(
          "Collecte refusée par les règles du site. Utilisez un extrait fourni par vous.",
        );
    }
  }
  const html = await read(u.href, 1000000);
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
    ),
  ].slice(0, 20);
  const candidates = scripts.flatMap((m) => {
    try {
      return extractJsonLd(m[1]);
    } catch {
      return [];
    }
  });
  if (!candidates.length)
    throw new Error(
      "Aucune information structurée exploitable. Collez le texte ou complétez la fiche.",
    );
  return candidates;
}
