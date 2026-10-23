// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({createClient:vi.fn(),getUser:vi.fn(),refreshSession:vi.fn(),signOut:vi.fn(),setSession:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:mock.createClient}));
import {api,seal,type Environment} from '../server/api';
const env:Environment={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test',SESSION_KEY:'s'.repeat(40),AUTH_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>new Response()}};
beforeEach(()=>{
 vi.clearAllMocks();
 mock.createClient.mockReturnValue({auth:mock});
 mock.getUser.mockResolvedValue({data:{user:{id:'alice',email:'alice@example.com'}}});
 mock.setSession.mockResolvedValue({data:{},error:null});mock.signOut.mockResolvedValue({error:null});
});
async function request(path:string,method='GET',until=Date.now()+100000){
 const token=await seal({access_token:'alice-access',refresh_token:'alice-refresh',until},env.SESSION_KEY);
 return new Request('https://mimmo.test/api/'+path,{method,headers:{Cookie:'__Host-mimmo='+token,...(method==='POST'?{Origin:'https://mimmo.test','Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});
}
it('validates identity with provider and forwards only the user token to the database',async()=>{
 const r=await api(await request('session'),env);
 expect(await r.json()).toEqual({user:{email:'alice@example.com'}});
 expect(mock.getUser).toHaveBeenCalledWith('alice-access');
 expect(mock.createClient.mock.calls[1][2].global.headers.Authorization).toBe('Bearer alice-access');
});
it('refreshes expired access tokens into protected cookies',async()=>{
 mock.getUser.mockResolvedValue({data:{user:null}});
 mock.refreshSession.mockResolvedValue({data:{user:{id:'alice',email:'alice@example.com'},session:{access_token:'new-access',refresh_token:'new-refresh'}}});
 const r=await api(await request('session'),env);
 expect(r.status).toBe(200);expect(mock.refreshSession).toHaveBeenCalledWith({refresh_token:'alice-refresh'});
 expect(r.headers.get('Set-Cookie')).toContain('Secure; HttpOnly; SameSite=Lax');
 expect(r.headers.get('Set-Cookie')).not.toContain('new-refresh');
});
it('rejects revoked and absolute-expired sessions and clears revoked cookies',async()=>{
 mock.getUser.mockResolvedValue({data:{user:null}});
 mock.refreshSession.mockResolvedValue({data:{user:null,session:null}});
 const r=await api(await request('session'),env);
 expect(r.status).toBe(401);expect(r.headers.get('Set-Cookie')).toContain('Max-Age=0');
 expect((await api(await request('session','GET',1),env)).status).toBe(401);
});
it('logout clears cookie and revokes provider refresh session',async()=>{
 const r=await api(await request('logout','POST'),env);
 expect(r.status).toBe(200);expect(mock.signOut).toHaveBeenCalled();expect(r.headers.get('Set-Cookie')).toContain('Max-Age=0');
});
