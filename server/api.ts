import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { investmentSchema } from "../src/domain/investment";
import { extractAuthorizedListing } from "./listing";
import { runAnalysis } from "./analysis";
import type { EuAiEnvironment } from "./eu-ai";
import {
  fields,
  validateFact,
  validateUrl,
  type FieldKey,
} from "../src/domain/property";
export interface Environment extends EuAiEnvironment {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SESSION_KEY: string;
  LISTING_ALLOWED_HOSTS?: string;
  AUTH_LIMITER: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const cookieName = "__Host-mimmo";
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function cookie(value: string, age = 2592000) {
  return `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
}
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(value: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return base64(iv) + "." + base64(new Uint8Array(data));
}
export async function unseal(value: string, secret: string) {
  const [iv, data] = value
    .split(".")
    .map((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        await key(secret),
        data,
      ),
    ),
  );
}
const factSchema = z
  .object({
    value: z.string().max(4000),
    source: z.string().max(2000),
    status: z.enum(["missing", "estimated", "listing", "conflicting"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();
const propertySchema = z
  .object({
    photoRef: z
      .object({
        name: z.string().regex(/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/),
        originalName: z.string().max(160),
        providedAt: z.iso.datetime(),
      })
      .strict()
      .optional(),
    investment: investmentSchema.optional(),
    id: z.uuid(),
    url: z.string().max(8000),
    createdAt: z.iso.datetime(),
    version: z.number().int().nonnegative().optional(),
    facts: z
      .object(
        Object.fromEntries(
          Object.keys(fields).map((k) => [k, factSchema]),
        ) as Record<FieldKey, typeof factSchema>,
      )
      .strict(),
  })
  .strict();
export async function api(
  request: Request,
  env: Environment,
): Promise<Response> {
  if (new URL(request.url).protocol !== "https:")
    return json({ error: "HTTPS obligatoire." }, 403);
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_PUBLISHABLE_KEY ||
    !env.SESSION_KEY ||
    env.SESSION_KEY.length < 32 ||
    !env.AUTH_LIMITER
  )
    return json({ error: "Comptes non configurés." }, 503);
  const url = new URL(request.url),
    path = url.pathname;
  if (!["GET", "POST", "PUT", "DELETE"].includes(request.method))
    return json({ error: "Méthode refusée." }, 405);
  const documentUpload =
    request.method === "POST" && /^\/api\/documents\/[0-9a-f-]{36}$/.test(path);
  if (
    request.method !== "GET" &&
    (request.headers.get("Origin") !== url.origin ||
      (!documentUpload &&
        request.headers.get("Content-Type") !== "application/json"))
  )
    return json({ error: "Origine refusée." }, 403);
  if (
    Number(request.headers.get("Content-Length")) >
    (documentUpload ? 10 * 1024 * 1024 : 65536)
  )
    return json({ error: "Requête trop volumineuse." }, 413);
  const client = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
    options,
  );
  if (path === "/api/confirm" && request.method === "GET") {
    const token_hash = url.searchParams.get("token_hash");
    if (!token_hash || token_hash.length > 2048)
      return json({ error: "Lien invalide." }, 400);
    const { error } = await client.auth.verifyOtp({
      token_hash,
      type: "signup",
    });
    if (error)
      return json(
        {
          error: "Lien expiré ou déjà utilisé. Reprenez la création du compte.",
        },
        400,
      );
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  let outgoingCookie: string | undefined;
  try {
    async function body() {
      const reader = request.body?.getReader();
      if (!reader) throw new SyntaxError("Corps absent.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          throw new SyntaxError("Requête trop volumineuse.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    if (path === "/api/recover" && request.method === "GET") {
      if (
        !(
          await env.AUTH_LIMITER.limit({
            key: request.headers.get("CF-Connecting-IP") || "unknown",
          })
        ).success
      )
        return json({ error: "Trop de tentatives." }, 429);
      const token_hash = url.searchParams.get("token_hash");
      if (!token_hash || token_hash.length > 2048)
        return json({ error: "Lien invalide." }, 400);
      const { data, error } = await client.auth.verifyOtp({
        token_hash,
        type: "recovery",
      });
      if (error || !data.session)
        return json(
          { error: "Lien expiré. Demandez un nouvel email de récupération." },
          400,
        );
      const value = await seal(
        {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          until: Date.now() + 600000,
        },
        env.SESSION_KEY,
      );
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/?recovery=1",
          "Set-Cookie": `__Host-mimmo-recovery=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (path === "/api/reset-password" && request.method === "POST") {
      if (
        !(
          await env.AUTH_LIMITER.limit({
            key: request.headers.get("CF-Connecting-IP") || "unknown",
          })
        ).success
      )
        return json({ error: "Trop de tentatives." }, 429);
      const { email } = z
        .object({ email: z.email().max(254) })
        .strict()
        .parse(await body());
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: url.origin + "/api/recover",
      });
      if (error)
        return json(
          { error: "Envoi temporairement indisponible. Réessayez plus tard." },
          503,
        );
      return json({
        ok: true,
        message: "Si ce compte existe, un email de récupération a été demandé.",
      });
    }
    if (path === "/api/update-password" && request.method === "POST") {
      const raw = request.headers
        .get("Cookie")
        ?.split("; ")
        .find((c) => c.startsWith("__Host-mimmo-recovery="))
        ?.slice("__Host-mimmo-recovery=".length);
      if (!raw)
        return json(
          { error: "Demandez un nouveau lien de récupération." },
          401,
        );
      const recovery = await unseal(raw, env.SESSION_KEY);
      if (recovery.until < Date.now())
        return json({ error: "Lien expiré." }, 401);
      const { password } = z
        .object({ password: z.string().min(12).max(128) })
        .strict()
        .parse(await body());
      const { error: sessionError } = await client.auth.setSession(recovery);
      if (sessionError)
        return json({ error: "Session de récupération invalide." }, 401);
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return json({ error: "Session invalide." }, 401);
      const { error } = await client.auth.updateUser({ password });
      if (error) return json({ error: "Changement refusé. Réessayez." }, 400);
      await client.auth.signOut({ scope: "global" });
      const response = json({ ok: true });
      response.headers.append(
        "Set-Cookie",
        "__Host-mimmo-recovery=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
      );
      response.headers.append("Set-Cookie", cookie("", 0));
      return response;
    }
    if (
      ["/api/login", "/api/signup"].includes(path) &&
      request.method === "POST"
    ) {
      if (
        !(
          await env.AUTH_LIMITER.limit({
            key: request.headers.get("CF-Connecting-IP") || "unknown",
          })
        ).success
      )
        return json({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
      const credentials = z
        .object({
          email: z.email().max(254),
          password: z.string().min(12).max(128),
        })
        .strict()
        .parse(await body());
      const result =
        path === "/api/login"
          ? await client.auth.signInWithPassword(credentials)
          : await client.auth.signUp({
              ...credentials,
              options: { emailRedirectTo: url.origin + "/api/confirm" },
            });
      if (result.error)
        return json(
          {
            error:
              "Connexion impossible. Vérifiez vos identifiants, votre confirmation email ou réessayez plus tard.",
          },
          400,
        );
      if (result.data.session)
        outgoingCookie = cookie(
          await seal(
            {
              access_token: result.data.session.access_token,
              refresh_token: result.data.session.refresh_token,
              until: Date.now() + 2592000000,
            },
            env.SESSION_KEY,
          ),
        );
      const response = json({
        user: result.data.session ? { email: result.data.user?.email } : null,
        confirmation: !result.data.session,
      });
      if (outgoingCookie) response.headers.set("Set-Cookie", outgoingCookie);
      return response;
    }
    let session;
    try {
      const raw = request.headers
        .get("Cookie")
        ?.split("; ")
        .find((c) => c.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      if (raw) session = await unseal(raw, env.SESSION_KEY);
    } catch {
      /* Invalid cookie is unauthenticated. */
    }
    if (!session || session.until < Date.now())
      return json(
        { error: "Connectez-vous pour retrouver vos biens.", user: null },
        401,
      );
    let {
      data: { user },
    } = await client.auth.getUser(session.access_token);
    if (!user) {
      const refreshed = await client.auth.refreshSession({
        refresh_token: session.refresh_token,
      });
      if (!refreshed.data.session) {
        const r = json(
          { error: "Session expirée. Reconnectez-vous.", user: null },
          401,
        );
        r.headers.set("Set-Cookie", cookie("", 0));
        return r;
      }
      session = {
        ...session,
        access_token: refreshed.data.session.access_token,
        refresh_token: refreshed.data.session.refresh_token,
      };
      user = refreshed.data.user;
      outgoingCookie = cookie(await seal(session, env.SESSION_KEY));
    }
    if (!user) return json({ error: "Session invalide." }, 401);
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      ...options,
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });
    let response: Response;
    if (path === "/api/analyze" && request.method === "POST") {
      if (
        !(
          await env.AUTH_LIMITER.limit({
            key:
              "analysis:" +
              (request.headers.get("CF-Connecting-IP") || "unknown"),
          })
        ).success
      )
        return json({ error: "Trop de demandes." }, 429);
      try {
        response = json(await runAnalysis(await body(), env));
      } catch {
        response = json(
          {
            error:
              "Analyse IA indisponible ou réponse non vérifiable. Aucun résultat ajouté.",
          },
          422,
        );
      }
    } else if (path === "/api/extract" && request.method === "POST") {
      if (
        !(
          await env.AUTH_LIMITER.limit({
            key:
              "extract:" +
              (request.headers.get("CF-Connecting-IP") || "unknown"),
          })
        ).success
      )
        return json({ error: "Trop de demandes." }, 429);
      const { url: source } = z
        .object({ url: z.url({ protocol: /^https:$/ }).max(8000) })
        .strict()
        .parse(await body());
      try {
        response = json({
          candidates: await extractAuthorizedListing(
            source,
            env.LISTING_ALLOWED_HOSTS || "",
          ),
        });
      } catch (e) {
        response = json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Annonce inaccessible. Collez le texte ou utilisez une capture.",
          },
          422,
        );
      }
    } else if (
      /^\/api\/photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(
        path,
      ) &&
      request.method === "GET"
    ) {
      const projectId = path.split("/")[3],
        name = path.split("/")[4];
      const { data: project, error: projectError } = await db
        .from("private_projects")
        .select("id")
        .eq("id", projectId)
        .maybeSingle();
      if (projectError || !project)
        return json({ error: "Projet introuvable." }, 404);
      const { data, error } = await db.storage
        .from("mimmo-documents")
        .download(user.id + "/" + projectId + "/" + name);
      if (error || !data) return json({ error: "Photo introuvable." }, 404);
      const mime = name.endsWith(".png")
        ? "image/png"
        : name.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
      response = new Response(data, {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    } else if (/^\/api\/documents\/[0-9a-f-]{36}(\/[^/]+)?$/.test(path)) {
      const projectId = path.split("/")[3],
        name = path.split("/")[4];
      const { data: project, error: projectError } = await db
        .from("private_projects")
        .select("id")
        .eq("id", projectId)
        .maybeSingle();
      if (projectError || !project)
        return json({ error: "Projet introuvable." }, 404);
      const folder = user.id + "/" + projectId;
      if (name && request.method === "GET") {
        const decoded = decodeURIComponent(name);
        if (!/^[a-zA-Z0-9_.-]{1,180}$/.test(decoded))
          return json({ error: "Nom invalide." }, 400);
        const { data, error } = await db.storage
          .from("mimmo-documents")
          .createSignedUrl(folder + "/" + decoded, 60, { download: true });
        if (error) throw error;
        response = json({ url: data.signedUrl });
      } else if (!name && request.method === "GET") {
        const { data, error } = await db.storage
          .from("mimmo-documents")
          .list(folder, { limit: 100 });
        if (error) throw error;
        response = json({ documents: data });
      } else if (!name && documentUpload) {
        const mime = request.headers.get("Content-Type") || "";
        const extensions: Record<string, string> = {
          "application/pdf": "pdf",
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        };
        if (!extensions[mime]) return json({ error: "Format refusé." }, 415);
        const reader = request.body?.getReader();
        if (!reader) return json({ error: "Fichier absent." }, 400);
        const parts: Uint8Array[] = [];
        let length = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 10 * 1024 * 1024) {
            await reader.cancel();
            return json({ error: "Fichier limité à 10 Mo." }, 413);
          }
          parts.push(value);
        }
        const bytes = new Uint8Array(length);
        let at = 0;
        for (const part of parts) {
          bytes.set(part, at);
          at += part.length;
        }
        const head = new TextDecoder("latin1").decode(bytes.slice(0, 12));
        const valid =
          mime === "application/pdf"
            ? head.startsWith("%PDF-")
            : mime === "image/png"
              ? bytes[0] === 137 && head.slice(1, 4) === "PNG"
              : mime === "image/jpeg"
                ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
                : head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
        if (!valid || length < 16)
          return json(
            { error: "Le contenu ne correspond pas au format annoncé." },
            415,
          );
        const filename = crypto.randomUUID() + "." + extensions[mime];
        const originalName = decodeURIComponent(
          request.headers.get("X-File-Name") || "document",
        )
          .replace(/[\x00-\x1f]/g, "")
          .slice(0, 160);
        const { error } = await db.storage
          .from("mimmo-documents")
          .upload(folder + "/" + filename, bytes, {
            contentType: mime,
            upsert: false,
            metadata: { originalName },
          });
        if (error) throw error;
        response = json({ name: filename }, 201);
      } else response = json({ error: "Méthode refusée." }, 405);
    } else if (path === "/api/session" && request.method === "GET")
      response = json({ user: { email: user.email } });
    else if (path === "/api/logout" && request.method === "POST") {
      const { error: sessionError } = await db.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (sessionError) throw sessionError;
      const { error: logoutError } = await db.auth.signOut();
      if (logoutError) throw logoutError;
      outgoingCookie = cookie("", 0);
      response = json({ ok: true });
    } else if (path === "/api/properties" && request.method === "GET") {
      const { data, error } = await db
        .from("private_projects")
        .select("payload,version")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      response = json({
        properties: data.map((r) => ({ ...r.payload, version: r.version })),
      });
    } else if (path === "/api/properties" && request.method === "PUT") {
      const p = propertySchema.parse(await body());
      if (new TextEncoder().encode(JSON.stringify(p)).length > 58000)
        return json(
          {
            error:
              "Dossier trop volumineux. Raccourcissez les extraits ou les notes avant de réessayer.",
          },
          413,
        );
      p.url = validateUrl(p.url);
      for (const k of Object.keys(fields) as FieldKey[])
        Object.assign(p.facts[k], validateFact(k, p.facts[k]));
      const { data, error } = await db.rpc("save_private_project", {
        project_id: p.id,
        expected_version: p.version || 0,
        project_payload: p,
      });
      if (error?.code === "40001")
        response = json(
          {
            error:
              "Ce bien a changé sur un autre appareil. Rechargez la page après avoir copié votre brouillon.",
          },
          409,
        );
      else if (error) throw error;
      else response = json({ property: { ...p, version: data } });
    } else if (
      /^\/api\/properties\/[0-9a-f-]{36}$/.test(path) &&
      request.method === "DELETE"
    ) {
      const { error } = await db
        .from("private_projects")
        .delete()
        .eq("id", path.split("/").pop()!);
      if (error) throw error;
      response = json({ ok: true });
    } else response = json({ error: "Route inconnue." }, 404);
    if (outgoingCookie) response.headers.set("Set-Cookie", outgoingCookie);
    return response;
  } catch (e) {
    return json(
      {
        error:
          e instanceof z.ZodError || e instanceof SyntaxError
            ? "Données invalides."
            : "Opération impossible. Votre brouillon est conservé ; réessayez.",
      },
      400,
    );
  }
}
