import { useState } from 'react';
import { api } from '../services/account';
export default function Account({ onConnected }: { onConnected: (email: string) => Promise<void> }) {
  const [signup, setSignup] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  return <section className="narrow"><span className="eyebrow">VOTRE ESPACE PRIVÉ</span><h1>{signup ? 'Créons votre compte.' : 'Reprenez votre projet.'}</h1><p>Vos biens, vos sources et vos notes vous attendront à votre retour.</p><form className="panel" onSubmit={async e => {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setMessage('');
    try {
      const result = await api<{ user: { email: string } | null; confirmation: boolean }>(signup ? 'signup' : 'login', 'POST', { email: data.get('email'), password: data.get('password') });
      if (result.user) await onConnected(result.user.email);
      else { setSignup(false); setMessage('Vérifiez votre boîte email pour confirmer votre compte, puis connectez-vous ici.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connexion impossible.'); }
    finally { setBusy(false); }
  }}><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254}/><label htmlFor="password">Mot de passe · 12 caractères minimum</label><input id="password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required/>{message && <p role="status">{message}</p>}<button className="primary" disabled={busy}>{busy ? 'Connexion en cours…' : signup ? 'Créer mon compte' : 'Me connecter'}</button><button type="button" disabled={busy} className="back" onClick={() => { setSignup(!signup); setMessage(''); }}>{signup ? 'J’ai déjà un compte' : 'Créer un compte'}</button></form></section>;
}
