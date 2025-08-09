import { getStore } from '@netlify/blobs';
import Ably from 'ably/promises';

function makeStore() {
  const name = 'orders-app';
  // Si BLOBS_SITE_ID/BLOBS_TOKEN existen, úsalos (modo manual).
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name, siteID, token });
  }
  // Si Blobs está habilitado en el sitio, esto basta.
  return getStore({ name });
}

export const store = makeStore();

export async function readJSON(key, fallback){
  const raw = await store.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export async function publish(channel, name, data){
  const apiKey = process.env.ABLY_API_KEY;
  const rest = new Ably.Rest(apiKey);
  const ch = rest.channels.get(channel);
  await ch.publish(name, data);
}

export function mexicoNow(){
  const iso = new Date().toISOString();
  try {
    const fmt = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City', hour12:false,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
    return { iso, local: fmt.format(new Date()) };
  } catch {
    return { iso, local: iso };
  }
}

