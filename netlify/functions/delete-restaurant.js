import { store, readJSON, publish } from './_common.js';

export async function handler(event){
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { name } = JSON.parse(event.body || '{}');
  if (!name) return { statusCode: 400, body: 'Missing name' };

  const key = 'restaurants.json';
  const list = await readJSON(key, []);
  const normalized = list.map(r => typeof r === 'string' ? ({ name: r, createdAt: new Date().toISOString() }) : r);

  const next = normalized.filter(r => r.name !== name);
  await store.set(key, JSON.stringify(next));
  await publish('restaurants','removed',{ name });

  return { statusCode: 200, body: JSON.stringify({ ok:true }) };
}
