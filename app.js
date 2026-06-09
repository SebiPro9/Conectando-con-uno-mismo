// ============================================================
// CONECTANDO CON UNO MISMO — app.js
// ============================================================

const SUPABASE_URL      = 'https://ifqiqiocbaiwpvvnimeb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmcWlxaW9jYmFpd3B2dm5pbWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NzUxMjIsImV4cCI6MjA5NjQ1MTEyMn0.wHW1XmZ_mF1718OxNsM3pswrpArMTvaqO6h9inuV3u8';
const ADMIN_PASSWORD    = 'admin123';
const SESSION_KEY       = 'ccum_session';

// ────────────────────────────────────────────────────────────
// SUPABASE — cliente mínimo
// ────────────────────────────────────────────────────────────
const sb = {
  async query(table, options = {}) {
    const { method = 'GET', body, params = {} } = options;
    const qs = new URLSearchParams(params).toString();
    const url = `${SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    if (res.status === 204) return [];
    return res.json();
  },
  select(table, params = {}) { return this.query(table, { method: 'GET', params }); },
  insert(table, data)        { return this.query(table, { method: 'POST', body: data }); },
  update(table, data, params){ return this.query(table, { method: 'PATCH', body: data, params }); },
  delete(table, params = {}) { return this.query(table, { method: 'DELETE', params }); },
};

// ────────────────────────────────────────────────────────────
// UTILIDADES
// ────────────────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function argentinaDate(offsetDays = 0) {
  const now = new Date();
  const ar = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  ar.setDate(ar.getDate() + offsetDays);
  const y = ar.getFullYear();
  const m = String(ar.getMonth() + 1).padStart(2, '0');
  const d = String(ar.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function today()     { return argentinaDate(0);  }
function yesterday() { return argentinaDate(-1); }

function fmtDate(d) {
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const [y, mo, dd] = d.split('-');
  return `${parseInt(dd)} de ${meses[parseInt(mo) - 1]} de ${y}`;
}
function greet() {
  const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })).getHours();
  return h < 12 ? 'Buenos días ☀️' : h < 19 ? 'Buenas tardes 🌤️' : 'Buenas noches 🌙';
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function norm(n)     { return n.trim().toLowerCase(); }
function initials(n) { return n.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2); }
function fmtTime(mins) {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Determina si un entry tiene actividad real visible para el admin
function hasActivity(e) {
  return (e.unlocks > 0) || (e.objetivo && e.objetivo.trim()) || (e.tiempo_mins !== null && e.tiempo_mins !== undefined);
}

// ────────────────────────────────────────────────────────────
// ESTADO
// ────────────────────────────────────────────────────────────
let me = null;         // { id, name, name_key }
let pastOpen = false;
let entriesCache = {}; // { 'YYYY-MM-DD': entry }

// ────────────────────────────────────────────────────────────
// SESIÓN PERSISTENTE
// ────────────────────────────────────────────────────────────
function saveSession(user) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch(e) {}
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e) { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
}

// ────────────────────────────────────────────────────────────
// UI HELPERS
// ────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  ['login-err','reg-err','admin-err','new-err'].forEach(e => {
    const el = document.getElementById(e);
    if (el) el.style.display = 'none';
  });
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function setLoading(show, msg = 'Cargando...') {
  const ov = document.getElementById('loading-ov');
  const txt = document.getElementById('loading-txt');
  if (txt) txt.textContent = msg;
  ov.classList.toggle('show', show);
}

function disableBtn(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.disabled = disabled;
}

// ────────────────────────────────────────────────────────────
// AUTH — REGISTRO
// ────────────────────────────────────────────────────────────
async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const err  = document.getElementById('reg-err');

  if (!name || pass.length < 4) {
    err.textContent = 'Completá todos los campos (contraseña mín. 4 caracteres).';
    err.style.display = 'block';
    return;
  }

  const nameKey = norm(name);
  setLoading(true, 'Creando cuenta...');
  disableBtn('reg-btn', true);

  try {
    const existing = await sb.select('users', { name_key: `eq.${nameKey}`, select: 'id' });
    if (existing.length > 0) {
      err.textContent = 'Ese nombre ya existe. Probá variando la ortografía.';
      err.style.display = 'block';
      return;
    }
    const passwordHash = await sha256(pass);
    await sb.insert('users', { name, name_key: nameKey, password_hash: passwordHash });
    err.style.display = 'none';
    toast('¡Cuenta creada!');
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-pass').value = '';
    showScreen('login-screen');
  } catch (e) {
    err.textContent = 'Error al crear cuenta. Intentá de nuevo.';
    err.style.display = 'block';
    console.error('Register error:', e);
  } finally {
    setLoading(false);
    disableBtn('reg-btn', false);
  }
}

// ────────────────────────────────────────────────────────────
// AUTH — LOGIN
// ────────────────────────────────────────────────────────────
async function doLogin() {
  const name = document.getElementById('login-name').value.trim();
  const pass = document.getElementById('login-pass').value;
  const keep = document.getElementById('keep-session').checked;
  const err  = document.getElementById('login-err');

  if (!name || !pass) { err.style.display = 'block'; return; }

  setLoading(true, 'Iniciando sesión...');
  disableBtn('login-btn', true);

  try {
    const nameKey = norm(name);
    const passwordHash = await sha256(pass);
    const users = await sb.select('users', {
      name_key:      `eq.${nameKey}`,
      password_hash: `eq.${passwordHash}`,
    });

    if (!users.length) {
      err.style.display = 'block';
      return;
    }

    err.style.display = 'none';
    me = { id: users[0].id, name: users[0].name, name_key: users[0].name_key };

    if (keep) saveSession(me);
    else clearSession();

    await openDash();
  } catch (e) {
    err.textContent = 'Error de conexión. Intentá de nuevo.';
    err.style.display = 'block';
    console.error('Login error:', e);
  } finally {
    setLoading(false);
    disableBtn('login-btn', false);
  }
}

// ────────────────────────────────────────────────────────────
// AUTH — LOGOUT
// ────────────────────────────────────────────────────────────
function doLogout() {
  clearSession();
  me = null;
  entriesCache = {};
  pastOpen = false;
  showScreen('landing');
}

// ────────────────────────────────────────────────────────────
// AUTH — ADMIN
// ────────────────────────────────────────────────────────────
async function doAdminAuth() {
  const pass = document.getElementById('admin-pass').value;
  if (pass !== ADMIN_PASSWORD) {
    document.getElementById('admin-err').style.display = 'block';
    return;
  }
  document.getElementById('admin-pass').value = '';
  document.getElementById('admin-err').style.display = 'none';
  await openAdmin();
}

// ────────────────────────────────────────────────────────────
// ENTRIES — obtener o crear
// ────────────────────────────────────────────────────────────
async function getOrCreateEntry(date) {
  if (entriesCache[date]) return entriesCache[date];

  const rows = await sb.select('entries', {
    user_id: `eq.${me.id}`,
    date:    `eq.${date}`,
  });

  if (rows.length > 0) {
    entriesCache[date] = rows[0];
    return rows[0];
  }

  const created = await sb.insert('entries', {
    user_id: me.id,
    date,
    unlocks: 0,
    goal: 50,
    objetivo: null,
    tiempo_mins: null,
  });
  entriesCache[date] = created[0];
  return created[0];
}

// ────────────────────────────────────────────────────────────
// DASHBOARD — abrir
// ────────────────────────────────────────────────────────────
async function openDash() {
  showScreen('dashboard');
  document.getElementById('dash-nm').textContent = me.name;
  document.getElementById('dash-hi').textContent = greet();
  pastOpen = false;
  document.getElementById('past-days-list').style.display = 'none';
  document.getElementById('past-arrow').textContent = '›';

  setLoading(true, 'Cargando datos...');
  try {
    // Cargar TODOS los entries del usuario (para poder editar cualquier fecha pasada)
    const rows = await sb.select('entries', {
      user_id: `eq.${me.id}`,
      order:   'date.asc',
    });
    entriesCache = {};
    rows.forEach(r => { entriesCache[r.date] = r; });
  } catch (e) {
    console.error('Load entries error:', e);
  } finally {
    setLoading(false);
  }

  await refreshDash();
}

// ────────────────────────────────────────────────────────────
// DASHBOARD — refrescar
// ────────────────────────────────────────────────────────────
async function refreshDash() {
  const e = await getOrCreateEntry(today());

  const pct = Math.min(100, Math.round(e.unlocks / e.goal * 100));
  document.getElementById('unlock-count').textContent = e.unlocks;
  document.getElementById('unlock-goal').textContent  = e.goal;

  const bar = document.getElementById('cbar');
  bar.style.width = pct + '%';
  bar.style.background = pct >= 100
    ? 'linear-gradient(90deg,#ef4444,#b91c1c)'
    : pct >= 75
    ? 'linear-gradient(90deg,#f59e0b,#d97706)'
    : 'linear-gradient(90deg,#4ade80,#22c55e)';

  const hint = document.getElementById('chint');
  if (pct >= 100)           hint.textContent = '⚠️ Superaste tu meta diaria';
  else if (pct >= 75)       hint.textContent = `⚠️ ¡Cuidado! Te quedan solo ${e.goal - e.unlocks}`;
  else if (e.unlocks === 0) hint.textContent = 'Empezá el día con conciencia';
  else                      hint.textContent = `Te quedan ${e.goal - e.unlocks} desbloqueos dentro de tu meta`;

  if (e.objetivo) {
    document.getElementById('obj-text-display').textContent = e.objetivo;
    document.getElementById('obj-date').textContent = fmtDate(today());
    document.getElementById('obj-edit-hint').style.display = 'flex';
    document.getElementById('obj-ta').value = e.objetivo;
  } else {
    document.getElementById('obj-text-display').innerHTML = '<span class="obj-empty-hint">Tocá para escribir tu objetivo de hoy</span>';
    document.getElementById('obj-date').textContent = '';
    document.getElementById('obj-edit-hint').style.display = 'none';
  }

  const ayerEntry = entriesCache[yesterday()];
  const needsBanner = ayerEntry && ayerEntry.tiempo_mins === null;
  document.getElementById('ayer-banner').style.display = needsBanner ? 'flex' : 'none';

  renderTiempoHoy();
  if (pastOpen) renderPastDays();
}

// ────────────────────────────────────────────────────────────
// OBJETIVO HOY
// ────────────────────────────────────────────────────────────
function toggleObjEdit(open) {
  document.getElementById('obj-edit-area').style.display = open ? 'block' : 'none';
  document.getElementById('obj-view').style.display      = open ? 'none'  : 'block';
  if (open) document.getElementById('obj-ta').focus();
}

async function saveObjetivo() {
  const text = document.getElementById('obj-ta').value.trim();
  if (!text) { toast('Escribí tu objetivo primero'); return; }
  setLoading(true, 'Guardando...');
  try {
    const e = await getOrCreateEntry(today());
    const updated = await sb.update('entries', { objetivo: text }, { id: `eq.${e.id}` });
    entriesCache[today()] = updated[0];
    toggleObjEdit(false);
    toast('✨ Objetivo guardado');
    await refreshDash();
  } catch (err) {
    toast('Error al guardar. Intentá de nuevo.');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

// ────────────────────────────────────────────────────────────
// DESBLOQUEOS HOY
// ────────────────────────────────────────────────────────────
async function addUnlock() {
  const btn = document.getElementById('unlock-btn');
  btn.disabled = true;
  btn.classList.add('flash');
  setTimeout(() => btn.classList.remove('flash'), 350);
  try {
    const e = await getOrCreateEntry(today());
    const updated = await sb.update('entries', { unlocks: e.unlocks + 1 }, { id: `eq.${e.id}` });
    entriesCache[today()] = updated[0];
    toast('✓ Desbloqueo registrado');
    await refreshDash();
  } catch (err) {
    toast('Error al registrar. Intentá de nuevo.');
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

// ────────────────────────────────────────────────────────────
// META MODAL (hoy)
// ────────────────────────────────────────────────────────────
async function openMetaModal() {
  const e = await getOrCreateEntry(today());
  document.getElementById('meta-input').value = e.goal;
  document.getElementById('meta-modal').classList.add('open');
}
function closeMM() { document.getElementById('meta-modal').classList.remove('open'); }
async function saveMM() {
  const v = parseInt(document.getElementById('meta-input').value);
  if (!v || v < 1) { toast('Ingresá un número válido'); return; }
  setLoading(true, 'Guardando meta...');
  try {
    const e = await getOrCreateEntry(today());
    const updated = await sb.update('entries', { goal: v }, { id: `eq.${e.id}` });
    entriesCache[today()] = updated[0];
    closeMM();
    toast('Meta actualizada');
    await refreshDash();
  } catch (err) {
    toast('Error al guardar. Intentá de nuevo.');
    console.error(err);
  } finally {
    setLoading(false);
  }
}
document.getElementById('meta-modal').addEventListener('click', function(e) {
  if (e.target === this) closeMM();
});

// ────────────────────────────────────────────────────────────
// TIEMPO HOY
// ────────────────────────────────────────────────────────────
function renderTiempoHoy() {
  const e = entriesCache[today()];
  const mins = e ? e.tiempo_mins : null;
  document.getElementById('tiempo-hoy-wrap').innerHTML = tiempoInputHTML('hoy', today(), mins);
}

function tiempoInputHTML(id, date, savedMins) {
  if (savedMins !== null && savedMins !== undefined) {
    return `<div class="past-saved">✅ Registrado: ${fmtTime(savedMins)}
      <button onclick="editTiempoInline('${id}','${date}')"
        style="background:none;border:none;color:#6b8a6b;font-size:.75rem;cursor:pointer;
               text-decoration:underline;font-family:'Plus Jakarta Sans',sans-serif;margin-left:.3rem">
        Editar
      </button></div>`;
  }
  return `<div class="past-tiempo-row">
    <input class="th-input" id="th-h-${id}" type="number" min="0" max="24" placeholder="0" value="">
    <span class="th-sep">h</span>
    <input class="th-input" id="th-m-${id}" type="number" min="0" max="59" placeholder="00" value="">
    <span class="th-sep">min</span>
    <button class="tiempo-save" onclick="saveTiempo('${id}','${date}')">Guardar</button>
  </div>
  <div style="font-size:.72rem;color:#9ca3af;margin-top:.35rem">
    Mirá el tiempo de pantalla en Ajustes de tu celular
  </div>`;
}

async function saveTiempo(id, date) {
  const h = parseInt(document.getElementById('th-h-' + id).value) || 0;
  const m = parseInt(document.getElementById('th-m-' + id).value) || 0;
  if (h === 0 && m === 0) { toast('Ingresá al menos 1 minuto'); return; }
  setLoading(true, 'Guardando tiempo...');
  try {
    const e = await getOrCreateEntry(date);
    const updated = await sb.update('entries', { tiempo_mins: h * 60 + m }, { id: `eq.${e.id}` });
    entriesCache[date] = updated[0];
    toast('⏱️ Tiempo registrado');
    if (date === today()) renderTiempoHoy();
    if (pastOpen) renderPastDays();
  } catch (err) {
    toast('Error al guardar. Intentá de nuevo.');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

function editTiempoInline(id, date) {
  const e = entriesCache[date];
  if (!e || e.tiempo_mins === null) return;
  const hrs  = Math.floor(e.tiempo_mins / 60);
  const mins = e.tiempo_mins % 60;
  const container = id === 'hoy'
    ? document.getElementById('tiempo-hoy-wrap')
    : document.querySelector(`[data-past-date="${date}"] .past-tiempo-wrap`);
  if (!container) return;
  container.innerHTML = `<div class="past-tiempo-row">
    <input class="th-input" id="th-h-${id}" type="number" min="0" max="24" placeholder="0" value="${hrs}">
    <span class="th-sep">h</span>
    <input class="th-input" id="th-m-${id}" type="number" min="0" max="59" placeholder="00" value="${mins}">
    <span class="th-sep">min</span>
    <button class="tiempo-save" onclick="saveTiempo('${id}','${date}')">Guardar</button>
  </div>`;
}

// ────────────────────────────────────────────────────────────
// DÍAS ANTERIORES — lista
// ────────────────────────────────────────────────────────────
function togglePastDays() {
  pastOpen = !pastOpen;
  document.getElementById('past-days-list').style.display = pastOpen ? 'flex' : 'none';
  document.getElementById('past-arrow').textContent = pastOpen ? '˅' : '›';
  if (pastOpen) renderPastDays();
}

function renderPastDays() {
  const list = document.getElementById('past-days-list');
  const t = today();
  const days = Object.keys(entriesCache).filter(d => d < t).sort().reverse();
  
  // Botón para agregar fecha
  const addBtn = `<button onclick="openEditDayModal(null)"
    style="width:100%;padding:.75rem;border:1.5px dashed #c4b5fd;border-radius:12px;
           background:none;color:#7c3aed;font-family:'Plus Jakarta Sans',sans-serif;
           font-size:.85rem;font-weight:700;cursor:pointer;margin-bottom:.25rem">
    📅 Agregar / editar un día específico
  </button>`;

  if (!days.length) {
    list.innerHTML = addBtn + '<div style="font-size:.82rem;color:#9ca3af;text-align:center;padding:.5rem">No hay días anteriores registrados</div>';
    return;
  }

  list.innerHTML = addBtn + days.map(d => {
    const e = entriesCache[d];
    const pId = 'p_' + d.replace(/-/g, '');
    return `<div class="past-day-row" data-past-date="${d}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
        <div class="past-day-date">📅 ${fmtDate(d)}</div>
        <button onclick="openEditDayModal('${d}')"
          style="background:linear-gradient(135deg,#7c3aed,#4c1d95);border:none;color:#fff;
                 padding:.28rem .7rem;border-radius:8px;font-size:.72rem;font-weight:700;
                 cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif">
          ✏️ Editar
        </button>
      </div>
      <div class="past-day-info">
        ${e.objetivo ? `"${esc(e.objetivo.substring(0, 40))}${e.objetivo.length > 40 ? '…' : ''}"` : ''}
        · ${e.unlocks} desbloqueos · ${fmtTime(e.tiempo_mins)}
      </div>
    </div>`;
  }).join('');
}

// ────────────────────────────────────────────────────────────
// MODAL EDITAR DÍA ANTERIOR
// ────────────────────────────────────────────────────────────
function openEditDayModal(date) {
  const modal = document.getElementById('edit-day-modal');
  const t = today();

  // Configurar el date picker: máximo = ayer
  const picker = document.getElementById('edit-day-date');
  picker.max = argentinaDate(-1);
  picker.min = '2020-01-01';

  if (date) {
    picker.value = date;
    loadEditDayData(date);
  } else {
    picker.value = argentinaDate(-1); // default ayer
    loadEditDayData(argentinaDate(-1));
  }

  picker.onchange = () => loadEditDayData(picker.value);
  modal.classList.add('open');
}

function loadEditDayData(date) {
  const e = entriesCache[date];
  document.getElementById('edit-day-unlocks').value  = e ? e.unlocks    : 0;
  document.getElementById('edit-day-goal').value     = e ? e.goal       : 50;
  document.getElementById('edit-day-objetivo').value = e ? (e.objetivo || '') : '';
  const mins = e ? e.tiempo_mins : null;
  document.getElementById('edit-day-th').value = (mins !== null && mins !== undefined) ? Math.floor(mins / 60) : '';
  document.getElementById('edit-day-tm').value = (mins !== null && mins !== undefined) ? mins % 60 : '';
}

function closeEditDayModal() {
  document.getElementById('edit-day-modal').classList.remove('open');
}

async function saveEditDay() {
  const date     = document.getElementById('edit-day-date').value;
  const unlocks  = parseInt(document.getElementById('edit-day-unlocks').value) || 0;
  const goal     = parseInt(document.getElementById('edit-day-goal').value) || 50;
  const objetivo = document.getElementById('edit-day-objetivo').value.trim();
  const h        = parseInt(document.getElementById('edit-day-th').value) || 0;
  const m        = parseInt(document.getElementById('edit-day-tm').value) || 0;
  const tiempo_mins = (h > 0 || m > 0) ? h * 60 + m : null;

  if (!date || date >= today()) {
    toast('Elegí una fecha anterior a hoy');
    return;
  }

  setLoading(true, 'Guardando...');
  try {
    const existing = entriesCache[date];
    let updated;
    if (existing) {
      updated = await sb.update('entries',
        { unlocks, goal, objetivo: objetivo || null, tiempo_mins },
        { id: `eq.${existing.id}` }
      );
      entriesCache[date] = updated[0];
    } else {
      const created = await sb.insert('entries', {
        user_id: me.id, date, unlocks, goal,
        objetivo: objetivo || null, tiempo_mins,
      });
      entriesCache[date] = created[0];
    }
    closeEditDayModal();
    toast('✅ Día guardado');
    if (pastOpen) renderPastDays();
  } catch (err) {
    toast('Error al guardar. Intentá de nuevo.');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

document.getElementById('edit-day-modal').addEventListener('click', function(e) {
  if (e.target === this) closeEditDayModal();
});

// ────────────────────────────────────────────────────────────
// ADMIN — abrir
// ────────────────────────────────────────────────────────────
async function openAdmin() {
  showScreen('admin-screen');
  switchTab('users');
  setLoading(true, 'Cargando datos...');
  try {
    const users   = await sb.select('users', { order: 'name.asc', select: 'id,name,name_key,created_at' });
    const entries = await sb.select('entries', { select: 'user_id,unlocks,tiempo_mins,date,objetivo,goal' });

    // Solo contar entries con actividad real
    const activeEntries = entries.filter(hasActivity);
    const totalUnlocks  = entries.reduce((s, e) => s + e.unlocks, 0);
    document.getElementById('ast-u').textContent = users.length;
    document.getElementById('ast-e').textContent = activeEntries.length;
    document.getElementById('ast-t').textContent = totalUnlocks;

    renderAdminUserList(users, entries);
  } catch (e) {
    toast('Error al cargar datos.');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

function renderAdminUserList(users, entries) {
  const byUser = {};
  entries.forEach(e => {
    if (!byUser[e.user_id]) byUser[e.user_id] = [];
    byUser[e.user_id].push(e);
  });

  const list = document.getElementById('user-list');
  if (!users.length) {
    list.innerHTML = '<div class="no-u">No hay usuarios registrados aún 🌱</div>';
  } else {
    list.innerHTML = users.map(u => {
      const ue          = byUser[u.id] || [];
      const activeUE    = ue.filter(hasActivity);
      const days        = activeUE.length;
      const tu          = ue.reduce((s, e) => s + e.unlocks, 0);
      return `<div class="user-row" onclick="openUD('${u.id}')">
        <div class="uavatar">${esc(initials(u.name))}</div>
        <div style="flex:1;min-width:0">
          <div class="uname">${esc(u.name)}</div>
          <div class="umeta">${days} día${days !== 1 ? 's' : ''} con actividad · ${tu} desbloqueos</div>
        </div>
        <div style="color:#ccc;font-size:1.1rem">›</div>
      </div>`;
    }).join('');
  }

  const dl = document.getElementById('delete-list');
  if (!users.length) {
    dl.innerHTML = '<div style="text-align:center;padding:1rem;color:#6b8a6b;font-size:.83rem">No hay usuarios</div>';
  } else {
    dl.innerHTML = users.map(u =>
      `<div class="del-row">
        <span class="del-nm">${esc(u.name)}</span>
        <button class="del-btn" onclick="deleteUser('${u.id}','${esc(u.name)}')">Eliminar</button>
      </div>`
    ).join('');
  }

  window._adminUsers  = users;
  window._adminByUser = byUser;
}

function switchTab(tab) {
  document.getElementById('sec-users').classList.toggle('on', tab === 'users');
  document.getElementById('sec-ctrl').classList.toggle('on',  tab === 'ctrl');
  const tu = document.getElementById('tab-u'), tc = document.getElementById('tab-c');
  if (tab === 'users') {
    tu.style.cssText = 'background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;box-shadow:0 3px 12px rgba(29,78,216,.3)';
    tu.classList.remove('off'); tc.style.cssText = ''; tc.classList.add('off');
  } else {
    tc.style.cssText = 'background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;box-shadow:0 3px 12px rgba(217,119,6,.3)';
    tc.classList.remove('off'); tu.style.cssText = ''; tu.classList.add('off');
  }
}

// ────────────────────────────────────────────────────────────
// ADMIN — agregar usuario
// ────────────────────────────────────────────────────────────
async function addUserAdmin() {
  const name = document.getElementById('new-name').value.trim();
  const pass = document.getElementById('new-pass').value;
  const err  = document.getElementById('new-err');
  if (!name || pass.length < 4) {
    err.textContent = 'Completá todos los campos (contraseña mín. 4 caracteres).';
    err.style.display = 'block';
    return;
  }
  setLoading(true, 'Creando usuario...');
  try {
    const nameKey = norm(name);
    const existing = await sb.select('users', { name_key: `eq.${nameKey}`, select: 'id' });
    if (existing.length > 0) {
      err.textContent = 'Ese nombre ya existe.';
      err.style.display = 'block';
      return;
    }
    const passwordHash = await sha256(pass);
    await sb.insert('users', { name, name_key: nameKey, password_hash: passwordHash });
    err.style.display = 'none';
    document.getElementById('new-name').value = '';
    document.getElementById('new-pass').value = '';
    toast(`✓ Usuario "${name}" creado`);
    await openAdmin();
  } catch (e) {
    err.textContent = 'Error al crear usuario.';
    err.style.display = 'block';
    console.error(e);
  } finally {
    setLoading(false);
  }
}

// ────────────────────────────────────────────────────────────
// ADMIN — eliminar usuario
// ────────────────────────────────────────────────────────────
async function deleteUser(id, name) {
  if (!confirm(`¿Eliminar a "${name}" y todos sus datos?`)) return;
  setLoading(true, 'Eliminando...');
  try {
    await sb.delete('users', { id: `eq.${id}` });
    toast(`Usuario "${name}" eliminado`);
    await openAdmin();
  } catch (e) {
    toast('Error al eliminar. Intentá de nuevo.');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

// ────────────────────────────────────────────────────────────
// ADMIN — detalle de usuario (solo días con actividad)
// ────────────────────────────────────────────────────────────
async function openUD(userId) {
  const user = (window._adminUsers || []).find(u => u.id === userId);
  if (!user) return;
  document.getElementById('uds-nm').textContent = `🌱 ${user.name}`;

  setLoading(true, 'Cargando historial...');
  let entries = [];
  try {
    const all = await sb.select('entries', { user_id: `eq.${userId}`, order: 'date.desc' });
    // Solo días con actividad real
    entries = all.filter(hasActivity);
  } catch (e) {
    console.error(e);
  } finally {
    setLoading(false);
  }

  const body = document.getElementById('uds-body');
  if (!entries.length) {
    body.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b8a6b;font-size:.85rem">Este usuario aún no tiene actividad registrada 🌱</div>';
    document.getElementById('user-detail-modal').classList.add('open');
    return;
  }

  body.innerHTML = entries.map(e => {
    const pct      = Math.round(e.unlocks / e.goal * 100);
    const pc       = pct >= 100 ? '#dc2626' : pct >= 75 ? '#d97706' : '#16a34a';
    const objHtml  = e.objetivo ? esc(e.objetivo) : '<span class="day-obj-empty">Sin objetivo registrado</span>';
    const tiempoStr = (e.tiempo_mins !== null && e.tiempo_mins !== undefined) ? fmtTime(e.tiempo_mins) : '—';
    return `<div class="day-card">
      <div class="day-date">📅 ${fmtDate(e.date)}</div>
      <div class="day-obj">${objHtml}</div>
      <div class="day-stats">
        <div class="dstat"><div class="dstat-n">${e.unlocks}</div><div class="dstat-l">Desbloqueos</div></div>
        <div class="dstat"><div class="dstat-n">${e.goal}</div><div class="dstat-l">Meta</div></div>
        <div class="dstat"><div class="dstat-n" style="color:${pc}">${pct}%</div><div class="dstat-l">% meta</div></div>
        <div class="dstat"><div class="dstat-n" style="font-size:.95rem">${tiempoStr}</div><div class="dstat-l">Uso total</div></div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('user-detail-modal').classList.add('open');
}

function closeUD() { document.getElementById('user-detail-modal').classList.remove('open'); }
document.getElementById('user-detail-modal').addEventListener('click', function(e) {
  if (e.target === this) closeUD();
});

// ────────────────────────────────────────────────────────────
// ENTER en campos
// ────────────────────────────────────────────────────────────
document.getElementById('login-pass').addEventListener('keydown',  e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('reg-pass').addEventListener('keydown',    e => { if (e.key === 'Enter') doRegister(); });
document.getElementById('admin-pass').addEventListener('keydown',  e => { if (e.key === 'Enter') doAdminAuth(); });

// ────────────────────────────────────────────────────────────
// INICIO — recuperar sesión guardada
// ────────────────────────────────────────────────────────────
(async function init() {
  const saved = loadSession();
  if (saved && saved.id) {
    // Verificar que el usuario aún existe en Supabase
    setLoading(true, 'Restaurando sesión...');
    try {
      const users = await sb.select('users', { id: `eq.${saved.id}`, select: 'id,name,name_key' });
      if (users.length) {
        me = users[0];
        await openDash();
        return;
      }
    } catch(e) {
      console.error('Session restore error:', e);
    } finally {
      setLoading(false);
    }
    clearSession();
  }
  showScreen('landing');
})();
