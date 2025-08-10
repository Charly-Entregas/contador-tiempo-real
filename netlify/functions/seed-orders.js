// netlify/functions/seed-orders.js
import { store, readJSON, publish } from './_common.js';

// Utilidades de fecha MX
const MX_TZ = 'America/Mexico_City';
const MX_OFFSET_HOURS = 6; // UTC-6 (ajuste para que iso->MX muestre la hora que elegimos)

function mxLocalToISO(y, m, d, h, min = 0) {
  // Creamos un ISO tal que, al formatearlo en MX, salga y-m-d h:min
  const iso = new Date(Date.UTC(y, m - 1, d, h + MX_OFFSET_HOURS, min, 0)).toISOString();
  return iso;
}

function mxLocalPretty(iso) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MX_TZ,
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(iso));
}

function randInt(min, max) { // incluyente
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function* eachDayUTC(start, end) {
  const d = new Date(start);
  while (d <= end) {
    yield new Date(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Config por body (todo opcional)
  const cfg = JSON.parse(event.body || '{}');

  // Rangos por defecto: 2025-06-01 → 2025-08-10
  const start = new Date(cfg.start || '2025-06-01T00:00:00Z');
  const end   = new Date(cfg.end   || '2025-08-10T23:59:59Z');

  // Pedidos por día (min, max)
  const perDayMin = cfg.perDayMin ?? 1;
  const perDayMax = cfg.perDayMax ?? 6;

  // Horas MX (08–24)
  const hourStart = cfg.hourStart ?? 8;
  const hourEnd   = cfg.hourEnd   ?? 24;

  // Monto MXN
  const amountMin = cfg.amountMin ?? 30;
  const amountMax = cfg.amountMax ?? 220;

  // ¿Publicar eventos Ably por cada orden? (si vas a generar muchos, pon false)
  const publishRealtime = cfg.publishRealtime ?? false;

  // Restaurantes
  const restaurants = await readJSON('restaurants.json', []);
  const names = restaurants.map(r => (typeof r === 'string' ? r : r.name)).filter(Boolean);

  if (names.length === 0) {
    return {
      statusCode: 400,
      body: 'No hay restaurantes para asignar pedidos. Agrega algunos primero.'
    };
  }

  // Cargar órdenes existentes
  const key = 'orders.json';
  const list = await readJSON(key, []);

  let created = 0;

  for (const day of eachDayUTC(start, end)) {
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();

    const countToday = randInt(perDayMin, perDayMax);
    for (let i = 0; i < countToday; i++) {
      const rest = names[randInt(0, names.length - 1)];
      const hour = randInt(hourStart, hourEnd);
      const min  = randInt(0, 59);
      const amount = randInt(amountMin, amountMax);

      const iso = mxLocalToISO(y, m, d, hour, min);
      const order = {
        id: crypto.randomUUID(),
        restaurant: rest,
        amount,
        iso,
        localTime: mxLocalPretty(iso)
      };

      list.push(order);
      created++;

      if (publishRealtime) {
        await publish('orders', 'added', order);
      }
    }
  }

  // Guardar todo
  await store.set(key, JSON.stringify(list));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: true, created, total: list.length })
  };
}
