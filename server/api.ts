import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fields, validateFact, validateUrl, type FieldKey } from '../src/domain/property';
export interface Environment {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SESSION_KEY: string;
  AUTH_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const cookieName = '__Host-mimmo';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function cookie(value: string, age = 2592000) { return `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`; }
function base64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
async function key(secret: string) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(value: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(JSON.stringify(value)));
  return base64(iv) + '.' + base64(new Uint8Array(data));
}
export async function unseal(value: string, secret: string) {
  const [iv, data] = value.split('.').map(s => Uint8Array.from(atob(s), c => c.charCodeAt(0)));
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await key(secret), data)));
}
const factSchema = z.object({ value: z.string().max(4000), source: z.string().max(2000), status: z.enum(['missing','estimated','listing','conflicting']), updatedAt: z.iso.datetime() }).strict();
const propertySchema = z.object({ id: z.uuid(), url: z.string().max(8000), createdAt: z.iso.datetime(), version: z.number().int().nonnegative().optional(), facts: z.object(Object.fromEntries(Object.keys(fields).map(k => [k, factSchema])) as Record<FieldKey, typeof factSchema>).strict() }).strict();
export async function api(request: Request, env: Environment): Promise<Response> {
  if (new URL(request.url).protocol !== 'https:') return json({ error: 'HTTPS obligatoire.' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || (!env.SESSION_KEY || env.SESSION_KEY.length < 32) || !env.AUTH_LIMITER) return json({ error: 'Comptes non configurés.' }, 503);
  const url = new URL(request.url), path = url.pathname;
  if (!['GET','POST','PUT','DELETE'].includes(request.method)) return json({ error: 'Méthode refusée.' }, 405);
  if (request.method !== 'GET' && (request.headers.get('Origin') !== url.origin || request.headers.get('Content-Type') !== 'application/json')) return json({ error: 'Origine refusée.' }, 403);
  if (Number(request.headers.get('Content-Length')) > 65536) return json({ error: 'Requête trop volumineuse.' }, 413);
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
  if (path === '/api/confirm' && request.method === 'GET') {
    const token_hash = url.searchParams.get('token_hash');
    if (!token_hash || token_hash.length > 2048) return json({ error: 'Lien invalide.' }, 400);
    const { error } = await client.auth.verifyOtp({ token_hash, type: 'signup' });
    if (error) return json({ error: 'Lien expiré ou déjà utilisé. Reprenez la création du compte.' }, 400);
    return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  let outgoingCookie: string | undefined;
  try {
    async function body() {
      const reader = request.body?.getReader();
      if (!reader) throw new SyntaxError('Corps absent.');
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); throw new SyntaxError('Requête trop volumineuse.'); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    if (['/api/login', '/api/signup'].includes(path) && request.method === 'POST') {
      if (!(await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) return json({ error: 'Trop de tentatives. Réessayez plus tard.' }, 429);
      const credentials = z.object({ email: z.email().max(254), password: z.string().min(12).max(128) }).strict().parse(await body());
      const result = path === '/api/login' ? await client.auth.signInWithPassword(credentials) : await client.auth.signUp({ ...credentials, options: { emailRedirectTo: url.origin + '/api/confirm' } });
      if (result.error) return json({ error: 'Connexion impossible. Vérifiez vos identifiants, votre confirmation email ou réessayez plus tard.' }, 400);
      if (result.data.session) outgoingCookie = cookie(await seal({ access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token, until: Date.now() + 2592000000 }, env.SESSION_KEY));
      const response = json({ user: result.data.session ? { email: result.data.user?.email } : null, confirmation: !result.data.session });
      if (outgoingCookie) response.headers.set('Set-Cookie', outgoingCookie);
      return response;
    }
    let session;
    try {
      const raw = request.headers.get('Cookie')?.split('; ').find(c => c.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      if (raw) session = await unseal(raw, env.SESSION_KEY);
    } catch { /* Invalid cookie is unauthenticated. */ }
    if (!session || session.until < Date.now()) return json({ error: 'Connectez-vous pour retrouver vos biens.', user: null }, 401);
    let { data: { user } } = await client.auth.getUser(session.access_token);
    if (!user) {
      const refreshed = await client.auth.refreshSession({ refresh_token: session.refresh_token });
      if (!refreshed.data.session) { const r = json({ error: 'Session expirée. Reconnectez-vous.', user: null }, 401); r.headers.set('Set-Cookie', cookie('', 0)); return r; }
      session = { ...session, access_token: refreshed.data.session.access_token, refresh_token: refreshed.data.session.refresh_token };
      user = refreshed.data.user;
      outgoingCookie = cookie(await seal(session, env.SESSION_KEY));
    }
    if (!user) return json({ error: 'Session invalide.' }, 401);
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { ...options, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
    let response: Response;
    if (path === '/api/session' && request.method === 'GET') response = json({ user: { email: user.email } });
    else if (path === '/api/logout' && request.method === 'POST') {
      await db.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      await db.auth.signOut();
      outgoingCookie = cookie('', 0); response = json({ ok: true });
    } else if (path === '/api/properties' && request.method === 'GET') {
      const { data, error } = await db.from('private_projects').select('payload,version').order('updated_at', { ascending: false });
      if (error) throw error;
      response = json({ properties: data.map(r => ({ ...r.payload, version: r.version })) });
    } else if (path === '/api/properties' && request.method === 'PUT') {
      const p = propertySchema.parse(await body());
      p.url = validateUrl(p.url);
      for (const k of Object.keys(fields) as FieldKey[]) Object.assign(p.facts[k], validateFact(k, p.facts[k]));
      const { data, error } = await db.rpc('save_private_project', { project_id: p.id, expected_version: p.version || 0, project_payload: p });
      if (error?.code === '40001') response = json({ error: 'Ce bien a changé sur un autre appareil. Rechargez la page après avoir copié votre brouillon.' }, 409);
      else if (error) throw error;
      else response = json({ property: { ...p, version: data } });
    } else if (/^\/api\/properties\/[0-9a-f-]{36}$/.test(path) && request.method === 'DELETE') {
      const { error } = await db.from('private_projects').delete().eq('id', path.split('/').pop()!);
      if (error) throw error;
      response = json({ ok: true });
    } else response = json({ error: 'Route inconnue.' }, 404);
    if (outgoingCookie) response.headers.set('Set-Cookie', outgoingCookie);
    return response;
  } catch (e) {
    return json({ error: e instanceof z.ZodError || e instanceof SyntaxError ? 'Données invalides.' : 'Opération impossible. Votre brouillon est conservé ; réessayez.' }, 400);
  }
}
