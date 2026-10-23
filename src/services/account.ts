import type { Property } from '../domain/property';
export const accountsEnabled = import.meta.env.MODE === 'accounts';
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Connexion interrompue. Réessayez.');
  return result;
}
export async function persist(property: Property) {
  return (await api<{ property: Property }>('properties', 'PUT', property)).property;
}
