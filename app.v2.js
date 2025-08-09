// Frontend logic using Ably Realtime with token auth from Netlify Function

// For browser we will use CDN-free approach: we won't import here. We'll rely on window.Ably injected by a tiny inline loader.
// BUT since we are not using bundlers, we'll attach a dynamic script for Ably browser build.
(async () => {
  // Load Ably browser script dynamically
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.ably.com/lib/ably.min-1.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  const amountInput = document.getElementById('amountInput');
  const restaurantList = document.getElementById('restaurantList');
  const addRestaurantBtn = document.getElementById('addRestaurantBtn');
  const historyBtn = document.getElementById('historyBtn');
  const acceptBtn = document.getElementById('acceptBtn');
  const statusEl = document.getElementById('status');

  const historyDialog = document.getElementById('historyDialog');
  const closeHistory = document.getElementById('closeHistory');
  const historyTableBody = document.querySelector('#historyTable tbody');
  const summaryEl = document.getElementById('summary');

  let selectedRestaurant = null;
  let restaurants = [];
  let orders = [];

  function pesos(n){ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n||0); }
  function fmtSummary(){
    // compute summary per restaurant
    const byRest = {};
    for (const o of orders){
      const key = o.restaurant;
      byRest[key] ||= {count:0, total:0};
      byRest[key].count++;
      byRest[key].total += Number(o.amount)||0;
    }
    summaryEl.innerHTML = '';
    const totalCount = orders.length;
    const totalImporte = orders.reduce((a,b)=>a+(Number(b.amount)||0),0);
    const pills = [
      `<span class="pill"><strong>Total pedidos:</strong> ${totalCount}</span>`,
      `<span class="pill"><strong>Importe total:</strong> ${pesos(totalImporte)}</span>`
    ];
    summaryEl.insertAdjacentHTML('beforeend', pills.join(' '));
    // per restaurant pills
    for (const [name,data] of Object.entries(byRest)){
      summaryEl.insertAdjacentHTML('beforeend', `<span class="pill">${name}: ${data.count} · ${pesos(data.total)}</span>`);
    }
  }

  function renderRestaurants(){
    restaurantList.innerHTML = '';
    restaurants.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'btn restaurant-btn';
      btn.textContent = name;
      btn.addEventListener('click', async () => {
        const amount = parseFloat(amountInput.value || '0');
        if (isNaN(amount) || amount <= 0){
          alert('Ingresa un monto válido antes de registrar.');
          amountInput.focus();
          return;
        }
        selectedRestaurant = name;
        await fetch('/.netlify/functions/add-order', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ restaurant: name, amount })
        });
        amountInput.value = '';
      });
      restaurantList.appendChild(btn);
    });
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

  // Ably realtime
  const realtime = new window.Ably.Realtime.Promise({ authUrl: '/.netlify/functions/token' });
  const ordersChannel = realtime.channels.get('orders');
  const restaurantsChannel = realtime.channels.get('restaurants');

  ordersChannel.subscribe('added', msg => {
    orders.push(msg.data);
    if (historyDialog.open) renderHistoryTable();
    statusEl.textContent = 'Actualizado en tiempo real';
  });

  restaurantsChannel.subscribe('added', msg => {
    if (!restaurants.includes(msg.data.name)){
      restaurants.push(msg.data.name);
      renderRestaurants();
      statusEl.textContent = 'Restaurantes sincronizados';
    }
  });

  // Initial state
  async function loadInitial(){
    const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
    const data = await r.json();
    restaurants = data.restaurants || [];
    orders = data.orders || [];
    renderRestaurants();
    statusEl.textContent = `Listo · ${restaurants.length} restaurantes`;
  }
  await loadInitial();

  // UI events
  addRestaurantBtn.addEventListener('click', async () => {
    const name = prompt('Nombre del restaurante:');
    if (!name) return;
    await fetch('/.netlify/functions/add-restaurant',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: name.trim() })
    });
  });

  historyBtn.addEventListener('click', async () => {
    // reload to compute fresh summary
    const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
    const data = await r.json();
    orders = data.orders || [];
    renderHistoryTable();
    fmtSummary();
    historyDialog.showModal();
  });
  closeHistory.addEventListener('click', ()=> historyDialog.close());

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
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ restaurant: selectedRestaurant, amount })
    });
    amountInput.value = '';
  });
})();