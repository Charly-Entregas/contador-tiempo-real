import { readJSON } from './_common.js';

export async function handler(){
  const restaurantsRaw = await readJSON('restaurants.json', []);
  const restaurants = restaurantsRaw.map(r =>
    typeof r === 'string' ? ({ name: r, createdAt: new Date().toISOString() }) : r
  );
  const orders = await readJSON('orders.json', []);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin':'*' },
    body: JSON.stringify({ restaurants, orders })
  };
}
