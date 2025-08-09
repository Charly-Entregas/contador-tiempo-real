import { store, readJSON, publish } from './_common.js';

export async function handler(event){
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { id } = JSON.parse(event.body || '{}');
  if (!id) return { statusCode: 400, body: 'Missing id' };

  const key = 'orders.json';
  const orders = await readJSON(key, []);
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return { statusCode: 404, body: 'Not found' };

  const [removed] = orders.splice(idx,1);
  await store.set(key, JSON.stringify(orders));
  await publish('orders','removed',{ id });
  return { statusCode: 200, body: JSON.stringify({ ok:true }) };
}
