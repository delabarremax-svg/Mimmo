import { z } from "zod";
import { extractJsonLd } from "../src/domain/extraction";
import {
  blankReport,
  evidenceSchema,
  photoLinkSchema,
  uniqueEvidence,
  type ImportReport,
  type ImportEvidence,
} from "../src/domain/listing-import";
import { parseListingHtml } from "./listing-parser";
/** Server-owned registry: never supplied by the user's request body. No connector is active by default. */
export interface AuthorizedListingProvider {
  id: string;
  hosts: readonly string[];
  read(
    url: string,
    signal: AbortSignal,
  ): Promise<{ evidence: ImportEvidence[]; photos: ImportReport["photos"] }>;
}
const providerOutput = z
  .object({
    evidence: z.array(evidenceSchema).max(32),
    photos: z.array(photoLinkSchema).max(6),
  })
  .strict();
export class ListingAccessError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function authorizedUrl(raw: string, authorizedHosts: string[] | string) {
  const u = new URL(raw),
    hosts =
      typeof authorizedHosts === "string"
        ? authorizedHosts
            .split(",")
            .map((h) => h.trim().toLowerCase())
            .filter(Boolean)
        : authorizedHosts;
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    /^(localhost|\d|\[)/i.test(u.hostname) ||
    !u.hostname.includes(".") ||
    u.hostname.endsWith(".") ||
    /\.(?:local|internal|localhost|onion)$/i.test(u.hostname)
  )
    throw new ListingAccessError(
      "unsafe_url",
      "Lecture distante refusée pour cette adresse. Utilisez le texte ou une capture.",
    );
  if (!hosts.includes(u.hostname))
    throw new ListingAccessError(
      "authorization_required",
      "Cette source n’a pas d’autorisation de lecture configurée. Ajoutez une capture, un PDF ou le texte auquel vous avez accès.",
    );
  return u;
}
export function robotsAllows(robots: string, target: URL) {
  const groups: {
    agents: string[];
    rules: { allow: boolean; path: string }[];
  }[] = [];
  let group = {
    agents: [] as string[],
    rules: [] as { allow: boolean; path: string }[],
  };
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim(),
      m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    if (m[1].toLowerCase() === "user-agent") {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(m[2].toLowerCase());
    } else if (
      ["allow", "disallow"].includes(m[1].toLowerCase()) &&
      group.agents.length &&
      m[2]
    )
      group.rules.push({ allow: m[1].toLowerCase() === "allow", path: m[2] });
  }
  groups.push(group);
  const specific = groups.filter((g) =>
      g.agents.some((a) => a !== "*" && "mimmo".includes(a)),
    ),
    chosen = specific.length
      ? specific
      : groups.filter((g) => g.agents.includes("*"));
  const path = target.pathname + target.search;
  let best: { allow: boolean; weight: number } | undefined;
  for (const g of chosen)
    for (const rule of g.rules) {
      const end = rule.path.endsWith("$"),
        raw = end ? rule.path.slice(0, -1) : rule.path;
      const pattern =
        "^" +
        raw
          .split("*")
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*") +
        (end ? "$" : "");
      if (new RegExp(pattern).test(path)) {
        const weight = raw.replace(/\*/g, "").length;
        if (
          !best ||
          weight > best.weight ||
          (weight === best.weight && rule.allow)
        )
          best = { allow: rule.allow, weight };
      }
    }
  return best?.allow ?? true;
}
async function readResponse(r: Response, limit: number, robots = false) {
  if (robots && r.status === 404) return "";
  if (!r.ok)
    throw new ListingAccessError(
      [401, 403, 429].includes(r.status) ? "access_blocked" : "unavailable",
      "Source inaccessible ou accès refusé. Utilisez une capture, un PDF ou le texte.",
    );
  if (
    !robots &&
    !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(
      r.headers.get("Content-Type") || "text/html",
    )
  )
    throw new ListingAccessError(
      "unsupported_content",
      "Ce lien ne contient pas une page d’annonce HTML. Ajoutez le document directement.",
    );
  const reader = r.body?.getReader();
  if (!reader) throw new ListingAccessError("unavailable", "Contenu absent.");
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new ListingAccessError(
          "too_large",
          "Contenu trop volumineux. Utilisez un extrait ou une capture.",
        );
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return text + decoder.decode();
}
async function read(url: string, limit: number, robots = false) {
  const r = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Mimmo/1.0 (authorized listing import)",
      Accept: robots ? "text/plain" : "text/html,application/xhtml+xml",
    },
  });
  return readResponse(r, limit, robots);
}

async function readAuthorizedHtml(raw: string, hosts: string[] | string) {
  const u = authorizedUrl(raw, hosts),
    robots = await read(u.origin + "/robots.txt", 64000, true);
  if (/<html|<!doctype/i.test(robots) || !robotsAllows(robots, u))
    throw new ListingAccessError(
      "robots_denied",
      "Collecte refusée par les règles du site. Utilisez un extrait fourni par vous.",
    );
  const html = await read(u.href, 1000000);
  if (
    /cf-chl-|challenge-platform|<title[^>]*>[^<]*(?:captcha|access denied|just a moment|accès refusé)/i.test(
      html,
    )
  )
    throw new ListingAccessError(
      "access_blocked",
      "Le site protège son accès. Ajoutez une capture ou du texte ; aucune protection n’est contournée.",
    );
  return html;
}
/** Existing API contract kept for dossier-level extraction. */
export async function extractAuthorizedListing(
  raw: string,
  authorizedHosts: string[] | string,
) {
  const html = await readAuthorizedHtml(raw, authorizedHosts),
    scripts = [
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
    throw new ListingAccessError(
      "no_data",
      "Aucune information structurée exploitable. Collez le texte ou complétez la fiche.",
    );
  return candidates;
}
export async function importListing(
  raw: string,
  hosts: string[] | string,
  own?: {
    origin: string;
    assets: { fetch(request: Request): Promise<Response> };
    providers?: readonly AuthorizedListingProvider[];
  },
): Promise<ImportReport> {
  const report = blankReport(raw);
  try {
    const u = new URL(raw);
    const ownedExample =
      own &&
      u.origin === own.origin &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      [
        "/import-examples/appartement-fictif.html",
        "/import-examples/maison-fictive.html",
      ].includes(u.pathname);
    const provider = own?.providers?.find((p) => p.hosts.includes(u.hostname));
    let parsed: ReturnType<typeof parseListingHtml>;
    if (provider) {
      authorizedUrl(raw, [...provider.hosts]);
      report.attempted = true;
      const result = providerOutput.parse(
        await provider.read(raw, AbortSignal.timeout(8000)),
      );
      parsed = {
        evidence: uniqueEvidence(
          result.evidence.map((e) => ({
            ...e,
            method: "partner",
            source: raw.slice(0, 500),
          })),
        ),
        photos: result.photos,
        multipleListings: false,
      };
    } else if (ownedExample) {
      report.platform = "Exemple MIMMO fictif";
      report.attempted = true;
      const html = await readResponse(
        await own.assets.fetch(new Request(own.origin + u.pathname)),
        1000000,
      );
      parsed = parseListingHtml(html, raw);
    } else {
      authorizedUrl(raw, hosts);
      report.attempted = true;
      parsed = parseListingHtml(await readAuthorizedHtml(raw, hosts), raw);
    }
    report.evidence = parsed.evidence;
    report.photos = parsed.photos;
    const count = new Set(parsed.evidence.map((e) => e.field)).size;
    report.outcome = count >= 6 ? "extracted" : "partial";
    report.code = count ? "read" : "no_data";
    report.message = parsed.multipleListings
      ? "Plusieurs objets immobiliers apparaissent dans la page. Vérifiez à quel bien chaque valeur appartient."
      : count
        ? "Informations publiques relevées. Relisez les valeurs avant sauvegarde."
        : "La page ne fournit pas d’informations exploitables. Ajoutez une capture, un PDF ou du texte.";
    if (report.platform === "Exemple MIMMO fictif")
      report.message =
        "Annonce fictive de test MIMMO, lecture automatisée autorisée. Aucun bien réel proposé à la vente.";
  } catch (e) {
    const error = e instanceof ListingAccessError ? e : undefined;
    report.code = error?.code || "unavailable";
    report.outcome =
      report.code === "authorization_required"
        ? "authorization_required"
        : ["robots_denied", "access_blocked", "unsafe_url"].includes(
              report.code,
            )
          ? "blocked"
          : "unavailable";
    report.message =
      error?.message ||
      "Lecture impossible (réseau, délai ou redirection). Utilisez une capture, un PDF ou du texte.";
  }
  return report;
}
