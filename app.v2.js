// app.js / app.v2.js
// Lógica del frontend con Ably Realtime + Netlify Functions
// - Ordenar restaurantes (A–Z / Z–A / reciente / antiguo)
// - Borrar restaurante con icono ✕
// - Registro de pedidos en tiempo real
//
// NOTA: Cargamos Ably desde CDN en el navegador. Las functions usan auth por token.
// Requiere en el backend: token.js, get-state.js, add-restaurant.js, add-order.js
// y delete-restaurant.js (nuevo), además de _common.js con Blobs configurado.

(async () => {
  // 1) Cargar Ably (browser) dinámicamente
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.ably.com/lib/ably.min-1.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  // 2) Referencias a la UI
  const amountInput       = document.getElementById('amountInput');
  const restaurantList    = document.getElementById('restaurantList');
  const addRestaurantBtn  = document.getElementById('addRestaurantBtn');
  const historyBtn        = document.getElementById('historyBtn');
  const acceptBtn         = document.getElementById('acceptBtn');
  const statusEl          = document.getElementById('status');

  const historyDialog     = document.getElementById('historyDialog');
  const closeHistory      = document.getElementById('closeHistory');
  const historyTableBody  = document.querySelector('#historyTable tbody');
  const summaryEl         = document.getElementById('summary');

  // 3) Crear selector de orden junto al título "Restaurantes"
  //    (si ya lo agregaste en el HTML, puedes omitir esta parte)
  let sortSelect = document.getElementById('sortSelect');
  if (!sortSelect) {
    const titleEl = document.querySelector('.section-title');
    if (titleEl) {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.justifyContent = 'space-between';
      // Mover el texto original al contenedor
      const left = document.createElement('span');
      left.textContent = titleEl.textContent || 'Restaurantes';
      titleEl.textContent = '';
      titleEl.appendChild(wrap);
      wrap.appendChild(left);

      sortSelect = document.createElement('select');
      sortSelect.id = 'sortSelect';
      sortSelect.className = 'btn';
      sortSelect.style.padding = '8px 10px';
      sortSelect.style.fontSize = '12px';
      sortSelect.innerHTML = `
        <option value="az">A–Z</option>
        <option value="za">Z–A</option>
        <option value="new">Reciente primero</option>
        <option value="old">Antiguo primero</option>
      `;
      wrap.appendChild(sortSelect);
    }
  }

  // 4) Estado en memoria
  //    - restaurants: ahora es array de OBJETOS { name, createdAt }
  //    - orders: pedidos históricos
  let selectedRestaurant = null;
  let restaurants = [];
  let orders = [];
  let sortMode = localStorage.getItem('sortMode') || 'az';

  if (sortSelect) {
    sortSelect.value = sortMode;
    sortSelect.addEventListener('change', () => {
      sortMode = sortSelect.value;
      localStorage.setItem('sortMode', sortMode);
      renderRestaurants();
    });
  }

  // Utilidades de formato
  function pesos(n){
    return new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' })
      .format(n || 0);
  }

  // Resumen en el modal de Historial
  function fmtSummary(){
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
    for (const [name,data] of Object.entries(byRest)){
      summaryEl.insertAdjacentHTML('beforeend',
        `<span class="pill">${name}: ${data.count} · ${pesos(data.total)}</span>`);
    }
  }

  // Ordenar lista local según sortMode
  function sortRestaurants(arr){
    const a = arr.slice();
    if (sortMode === 'az')  a.sort((x,y)=>x.name.localeCompare(y.name));
    if (sortMode === 'za')  a.sort((x,y)=>y.name.localeCompare(x.name));
    if (sortMode === 'new') a.sort((x,y)=>new Date(y.createdAt)-new Date(x.createdAt));
    if (sortMode === 'old') a.sort((x,y)=>new Date(x.createdAt)-new Date(y.createdAt));
    return a;
  }

  // Pintar botones de restaurantes (+ icono borrar)
  function renderRestaurants(){
    restaurantList.innerHTML = '';
    const data = sortRestaurants(restaurants);
    data.forEach(r => {
      const row = document.createElement('div');
      row.style.position = 'relative';

      // Botón grande: registrar pedido para ese restaurante
      const btn = document.createElement('button');
      btn.className = 'btn restaurant-btn';
      btn.textContent = r.name;
      btn.style.paddingRight = '42px';  // espacio para el icono ✕
      btn.addEventListener('click', async () => {
        const amount = parseFloat(amountInput.value || '0');
        if (isNaN(amount) || amount <= 0){
          alert('Ingresa un monto válido antes de registrar.');
          amountInput.focus();
          return;
        }
        selectedRestaurant = r.name; // por si usas el botón "Aceptar"
        await fetch('/.netlify/functions/add-order', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ restaurant: r.name, amount })
        });
        amountInput.value = '';
      });

      // Icono de borrar (✕) en la esquina derecha del botón
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Eliminar restaurante';
      del.className = 'btn';
      del.style.position = 'absolute';
      del.style.right = '6px';
      del.style.top = '6px';
      del.style.padding = '6px 10px';
      del.style.lineHeight = '1';
      del.addEventListener('click', async (e) => {
        e.stopPropagation(); // que no dispare el click del botón grande
        if (!confirm(`¿Eliminar "${r.name}"? (No borra pedidos históricos)`)) return;
        await fetch('/.netlify/functions/delete-restaurant', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name: r.name })
        });
      });

      row.appendChild(btn);
      row.appendChild(del);
      restaurantList.appendChild(row);
    });
    statusEl.textContent = `Listo · ${restaurants.length} restaurantes`;
  }

  // Tabla del historial (del más reciente al más antiguo)
  function renderHistoryTable(){
    historyTableBody.innerHTML = '';
    for (const o of orders.slice().reverse()){
      const tr = document.createElement('tr');
      const dt = o.localTime || o.iso;
      tr.innerHTML = `<td>${dt}</td><td>${o.restaurant}</td><td>${pesos(o.amount)}</td>`;
      historyTableBody.appendChild(tr);
    }
  }

  // 5) Conexión Realtime (Ably) – auth por token (netlify function)
  const realtime = new window.Ably.Realtime.Promise({ authUrl: '/.netlify/functions/token' });
  const ordersChannel = realtime.channels.get('orders');
  const restaurantsChannel = realtime.channels.get('restaurants');

  // Cuando llega un pedido nuevo
  ordersChannel.subscribe('added', msg => {
    orders.push(msg.data);
    if (historyDialog.open) renderHistoryTable();
    statusEl.textContent = 'Actualizado en tiempo real';
  });

  // Sincronizar altas/bajas de restaurantes
  restaurantsChannel.subscribe('added', msg => {
    const name = msg.data.name;
    if (!restaurants.some(x => x.name === name)){
      restaurants.push({ name, createdAt: new Date().toISOString() });
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

  // 6) Carga inicial (normaliza strings antiguos -> objetos)
  async function loadInitial(){
    const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
    const data = await r.json();
    restaurants = (data.restaurants || []).map(x =>
      (typeof x === 'string') ? ({ name: x, createdAt: new Date().toISOString() }) : x
    );
    orders = data.orders || [];
    renderRestaurants();
  }
  await loadInitial();

  // 7) Eventos de UI

  // Agregar restaurante (pide nombre y lo crea)
  addRestaurantBtn.addEventListener('click', async () => {
    const name = prompt('Nombre del restaurante:')?.trim();
    if (!name) return;
    await fetch('/.netlify/functions/add-restaurant',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name })
    });
  });

  // Abrir historial (recarga datos para asegurar totales)
  historyBtn.addEventListener('click', async () => {
    const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
    const data = await r.json();
    orders = data.orders || [];
    renderHistoryTable();
    fmtSummary();
    historyDialog.showModal();
  });
  closeHistory.addEventListener('click', ()=> historyDialog.close());

  // Botón "Aceptar": registra para el último restaurante tocado
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
