// app.v2.js — App completa (Ably + Netlify Functions + Gráficas + Historial con paginación y acciones)

(async () => {
  // ────────────────────────────────────────────────────────────────────────────
  // 1) Cargar Ably (navegador) desde CDN
  // ────────────────────────────────────────────────────────────────────────────
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.ably.com/lib/ably.min-1.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2) Referencias UI
  // ────────────────────────────────────────────────────────────────────────────
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

  // Selector de orden (restaurantes)
  const sortSelect       = document.getElementById('sortSelect');

  // Filtros de historial + paginador
  const historySortSel   = document.getElementById('historySort');
  const pgPrev           = document.getElementById('pgPrev');
  const pgNext           = document.getElementById('pgNext');
  const pgNums           = document.getElementById('pgNums');

  // ────────────────────────────────────────────────────────────────────────────
  // 3) Estado
  // ────────────────────────────────────────────────────────────────────────────
  let selectedRestaurant = null;
  // Restaurantes como objetos { name, createdAt }
  let restaurants = [];
  // Pedidos: { id, restaurant, amount, iso, localTime }
  let orders = [];

  // Orden restaurantes
  let sortMode = localStorage.getItem('sortMode') || 'az';
  if (sortSelect) {
    sortSelect.value = sortMode;
    sortSelect.addEventListener('change', () => {
      sortMode = sortSelect.value;
      localStorage.setItem('sortMode', sortMode);
      renderRestaurants();
    });
  }

  // Historial: orden y paginación
  const PAGE_SIZE = 20;
  let historySort = localStorage.getItem('historySort') || 'date_desc';
  let page = 1;

  if (historySortSel){
    historySortSel.value = historySort;
    historySortSel.addEventListener('change', () => {
      historySort = historySortSel.value;
      localStorage.setItem('historySort', historySort);
      page = 1;
      renderHistoryTable();
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4) Utilidades
  // ────────────────────────────────────────────────────────────────────────────
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

  // Orden de restaurantes
  function sortRestaurants(arr){
    const a = arr.slice();
    if (sortMode === 'az')  a.sort((x,y)=> x.name.localeCompare(y.name));
    if (sortMode === 'za')  a.sort((x,y)=> y.name.localeCompare(x.name));
    if (sortMode === 'new') a.sort((x,y)=> Date.parse(y.createdAt||0) - Date.parse(x.createdAt||0)).reverse(); // reciente primero
    if (sortMode === 'old') a.sort((x,y)=> Date.parse(x.createdAt||0) - Date.parse(y.createdAt||0));          // antiguo primero
    return a;
  }

  // Pintar lista de restaurantes + borrar
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

      // Icono borrar restaurante
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

  // Orden de pedidos (historial)
  function sortOrders(data){
    const a = data.slice();
    if (historySort === 'date_desc') a.sort((x,y)=> Date.parse(y.iso)-Date.parse(x.iso));
    if (historySort === 'date_asc')  a.sort((x,y)=> Date.parse(x.iso)-Date.parse(y.iso));
    if (historySort === 'name_az')   a.sort((x,y)=> x.restaurant.localeCompare(y.restaurant));
    if (historySort === 'name_za')   a.sort((x,y)=> y.restaurant.localeCompare(x.restaurant));
    return a;
  }

  function renderPager(total){
    if (!pgPrev || !pgNext || !pgNums) return;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    pgNums.innerHTML = '';
    for (let i=1;i<=pages;i++){
      const b = document.createElement('button');
      b.className = 'btn btn-xs';
      b.textContent = i;
      if (i === page) b.style.background = '#2a2f3a';
      b.addEventListener('click', ()=>{ page = i; renderHistoryTable(); });
      pgNums.appendChild(b);
    }
    pgPrev.onclick = ()=>{ if (page>1){ page--; renderHistoryTable(); } };
    pgNext.onclick = ()=>{ if (page<pages){ page++; renderHistoryTable(); } };
  }

  // Tabla del historial (paginada)
  function renderHistoryTable(){
    const sorted = sortOrders(orders);
    const start = (page-1)*PAGE_SIZE;
    const slice = sorted.slice(start, start+PAGE_SIZE);

    historyTableBody.innerHTML = '';
    for (const o of slice){
      const tr = document.createElement('tr');
      const dt = o.localTime || o.iso;

      const tdDate = document.createElement('td'); tdDate.textContent = dt;
      const tdRest = document.createElement('td'); tdRest.textContent = o.restaurant;
      const tdAmt  = document.createElement('td'); tdAmt.textContent  = pesos(o.amount);

      // Acciones: Editar / Eliminar
      const tdAct  = document.createElement('td');
      const bEdit = document.createElement('button'); bEdit.className='btn btn-xs'; bEdit.title='Editar'; bEdit.textContent='✎';
      const bDel  = document.createElement('button'); bDel.className='btn btn-xs';  bDel.title='Eliminar'; bDel.textContent='🗑';

      bEdit.addEventListener('click', async ()=>{
        const newRest = prompt('Restaurante:', o.restaurant);
        if (newRest == null) return;
        const newAmt  = prompt('Monto:', o.amount);
        if (newAmt == null) return;
        const amount = Number(newAmt);
        if (Number.isNaN(amount) || amount<=0){ alert('Monto inválido'); return; }
        await fetch('/.netlify/functions/update-order', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id:o.id, restaurant:newRest.trim(), amount })
        });
      });

      bDel.addEventListener('click', async ()=>{
        if (!confirm('¿Eliminar este pedido?')) return;
        await fetch('/.netlify/functions/delete-order', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id:o.id })
        });
      });

      tdAct.appendChild(bEdit); tdAct.appendChild(bDel);
      tr.append(tdDate, tdRest, tdAmt, tdAct);
      historyTableBody.appendChild(tr);
    }

    renderPager(orders.length);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5) Gráficas (Chart.js)
  // ────────────────────────────────────────────────────────────────────────────
  const MX_TZ = 'America/Mexico_City';
  const HOURS = Array.from({length:17}, (_,i)=>i+8); // 8..24
  const HOUR_LABELS = HOURS.map(h => (h < 10 ? '0'+h : ''+h));
  const WEEKDAY_LABELS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  function mxParts(iso){
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('es-MX', {
      timeZone: MX_TZ, hour12:false,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit'
    }).formatToParts(d);
    const y = parts.find(p=>p.type==='year').value;
    const m = parts.find(p=>p.type==='month').value;
    const day = parts.find(p=>p.type==='day').value;
    const hh = parts.find(p=>p.type==='hour').value;
    return { ymd: `${y}-${m}-${day}`, hour: parseInt(hh,10) };
  }

  function mxWeekdayIndex(iso){ // 0=Mon .. 6=Sun
    const s = new Intl.DateTimeFormat('es-MX',{ timeZone: MX_TZ, weekday:'short'}).format(new Date(iso)).toLowerCase();
    if (s.startsWith('lun')) return 0;
    if (s.startsWith('mar')) return 1;
    if (s.startsWith('mié') || s.startsWith('mie')) return 2;
    if (s.startsWith('jue')) return 3;
    if (s.startsWith('vie')) return 4;
    if (s.startsWith('sáb') || s.startsWith('sab')) return 5;
    return 6; // dom
  }

  function todayYMD_MX(){
    return mxParts(new Date().toISOString()).ymd;
  }

  function weekYMDs_MX(){ // YMDs de la semana actual (Lun..Dom) en MX
    const now = new Date();
    const todayIdx = mxWeekdayIndex(now.toISOString()); // 0..6
    const out = [];
    for (let i=0; i<7; i++){
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - todayIdx + i);
      out.push(mxParts(d.toISOString()).ymd);
    }
    return out;
  }

  let chartOrdersHour, chartOrdersWeek, chartRevenueHour, chartRevenueWeek;

  function buildOrUpdateChart(holder, ctx, labels, data, title){
    if (!window.Chart) return; // por si Chart.js no cargó
    const cfg = {
      type: 'bar',
      data: { labels, datasets: [{ label: title, data }] },
      options: {
        responsive: true,
        animation: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } }
      }
    };
    if (!holder.ref){
      holder.ref = new Chart(ctx, cfg);
    } else {
      holder.ref.data.labels = labels;
      holder.ref.data.datasets[0].data = data;
      holder.ref.update();
    }
  }

  function updateCharts(){
    const c1El = document.getElementById('chartOrdersHour');
    const c2El = document.getElementById('chartOrdersWeek');
    const c3El = document.getElementById('chartRevenueHour');
    const c4El = document.getElementById('chartRevenueWeek');
    if (!c1El || !c2El || !c3El || !c4El) return; // aún no se abrió el modal

    const today = todayYMD_MX();
    const weekYMDs = weekYMDs_MX();

    const countHour = HOURS.map(()=>0);
    const moneyHour = HOURS.map(()=>0);
    const countWeek = [0,0,0,0,0,0,0];
    const moneyWeek = [0,0,0,0,0,0,0];

    for (const o of orders){
      const { ymd, hour } = mxParts(o.iso);
      const amount = Number(o.amount)||0;

      // Diario (solo hoy 08–24)
      if (ymd === today && hour >= 8 && hour <= 24){
        const idx = HOURS.indexOf(hour);
        if (idx !== -1){ countHour[idx]++; moneyHour[idx] += amount; }
      }

      // Semanal (semana actual, Lun..Dom)
      const idxDay = weekYMDs.indexOf(ymd);
      if (idxDay !== -1){ countWeek[idxDay]++; moneyWeek[idxDay] += amount; }
    }

    buildOrUpdateChart({get ref(){return chartOrdersHour}, set ref(v){chartOrdersHour=v;}}, c1El.getContext('2d'), HOUR_LABELS, countHour, 'Pedidos (hoy)');
    buildOrUpdateChart({get ref(){return chartOrdersWeek}, set ref(v){chartOrdersWeek=v;}}, c2El.getContext('2d'), WEEKDAY_LABELS, countWeek, 'Pedidos (semana)');
    buildOrUpdateChart({get ref(){return chartRevenueHour}, set ref(v){chartRevenueHour=v;}}, c3El.getContext('2d'), HOUR_LABELS, moneyHour, 'MXN (hoy)');
    buildOrUpdateChart({get ref(){return chartRevenueWeek}, set ref(v){chartRevenueWeek=v;}}, c4El.getContext('2d'), WEEKDAY_LABELS, moneyWeek, 'MXN (semana)');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 6) Realtime (Ably)
  // ────────────────────────────────────────────────────────────────────────────
  const realtime = new window.Ably.Realtime.Promise({ authUrl: '/.netlify/functions/token' });
  const ordersChannel = realtime.channels.get('orders');
  const restaurantsChannel = realtime.channels.get('restaurants');

  // Pedidos
  ordersChannel.subscribe('added', msg => {
    orders.push(msg.data);
    if (historyDialog.open) {
      renderHistoryTable();
      fmtSummary();
      updateCharts(); // refresca gráficas en vivo si el modal está abierto
    }
    statusEl.textContent = 'Actualizado en tiempo real';
  });

  ordersChannel.subscribe('updated', msg => {
    const u = msg.data;
    const i = orders.findIndex(o => o.id === u.id);
    if (i !== -1) orders[i] = u;
    if (historyDialog.open) {
      renderHistoryTable();
      fmtSummary();
      updateCharts();
    }
  });

  ordersChannel.subscribe('removed', msg => {
    const { id } = msg.data;
    orders = orders.filter(o => o.id !== id);
    if (historyDialog.open) {
      renderHistoryTable();
      fmtSummary();
      updateCharts();
    }
  });

  // Restaurantes
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

  // ────────────────────────────────────────────────────────────────────────────
  // 7) Carga inicial
  // ────────────────────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────────────────────
  // 8) Eventos de UI
  // ────────────────────────────────────────────────────────────────────────────
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
    page = 1;                 // abrir siempre en página 1
    renderHistoryTable();
    fmtSummary();
    updateCharts();           // dibuja/actualiza gráficas al abrir
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


