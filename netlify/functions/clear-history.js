// netlify/functions/clear-history.js
import { store, publish } from './_common.js';

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
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  const key = 'orders.json';

  // Vaciar pedidos
  await store.set(key, JSON.stringify([]));

  // Avisar en tiempo real a todos los clientes
  await publish('orders', 'cleared', {});

  return json(200, { ok: true, message: 'Historial borrado' });
}
