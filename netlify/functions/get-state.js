import { store, readJSON } from './_common.js';

export async function handler(){
  const restaurants = await readJSON('restaurants.json', []);
  const orders = await readJSON('orders.json', []);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin':'*' },
    body: JSON.stringify({ restaurants, orders })
  };
}
