import { store, readJSON, publish } from './_common.js';

export async function handler(event){
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { id, restaurant, amount } = JSON.parse(event.body || '{}');
  if (!id) return { statusCode: 400, body: 'Missing id' };

  const key = 'orders.json';
  const orders = await readJSON(key, []);
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return { statusCode: 404, body: 'Not found' };

  if (restaurant) orders[idx].restaurant = restaurant;
  if (amount != null) orders[idx].amount = Number(amount);
  await store.set(key, JSON.stringify(orders));
  await publish('orders','updated', orders[idx]);
  return { statusCode: 200, body: JSON.stringify({ ok:true, order: orders[idx] }) };
}
