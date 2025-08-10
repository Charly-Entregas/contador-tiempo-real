// app.v2.js — App completa (Ably + Netlify Functions + Gráficas en modal + Historial con paginación/acciones)
// + Filtros para la gráfica histórica: rango De/Al, Reporte mensual, Reporte anual, y resumen.

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
  const chartsBtn        = document.getElementById('chartsBtn');
  const excelBtn         = document.getElementById('excelBtn');
  const statusEl         = document.getElementById('status');

  // Historial
  const historyDialog    = document.getElementById('historyDialog');
  const closeHistory     = document.getElementById('closeHistory');
  const historyTableBody = document.querySelector('#historyTable tbody');
  const summaryEl        = document.getElementById('summary');
  const historySortSel   = document.getElementById('historySort');
  const pgPrev           = document.getElementById('pgPrev');
  const pgNext           = document.getElementById('pgNext');
  const pgNums           = document.getElementById('pgNums');

  // Restaurantes: selector de orden
  const sortSelect       = document.getElementById('sortSelect');

  // Gráficas (modal independiente)
  const chartsDialog         = document.getElementById('chartsDialog');
  const closeCharts          = document.getElementById('closeCharts');
  const chartsFilterBusiness = document.getElementById('chartsFilterBusiness');
  const chartsClearFilter    = document.getElementById('chartsClearFilter');
  const chartAllModeSel      = document.getElementById('chartAllMode');

  // Filtros de la sección HISTÓRICA (solo para chartAll)
  const histFrom    = document.getElementById('histFrom');
  const histTo      = document.getElementById('histTo');
  const histMonth   = document.getElementById('histMonth');
  const histYear    = document.getElementById('histYear');
  const btnMonthly  = document.getElementById('btnMonthly');
  const btnAnnual   = document.getElementById('btnAnnual');
  const histSummary = document.getElementById('histSummary');

  // ────────────────────────────────────────────────────────────────────────────
  // 3) Estado
  // ────────────────────────────────────────────────────────────────────────────
  let selectedRestaurant = null;
  let restaurants = []; // objetos { name, createdAt }
  let orders = [];      // { id, restaurant, amount, iso, localTime }

  // Orden restaurantes
  let sortMode = localStorage.getItem('sortMode') || 'az';
  if (sortSelect) {
    sortSelect.value = sortMode;
    sortSelect.addEventListener('change', () => {
      sortMode = sortSelect.value;
      localStorage.setItem('sortMode', sortMode);
      renderRestaurants();
      fillBusinessFilter(); // para el filtro de gráficas
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

  // Filtro de negocio para las gráficas (único)
  let chartsBusiness = ''; // '' = todos
  chartsFilterBusiness?.addEventListener('change', () => {
    chartsBusiness = chartsFilterBusiness.value || '';
    updateCharts();
    updateAllChart();
  });
  chartsClearFilter?.addEventListener('click', () => {
    chartsBusiness = '';
    if (chartsFilterBusiness) chartsFilterBusiness.value = '';
    updateCharts();
    updateAllChart();
  });

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
    if (sortMode === 'new') a.sort((x,y)=> Date.parse(y.createdAt||0) - Date.parse(x.createdAt||0)).reverse();
    if (sortMode === 'old') a.sort((x,y)=> Date.parse(x.createdAt||0) - Date.parse(y.createdAt||0));
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
      btn.style.paddingRight = '42px';
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

  // Llenar opciones del filtro de negocio para gráficas
  function fillBusinessFilter(){
    if (!chartsFilterBusiness) return;
    const set = new Set(restaurants.map(r => r.name));
    const prev = chartsFilterBusiness.value;
    chartsFilterBusiness.innerHTML = `<option value="">(Todos)</option>` + Array.from(set).map(n => `<option value="${n}">${n}</option>`).join('');
    chartsFilterBusiness.value = prev || '';
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

  // Helpers de tiempo en MX
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
    return { ymd: `${y}-${m}-${day}`, hour: parseInt(hh,10), ym: `${y}-${m}` };
  }
  function todayYMD_MX(){ return mxParts(new Date().toISOString()).ymd; }

  // Semana actual (Lun..Dom)
  function weekYMDs_MX(){
    const today = new Date();
    const labelIdx = (iso) => {
      const nm = new Intl.DateTimeFormat('es-MX',{ timeZone: MX_TZ, weekday:'short'}).format(new Date(iso)).toLowerCase();
      if (nm.startsWith('lun')) return 0;
      if (nm.startsWith('mar')) return 1;
      if (nm.startsWith('mié')||nm.startsWith('mie')) return 2;
      if (nm.startsWith('jue')) return 3;
      if (nm.startsWith('vie')) return 4;
      if (nm.startsWith('sáb')||nm.startsWith('sab')) return 5;
      return 6;
    };
    const base = [];
    const idxToday = labelIdx(today.toISOString());
    for (let i=0;i<7;i++){
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - idxToday + i);
      base.push(mxParts(d.toISOString()).ymd);
    }
    return base;
  }

  // Instancias Chart
  let chartOrdersHour, chartOrdersWeek, chartRevenueHour, chartRevenueWeek, chartAll;

  function buildOrUpdate(holder, type, labels, data, title){
    if (!window.Chart) return;
    const cfg = {
      type,
      data: { labels, datasets: [{ label: title, data, borderWidth: 2, fill: type==='line' ? true : false, tension: 0.3 }] },
      options: {
        responsive: true,
        animation: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } }
      }
    };
    if (!holder.ref){
      holder.ref = new Chart(holder.ctx, cfg);
    } else {
      holder.ref.config.type = type;
      holder.ref.data.labels = labels;
      holder.ref.data.datasets[0].label = title;
      holder.ref.data.datasets[0].data = data;
      holder.ref.update();
    }
  }

  // Filtro por negocio (para órdenes)
  function filteredOrdersForCharts(){
    return chartsBusiness ? orders.filter(o => o.restaurant === chartsBusiness) : orders.slice();
  }

  // ───────────── NUEVO: utilidades de rango para la gráfica histórica ─────────
  function ymdToDateMX(ymd, endOfDay=false){
    const [y,m,d] = ymd.split('-').map(n=>parseInt(n,10));
    return new Date(Date.UTC(y, m-1, d, endOfDay?23:0, endOfDay?59:0, endOfDay?59:0));
  }
  function lastDayOfMonth(y, m){ return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function setRange(fromYMD, toYMD){
    if (histFrom) histFrom.value = fromYMD;
    if (histTo)   histTo.value   = toYMD;
    updateAllChart();
  }
  function setMonthlyRange(y, m){
    const d1 = `${y}-${String(m).padStart(2,'0')}-01`;
    const d2 = `${y}-${String(m).padStart(2,'0')}-${String(lastDayOfMonth(y,m)).padStart(2,'0')}`;
    setRange(d1, d2);
  }
  function setAnnualRange(y){
    setRange(`${y}-01-01`, `${y}-12-31`);
  }

  function ordersInSelectedRange(src){
    if (!histFrom?.value || !histTo?.value) return src;
    const from = ymdToDateMX(histFrom.value, false);
    const to   = ymdToDateMX(histTo.value, true);
    return src.filter(o => {
      const d = new Date(o.iso);
      return d >= from && d <= to;
    });
  }

  function fillYearsForHistory(){
    if (!histYear) return;
    const years = new Set();
    for (const o of orders){
      years.add(mxParts(o.iso).ymd.slice(0,4));
    }
    if (years.size === 0) years.add(new Date().getUTCFullYear().toString());
    const sorted = Array.from(years).sort();
    const current = new Date().getUTCFullYear().toString();
    histYear.innerHTML = sorted.map(y => `<option value="${y}" ${y===current?'selected':''}>${y}</option>`).join('');
  }
  // ──────────── FIN utilidades de rango para la gráfica histórica ─────────────

  function updateCharts(){
    const c1El = document.getElementById('chartOrdersHour');
    const c2El = document.getElementById('chartOrdersWeek');
    const c3El = document.getElementById('chartRevenueHour');
    const c4El = document.getElementById('chartRevenueWeek');
    if (!c1El || !c2El || !c3El || !c4El) return;

    const today = todayYMD_MX();
    const weekYMDs = weekYMDs_MX();
    const src = filteredOrdersForCharts();

    const countHour = HOURS.map(()=>0);
    const moneyHour = HOURS.map(()=>0);
    const countWeek = [0,0,0,0,0,0,0];
    const moneyWeek = [0,0,0,0,0,0,0];

    for (const o of src){
      const { ymd, hour } = mxParts(o.iso);
      const amount = Number(o.amount)||0;

      if (ymd === today && hour >= 8 && hour <= 24){
        const idx = HOURS.indexOf(hour);
        if (idx !== -1){ countHour[idx]++; moneyHour[idx] += amount; }
      }

      const idxDay = weekYMDs.indexOf(ymd);
      if (idxDay !== -1){ countWeek[idxDay]++; moneyWeek[idxDay] += amount; }
    }

    buildOrUpdate({get ref(){return chartOrdersHour}, set ref(v){chartOrdersHour=v}, ctx:c1El.getContext('2d')}, 'bar',  HOUR_LABELS,    countHour, 'Pedidos (hoy)');
    buildOrUpdate({get ref(){return chartOrdersWeek}, set ref(v){chartOrdersWeek=v}, ctx:c2El.getContext('2d')}, 'bar',  WEEKDAY_LABELS, countWeek, 'Pedidos (semana)');
    buildOrUpdate({get ref(){return chartRevenueHour}, set ref(v){chartRevenueHour=v}, ctx:c3El.getContext('2d')}, 'bar',  HOUR_LABELS,    moneyHour, 'MXN (hoy)');
    buildOrUpdate({get ref(){return chartRevenueWeek}, set ref(v){chartRevenueWeek=v}, ctx:c4El.getContext('2d')}, 'bar',  WEEKDAY_LABELS, moneyWeek, 'MXN (semana)');
  }

  // Gráfica histórica (primer pedido → último) + filtros de rango
  function updateAllChart(){
    const canvas = document.getElementById('chartAll');
    if (!canvas) return;

    const mode = chartAllModeSel?.value || 'negocio';
    // 1) Filtro por negocio
    let src = filteredOrdersForCharts();
    // 2) Filtro por rango (histórico)
    src = ordersInSelectedRange(src);

    // Resumen de rango
    const count = src.length;
    const total = src.reduce((a,b)=> a + (Number(b.amount)||0), 0);
    const niceRange =
      (histFrom?.value && histTo?.value)
      ? ` (${histFrom.value} → ${histTo.value})`
      : '';
    if (histSummary){
      histSummary.innerHTML = `<span class="pill"><strong>${count}</strong> viajes${niceRange}</span> <span class="pill"><strong>Total:</strong> ${pesos(total)}</span>`;
    }

    // Construcciones por modo
    if (mode === 'negocio'){
      const map = new Map();
      src.forEach(o => map.set(o.restaurant, (map.get(o.restaurant)||0)+1));
      const labels = Array.from(map.keys());
      const data = Array.from(map.values());
      buildOrUpdate({get ref(){return chartAll}, set ref(v){chartAll=v}, ctx:canvas.getContext('2d')}, 'bar', labels, data, 'Pedidos por negocio');
      return;
    }

    if (mode === 'dia-semana'){
      const labels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
      const data = [0,0,0,0,0,0,0];
      for (const o of src){
        const wd = new Intl.DateTimeFormat('es-MX',{ timeZone: MX_TZ, weekday:'short'}).format(new Date(o.iso)).toLowerCase();
        const i = wd.startsWith('lun')?0:wd.startsWith('mar')?1:(wd.startsWith('mié')||wd.startsWith('mie'))?2:wd.startsWith('jue')?3:wd.startsWith('vie')?4:(wd.startsWith('sáb')||wd.startsWith('sab'))?5:6;
        data[i] += 1;
      }
      buildOrUpdate({get ref(){return chartAll}, set ref(v){chartAll=v}, ctx:canvas.getContext('2d')}, 'bar', labels, data, 'Pedidos por día de la semana');
      return;
    }

    if (mode === 'hora-dia'){
      const labels = Array.from({length:24}, (_,i)=> (i<10?'0'+i:String(i)));
      const data = Array.from({length:24}, ()=>0);
      for (const o of src){
        const h = mxParts(o.iso).hour;
        data[h] += 1;
      }
      buildOrUpdate({get ref(){return chartAll}, set ref(v){chartAll=v}, ctx:canvas.getContext('2d')}, 'bar', labels, data, 'Pedidos por hora del día');
      return;
    }

    if (mode === 'acumulado'){
      const points = src.slice().sort((a,b)=>Date.parse(a.iso)-Date.parse(b.iso));
      let sum = 0;
      const labels = [];
      const data = [];
      for (const o of points){
        sum += Number(o.amount)||0;
        labels.push(mxParts(o.iso).ymd);
        data.push(sum);
      }
      buildOrUpdate({get ref(){return chartAll}, set ref(v){chartAll=v}, ctx:canvas.getContext('2d')}, 'line', labels, data, 'Ingresos acumulados');
      return;
    }

    // mode === 'ganancias' → por mes
    {
      const monthMap = new Map(); // 'YYYY-MM' -> sum
      for (const o of src){
        const { ym } = mxParts(o.iso);
        monthMap.set(ym, (monthMap.get(ym)||0) + (Number(o.amount)||0));
      }
      const labels = Array.from(monthMap.keys()).sort();
      const data = labels.map(k => monthMap.get(k));
      buildOrUpdate({get ref(){return chartAll}, set ref(v){chartAll=v}, ctx:canvas.getContext('2d')}, 'bar', labels, data, 'Ganancias por mes');
    }
  }

  chartAllModeSel?.addEventListener('change', () => updateAllChart());

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
    }
    if (chartsDialog.open) {
      updateCharts();
      updateAllChart();
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
    }
    if (chartsDialog.open) {
      updateCharts();
      updateAllChart();
    }
  });

  ordersChannel.subscribe('removed', msg => {
    const { id } = msg.data;
    orders = orders.filter(o => o.id !== id);
    if (historyDialog.open) {
      renderHistoryTable();
      fmtSummary();
    }
    if (chartsDialog.open) {
      updateCharts();
      updateAllChart();
    }
  });

  // Restaurantes
  restaurantsChannel.subscribe('added', msg => {
    const { name, createdAt } = msg.data;
    if (!restaurants.some(x => x.name === name)){
      restaurants.push({ name, createdAt: createdAt || new Date().toISOString() });
      renderRestaurants();
      fillBusinessFilter();
      statusEl.textContent = 'Restaurantes sincronizados';
    }
  });

  restaurantsChannel.subscribe('removed', msg => {
    const name = msg.data.name;
    restaurants = restaurants.filter(x => x.name !== name);
    renderRestaurants();
    fillBusinessFilter();
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
    fillBusinessFilter();
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

  // Abrir Historial
  async function openHistory(){
    const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
    const data = await r.json();
    orders = data.orders || [];
    page = 1;
    renderHistoryTable();
    fmtSummary();
    historyDialog.showModal();
  }
  historyBtn.addEventListener('click', openHistory);
  closeHistory.addEventListener('click', () => historyDialog.close());

  // Abrir Gráficas
  async function openCharts(){
    if (!orders.length){
      const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
      const data = await r.json();
      orders = data.orders || [];
    }

    // Inicializa años y rango por defecto (mes actual) si está vacío
    fillYearsForHistory();
    if (histFrom && !histFrom.value && histYear && histMonth){
      const now = new Date();
      histYear.value  = String(now.getUTCFullYear());
      histMonth.value = String(now.getUTCMonth()+1);
      setMonthlyRange(parseInt(histYear.value,10), parseInt(histMonth.value,10));
    }

    updateCharts();
    updateAllChart();
    chartsDialog.showModal();
  }
  chartsBtn?.addEventListener('click', openCharts);
  closeCharts?.addEventListener('click', () => chartsDialog.close());

  // Filtros del histórico (inputs y botones)
  histFrom?.addEventListener('change', () => updateAllChart());
  histTo?.addEventListener('change',   () => updateAllChart());
  btnMonthly?.addEventListener('click', () => {
    const y = parseInt(histYear.value || new Date().getUTCFullYear(), 10);
    const m = parseInt(histMonth.value || (new Date().getUTCMonth()+1), 10);
    setMonthlyRange(y, m);
    // Resumen con estilo “en Mes Año”
    const src = ordersInSelectedRange(filteredOrdersForCharts());
    const count = src.length;
    const total = src.reduce((a,b)=>a+(Number(b.amount)||0),0);
    const nombreMes = histMonth.options[histMonth.selectedIndex].textContent;
    if (histSummary){
      histSummary.innerHTML =
        `<span class="pill"><strong>${count}</strong> viajes en ${nombreMes} ${y}</span> <span class="pill"><strong>Total:</strong> ${pesos(total)}</span>`;
    }
  });
  btnAnnual?.addEventListener('click', () => {
    const y = parseInt(histYear.value || new Date().getUTCFullYear(), 10);
    setAnnualRange(y);
    const src = ordersInSelectedRange(filteredOrdersForCharts());
    const count = src.length;
    const total = src.reduce((a,b)=>a+(Number(b.amount)||0),0);
    if (histSummary){
      histSummary.innerHTML =
        `<span class="pill"><strong>${count}</strong> viajes en ${y}</span> <span class="pill"><strong>Total:</strong> ${pesos(total)}</span>`;
    }
  });

  // Exportar a CSV (Excel)
  excelBtn?.addEventListener('click', async () => {
    if (!orders?.length) {
      const r = await fetch('/.netlify/functions/get-state', { cache: 'no-store' });
      const data = await r.json();
      orders = data.orders || [];
    }
    const header = ['Fecha (MX)','ISO','Restaurante','Monto'];
    const rows = orders.map(o => [
      (o.localTime || ''), (o.iso || ''), (o.restaurant || ''), String(o.amount ?? '')
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();
