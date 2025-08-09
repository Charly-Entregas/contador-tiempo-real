import { store, readJSON, publish, mexicoNow } from './_common.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  // Parseo seguro
  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const restaurant = String(payload.restaurant || '').trim();
  const amountNum = Number(payload.amount);

  if (!restaurant) {
    return json(400, { error: 'Missing restaurant' });
  }
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return json(400, { error: 'Invalid amount' });
  }

  // Fecha/hora MX y ID
  const times = mexicoNow(); // { iso, local }
  const id =
    (globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const order = {
    id,
    restaurant,
    amount: amountNum,
    iso: times.iso,      // ISO en MX (desde _common)
    localTime: times.local, // Texto legible en MX
  };

  // Persistir
  const key = 'orders.json';
  const list = await readJSON(key, []);
  list.push(order);
  await store.set(key, JSON.stringify(list));

  // Notificar en tiempo real
  await publish('orders', 'added', order);

  return json(200, { ok: true, order });
}
