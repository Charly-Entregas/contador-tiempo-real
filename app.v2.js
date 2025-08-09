// app.v2.js — Frontend con Ably + Netlify Functions
// - Orden A–Z / Z–A / Reciente / Antiguo
// - Borrar restaurante (✕)
// - Registro de pedidos y sincronización en tiempo real

(async () => {
  // Cargar Ably (navegador) desde CDN
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.ably.com/lib/ably.min-1.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  // Elementos UI
  const amountInput      = document.getElementById('amountInput');
  const restaurantList   = document.getElementById('restaurantList');
  const addRestaurantBtn = document.getElementById('addRestaurantBtn');
  const historyBtn       = document.getElementById('historyBtn');
  const acceptBtn        = document.getElementById('acceptBtn');
  const statusEl         = document.getElementById('status');

  const historyDialog    = document.getElementById('historyDialog');
  const closeHistory     = document.getElementById('closeHistory');
  const historyTableBody = document.querySelector('#historyTable tbody');
  const summaryEl        = document.getElementById('summary');

  // Selector de orden (DEBE existir en el HTML)
  const sortSelect       = document.getElementById('sortSelect');

  // Estado
  let selectedRestaurant = null;
  // Nota: ahora usamos objetos { name, createdAt } para poder ordenar por fecha
  let restaurants = [];
  let orders = [];
  let sortMode = localStorage.getItem('sortMode') || 'az';

  // Configurar selector
  if (sortSelect) {
    sortSelect.value = sortMode;
    sortSelect.addEventListener('change', () => {
      sortMode = sortSelect.value;
      localStorage.setItem('sortMode', sortMode);
      renderRestaurants();
    });
  }

  // Utilidades
  const pesos = (n) => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' }).format(n||0);

  function fmtSummary(){
    const byRest = {};
    for (const o of orders){
      const k = o.restaurant;
      byRest[k] ||= { count:0, total:0 };
      byRest[k].count++;
      byRest[k].total += Number(o.amount)||0;
    }
    summaryEl.innerHTML = '';
    const totalCount = orders.length;
    const totalImporte = orders.reduce((a,b)=>a+(Number(b.amount)||0),0);
    summaryEl.insertAdjacentHTML('beforeend',
      `<span class="pill"><strong>Total pedidos:</strong> ${totalCount}</span> <span class="pill"><strong>Importe total:</strong> ${pesos(totalImporte)}</span>`);
    for (const [name,data] of Object.entries(byRest)){
      summaryEl.insertAdjacentHTML('beforeend', `<span class="pill">${name}: ${data.count} · ${pesos(data.total)}</span>`);
    }
  }

function sortRestaurants(arr){
  const a = arr.slice();
  if (sortMode === 'az')  a.sort((x,y)=> x.name.localeCompare(y.name));
  if (sortMode === 'za')  a.sort((x,y)=> y.name.localeCompare(x.name));
  if (sortMode === 'new') a.sort((x,y)=> Date.parse(y.createdAt||0) - Date.parse(x.createdAt||0)); // reciente primero
  if (sortMode === 'old') a.sort((x,y)=> Date.parse(x.createdAt||0) - Date.parse(y.createdAt||0)); // antiguo primero
  return a;
}


  function renderRestaurants(){
    restaurantList.innerHTML = '';
    const data = sortRestaurants(restaurants);
    data.forEach(r => {
      const row = document.createElement('div');
      row.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'btn restaurant-btn';
      btn.textContent = r.name;
      btn.style.paddingRight = '42px'; // espacio para ✕
      btn.addEventListener('click', async () => {
        const amount = parseFloat(amountInput.value || '0');
        if (isNaN(amount) || amount <= 0){
          alert('Ingresa un monto válido antes de registrar.');
          amountInput.focus();
          return;
        }
        selectedRestaurant = r.name;
        await fetch('/.netlify/functions/add-order', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ restaurant: r.name, amount })
        });
        amountInput.value = '';
      });

      // Icono borrar
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Eliminar restaurante';
      del.className = 'btn';
      del.style.position = 'absolute';
      del.style.right = '6px';
      del.style.top   = '6px';
      del.style.padding   = '6px 10px';
      del.style.lineHeight = '1';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`¿Eliminar "${r.name}"? (No borra pedidos históricos)`)) return;
        await fetch('/.netlify/functions/delete-restaurant', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ name: r.name })
        });
      });

      row.appendChild(btn);
      row.appendChild(del);
      restaurantList.appendChild(row);
    });
    statusEl.textContent = `Listo · ${restaurants.length} restaurantes`;
  }

  function renderHistoryTable(){
    historyTableBody.innerHTML = '';
    for (const o of orders.slice().reverse()){
      const tr = document.createElement('tr');
      const dt = o.localTime || o.iso;
      tr.innerHTML = `<td>${dt}</td><td>${o.restaurant}</td><td>${pesos(o.amount)}</td>`;
      historyTableBody.appendChild(tr);
    }
  }

  // Realtime (Ably)
  const realtime = new window.Ably.Realtime.Promise({ authUrl: '/.netlify/functions/token' });
  const ordersChannel = realtime.channels.get('orders');
  const restaurantsChannel = realtime.channels.get('restaurants');

  ordersChannel.subscribe('added', msg => {
    orders.push(msg.data);
    if (historyDialog.open) renderHistoryTable();
    statusEl.textContent = 'Actualizado en tiempo real';
  });

restaurantsChannel.subscribe('added', msg => {
  const { name, createdAt } = msg.data;
  if (!restaurants.some(x => x.name === name)){
    restaurants.push({ name, createdAt: createdAt || new Date().toISOString() });
    renderRestaurants();
    statusEl.textContent = 'Restaurantes sincronizados';
  }
});

  restaurantsChannel.subscribe('removed', msg => {
    const name = msg.data.name;
    restaurants = restaurants.filter(x => x.name !== name);
    renderRestaurants();
    statusEl.textContent = 'Restaurante eliminado';
  });

  // Carga inicial (normaliza strings antiguos → objetos)
  async function loadInitial(){
    const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
    const data = await r.json();
    restaurants = (data.restaurants || []).map(x =>
      (typeof x === 'string') ? ({ name:x, createdAt:new Date().toISOString() }) : x
    );
    orders = data.orders || [];
    renderRestaurants();
  }
  await loadInitial();

  // Eventos UI
  addRestaurantBtn.addEventListener('click', async () => {
    const name = prompt('Nombre del restaurante:')?.trim();
    if (!name) return;
    await fetch('/.netlify/functions/add-restaurant', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ name })
    });
  });

  historyBtn.addEventListener('click', async () => {
    const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
    const data = await r.json();
    orders = data.orders || [];
    renderHistoryTable();
    fmtSummary();
    historyDialog.showModal();
  });
  closeHistory.addEventListener('click', () => historyDialog.close());

  acceptBtn.addEventListener('click', async () => {
    if (!selectedRestaurant){
      alert('Primero toca un restaurante para asignar el pedido.');
      return;
    }
    const amount = parseFloat(amountInput.value || '0');
    if (isNaN(amount) || amount <= 0){
      alert('Ingresa un monto válido.');
      return;
    }
    await fetch('/.netlify/functions/add-order', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ restaurant: selectedRestaurant, amount })
    });
    amountInput.value = '';
  });
})();
