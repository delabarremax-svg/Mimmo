// @vitest-environment node
import { expect, it } from 'vitest';
import { api, seal, unseal, type Environment } from '../server/api';
const env = { SUPABASE_URL:'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY:'publishable-test', SESSION_KEY:'a'.repeat(40), ASSETS:{fetch:async()=>new Response('')}, AUTH_LIMITER:{limit:async()=>({success:true})} } as Environment;
it('encrypts tokens and rejects cookie tampering or another key', async () => {
 const c = await seal({refresh_token:'private'},env.SESSION_KEY);
 expect(c).not.toContain('private');
 expect(await unseal(c,env.SESSION_KEY)).toEqual({refresh_token:'private'});
 await expect(unseal(c,'b'.repeat(40))).rejects.toThrow();
 await expect(unseal(c+'tamper',env.SESSION_KEY)).rejects.toThrow();
});
it('denies anonymous reads, foreign origins, insecure requests and unconfigured services',async()=>{
 expect((await api(new Request('https://mimmo.test/api/properties'),env)).status).toBe(401);
 expect((await api(new Request('https://mimmo.test/api/properties',{method:'PUT',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'}),env)).status).toBe(403);
 expect((await api(new Request('http://mimmo.test/api/session'),env)).status).toBe(403);
 expect((await api(new Request('https://mimmo.test/api/session'),{} as Environment)).status).toBe(503);
});
it('limits auth attempts before contacting provider',async()=>{
 expect((await api(new Request('https://mimmo.test/api/login',{method:'POST',headers:{Origin:'https://mimmo.test','Content-Type':'application/json'},body:'{}'}),{...env,AUTH_LIMITER:{limit:async()=>({success:false})}})).status).toBe(429);
});
