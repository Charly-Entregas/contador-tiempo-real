import { store, readJSON, publish } from './_common.js';

export async function handler(event){
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { name } = JSON.parse(event.body || '{}');
  if (!name) return { statusCode: 400, body: 'Missing name' };

  const key = 'restaurants.json';
  const restaurants = await readJSON(key, []);
  if (!restaurants.includes(name)) {
    restaurants.push(name);
    await store.set(key, JSON.stringify(restaurants));
    await publish('restaurants','added',{ name });
  }
  return { statusCode: 200, body: JSON.stringify({ ok:true }) };
}
