import { store, readJSON, publish, mexicoNow } from './_common.js';

export async function handler(event){
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { restaurant, amount } = JSON.parse(event.body || '{}');
  if (!restaurant || !amount) return { statusCode: 400, body: 'Missing restaurant or amount' };

  const times = mexicoNow();
  const order = { id: crypto.randomUUID(), restaurant, amount: Number(amount), iso: times.iso, localTime: times.local };

  const key = 'orders.json';
  const list = await readJSON(key, []);
  list.push(order);
  await store.set(key, JSON.stringify(list));

  await publish('orders', 'added', order);
  return { statusCode: 200, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ ok:true, order }) };
}
