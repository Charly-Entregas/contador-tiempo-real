import { store, readJSON, publish, mexicoNow } from './_common.js';

export async function handler(event){
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { name } = JSON.parse(event.body || '{}');
  if (!name) return { statusCode: 400, body: 'Missing name' };

  const key = 'restaurants.json';
  const list = await readJSON(key, []);

  // Normaliza (si hay strings viejos, vuélvelos objetos)
  const normalized = list.map(r => typeof r === 'string' ? ({ name: r, createdAt: new Date().toISOString() }) : r);

  if (!normalized.some(r => r.name === name)) {
    normalized.push({ name, createdAt: new Date().toISOString() });
    await store.set(key, JSON.stringify(normalized));
    await publish('restaurants','added',{ name });
  }
  return { statusCode: 200, body: JSON.stringify({ ok:true }) };
}

