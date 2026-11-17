import { z } from "zod";
import { hasConflict, canonicalValue } from "../src/domain/capture-analysis";
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
        : authorizedHosts.map((h) => h.trim().toLowerCase());
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
  let directives = false;
  let group = {
    agents: [] as string[],
    rules: [] as { allow: boolean; path: string }[],
  };
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim(),
      m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    if (m[1].toLowerCase() === "user-agent") {
      if (directives) {
        groups.push(group);
        directives = false;
        group = { agents: [], rules: [] };
      }
      group.agents.push(m[2].toLowerCase());
    } else if (
      ["allow", "disallow"].includes(m[1].toLowerCase()) &&
      group.agents.length &&
      m[2]
    ) {
      directives = true;
      group.rules.push({ allow: m[1].toLowerCase() === "allow", path: m[2] });
    } else if (
      group.agents.length &&
      ["allow", "disallow"].includes(m[1].toLowerCase())
    )
      directives = true;
  }
  groups.push(group);
  const specificity = (agents: string[]) =>
    Math.max(
      0,
      ...agents
        .filter((a) => a !== "*" && a && "mimmo".includes(a))
        .map((a) => a.length),
    );
  const longest = Math.max(0, ...groups.map((g) => specificity(g.agents)));
  const chosen = longest
    ? groups.filter((g) => specificity(g.agents) === longest)
    : groups.filter((g) => g.agents.includes("*"));
  const octets = (s: string) =>
    s
      .replace(/[^\x21-\x7e]/gu, (c) => encodeURIComponent(c))
      .replace(/%([0-9a-f]{2})/gi, (_, h: string) => {
        const c = String.fromCharCode(parseInt(h, 16));
        return /[A-Za-z0-9._~-]/.test(c) ? c : "%" + h.toUpperCase();
      });
  const path = octets(target.pathname + target.search);
  let best: { allow: boolean; weight: number } | undefined;
  for (const g of chosen)
    for (const rule of g.rules) {
      const end = rule.path.endsWith("$"),
        raw = end ? rule.path.slice(0, -1) : rule.path;
      const normalized = octets(raw),
        parts = normalized.split("*");
      let cursor = parts[0].length,
        matched = path.startsWith(parts[0]);
      for (let i = 1; matched && i < parts.length; i++) {
        const part = parts[i];
        const at =
          end && i === parts.length - 1 && part
            ? path.length - part.length
            : path.indexOf(part, cursor);
        if (at < cursor || path.slice(at, at + part.length) !== part)
          matched = false;
        else cursor = at + part.length;
      }
      if (end && parts.length === 1 && cursor !== path.length) matched = false;
      if (matched) {
        const weight = normalized
          .replace(/%[0-9A-F]{2}/g, "x")
          .replace(/\*/g, "").length;
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
      [401, 403, 429].includes(r.status)
        ? "access_blocked"
        : r.status === 404
          ? "not_found"
          : r.status >= 500
            ? "source_unavailable"
            : "unavailable",
      r.status === 404
        ? "Annonce ou ressource introuvable (404)."
        : "Source inaccessible ou accès refusé. Utilisez une capture, un PDF ou le texte.",
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
const redirects = new Set([301, 302, 303, 307, 308]);
async function requestPage(url: URL, signal: AbortSignal, robots = false) {
  try {
    return await fetch(url.href, {
      redirect: "manual",
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        "User-Agent": "Mimmo/1.0 (authorized listing import)",
        Accept: robots ? "text/plain" : "text/html,application/xhtml+xml",
      },
    });
  } catch {
    throw new ListingAccessError(
      signal.aborted ? "timeout" : "network_error",
      signal.aborted
        ? "Le délai maximal de lecture est dépassé."
        : "La connexion au site n’a pas abouti.",
    );
  }
}

async function redirected(
  response: Response,
  current: URL,
  hosts: string[] | string,
) {
  await response.body?.cancel();
  const location = response.headers.get("Location");
  if (!location)
    throw new ListingAccessError(
      "invalid_redirect",
      "Redirection sans destination exploitable.",
    );
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    throw new ListingAccessError(
      "invalid_redirect",
      "Adresse de redirection invalide.",
    );
  }
  try {
    return authorizedUrl(next.href, hosts);
  } catch (e) {
    if (e instanceof ListingAccessError && e.code === "authorization_required")
      throw new ListingAccessError(
        "redirect_not_authorized",
        "La redirection vise une source non autorisée. Aucun accès à cette destination.",
      );
    throw e;
  }
}
async function readAuthorizedHtml(raw: string, hosts: string[] | string) {
  let target = authorizedUrl(raw, hosts);
  const signal = AbortSignal.timeout(15000),
    policies = new Map<string, string>();
  async function checkedBody(r: Response, limit: number, robots = false) {
    try {
      return await readResponse(r, limit, robots);
    } catch (e) {
      if (signal.aborted && !(e instanceof ListingAccessError))
        throw new ListingAccessError(
          "timeout",
          "Le délai maximal de lecture est dépassé.",
        );
      throw e;
    }
  }
  async function policy(origin: string) {
    if (policies.has(origin)) return policies.get(origin)!;
    let u = new URL("/robots.txt", origin);
    const seen = new Set<string>();
    for (let step = 0; step <= 3; step++) {
      if (seen.has(u.href))
        throw new ListingAccessError(
          "redirect_loop",
          "Boucle de redirection des règles du site.",
        );
      seen.add(u.href);
      const response = await requestPage(u, signal, true);
      if (redirects.has(response.status)) {
        const next = await redirected(response, u, hosts);
        if (step === 3)
          throw new ListingAccessError(
            "redirect_limit",
            "Trop de redirections des règles du site.",
          );
        u = next;
        continue;
      }
      const raw = await checkedBody(response, 64000, true);
      if (/<html|<!doctype/i.test(raw) || /^\s*[\[{]/.test(raw))
        throw new ListingAccessError(
          "robots_unavailable",
          "Les règles du site ne sont pas disponibles sous une forme exploitable. Lecture arrêtée.",
        );
      policies.set(origin, raw);
      return raw;
    }
    throw new ListingAccessError(
      "robots_unavailable",
      "Règles du site indisponibles.",
    );
  }
  const seen = new Set<string>();
  for (let step = 0; step <= 3; step++) {
    if (seen.has(target.href))
      throw new ListingAccessError(
        "redirect_loop",
        "Boucle de redirection de l’annonce.",
      );
    seen.add(target.href);
    if (!robotsAllows(await policy(target.origin), target))
      throw new ListingAccessError(
        "robots_denied",
        "Collecte refusée par les règles du site. Utilisez un extrait fourni par vous.",
      );
    const response = await requestPage(target, signal);
    if (redirects.has(response.status)) {
      const next = await redirected(response, target, hosts);
      if (step === 3)
        throw new ListingAccessError(
          "redirect_limit",
          "Trop de redirections de l’annonce.",
        );
      target = next;
      continue;
    }
    const html = await checkedBody(response, 1000000);
    if (
      /<title[^>]*>[^<]*(?:captcha|access denied|just a moment|accès refusé)|<form[^>]+(?:id|action)=["'][^"']*(?:captcha|challenge)/i.test(
        html,
      )
    )
      throw new ListingAccessError(
        "access_blocked",
        "Le site protège son accès. Aucune protection n’est contournée.",
      );
    return { html, url: target.href };
  }
  throw new ListingAccessError("redirect_limit", "Trop de redirections.");
}
function parsePage(html: string, url: string) {
  try {
    return parseListingHtml(html, url);
  } catch {
    throw new ListingAccessError(
      "extraction_failed",
      "La page a été reçue, mais sa structure ne permet pas une extraction sûre. Aucune donnée n’est inventée.",
    );
  }
}
/** Same parser for the legacy route; its contract cannot carry uncertainty, so omit uncertain proposals. */
export async function extractAuthorizedListing(
  raw: string,
  hosts: string[] | string,
) {
  const page = await readAuthorizedHtml(raw, hosts),
    parsed = parsePage(page.html, page.url);
  const candidates = parsed.evidence
    .filter(
      (c) =>
        ["title", "city", "price", "area", "rooms", "description"].includes(
          c.field,
        ) && c.certainty !== "uncertain",
    )
    .map(({ field, value, excerpt }) => ({
      field: field as
        | "title"
        | "city"
        | "price"
        | "area"
        | "rooms"
        | "description",
      value,
      excerpt,
    }));
  if (!candidates.length)
    throw new ListingAccessError(
      parsed.multipleListings ? "ambiguous_listing" : "no_data",
      parsed.multipleListings
        ? "Le bien ciblé ne peut pas être isolé. Aucune valeur attribuée."
        : "Aucune information exploitable avec certitude. Utilisez un extrait.",
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
        transaction: "unknown",
      };
    } else if (ownedExample) {
      report.platform = "Exemple MIMMO fictif";
      report.attempted = true;
      const html = await readResponse(
        await own.assets.fetch(new Request(own.origin + u.pathname)),
        1000000,
      );
      parsed = parsePage(html, raw);
    } else {
      authorizedUrl(raw, hosts);
      report.attempted = true;
      const page = await readAuthorizedHtml(raw, hosts);
      parsed = parsePage(page.html, page.url);
    }
    report.evidence = parsed.evidence;
    report.photos = parsed.photos;
    const count = new Set(parsed.evidence.map((e) => e.field)).size;
    const required = ["price", "city", "area", "rooms", "dpe"];
    const complete = required.every((field) => {
      const proofs = parsed.evidence.filter((e) => e.field === field);
      return (
        proofs.some((e) => e.certainty !== "uncertain") &&
        new Set(
          proofs
            .filter((e) => e.certainty !== "uncertain")
            .map((e) =>
              canonicalValue(
                field as "price" | "city" | "area" | "rooms" | "dpe",
                e.value,
              ),
            ),
        ).size === 1 &&
        !hasConflict(
          field as "price" | "city" | "area" | "rooms" | "dpe",
          proofs,
        )
      );
    });
    report.outcome = complete ? "extracted" : "partial";
    report.code = parsed.multipleListings
      ? "ambiguous_listing"
      : parsed.transaction === "rent"
        ? "rental_listing"
        : parsed.transaction === "conflicting"
          ? "transaction_conflict"
          : count
            ? "read"
            : "no_data";
    report.message = parsed.multipleListings
      ? "Le bien ciblé ne peut pas être isolé. Aucune donnée d’un autre bien n’est attribuée."
      : count
        ? "Informations publiques relevées. Relisez les valeurs avant sauvegarde."
        : "La page ne fournit pas d’informations exploitables. Ajoutez une capture, un PDF ou du texte.";
    if (parsed.transaction === "rent")
      report.message =
        "Annonce de location : le loyer est distinct du prix d’achat, qui reste non renseigné.";
    if (parsed.transaction === "conflicting")
      report.message =
        "Les indications de vente et de location sont incompatibles. Les montants restent à confirmer.";
    if (report.platform === "Exemple MIMMO fictif")
      report.message =
        "Annonce fictive de test MIMMO, lecture automatisée autorisée. Aucun bien réel proposé à la vente.";
  } catch (e) {
    const error = e instanceof ListingAccessError ? e : undefined;
    report.code = error?.code || "unavailable";
    report.outcome =
      report.code === "authorization_required"
        ? "authorization_required"
        : [
              "robots_denied",
              "access_blocked",
              "unsafe_url",
              "redirect_not_authorized",
            ].includes(report.code)
          ? "blocked"
          : "unavailable";
    report.message =
      error?.message ||
      "Lecture impossible (réseau, délai ou redirection). Utilisez une capture, un PDF ou du texte.";
  }
  return report;
}
