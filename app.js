/* CallCenter GVD: registro de gestiones y reporte en vivo sobre Supabase.
   Supervisor (rol admin): módulos Registrar y Reporte. Vendedor: solo Registrar. Los permisos reales los aplica la base (RLS). */
(() => {
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
const NF = new Intl.NumberFormat('es-PE'), N1 = new Intl.NumberFormat('es-PE', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const int = (v) => NF.format(Math.round(v)), pct = (v) => N1.format(v) + '%', dec = (v) => N1.format(v);
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','set','oct','nov','dic'];
const MESL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const fecha = (s) => { const [y, m, d] = s.split('-'); return `${+d} de ${MESL[+m - 1]} de ${y}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const digits = (t) => String(t || '').replace(/\D/g, '').slice(0, 9);
const fmtTel = (t) => digits(t).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
const fmtDur = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.round(s) % 60).padStart(2, '0');
const hora = (d) => d.toLocaleTimeString('es-PE', {hour: '2-digit', minute: '2-digit'});
const fechaCorta = (d) => d.toLocaleDateString('es-PE', {day: '2-digit', month: 'short'}).replace('.', '') + ' ' + hora(d);
const soles = (v) => 'S/ ' + NF.format(Math.round(v));
const initials = (n) => String(n || '?').split(/[ ,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
const BS = window.bootstrap;
const toast = (m) => { $('#toast-b').textContent = m; BS.Toast.getOrCreateInstance($('#toast'), {delay: 4000}).show(); };
const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/* Catálogos de la app original */
const ESTADOS = {OUT: ['Contactó', 'No contesta', 'Apagado', 'Número equivocado', 'Número no existe', 'Suspendido'], IN: ['Contactó']};
const GESTIONES = {
  'Venta': ['Venta OK', 'Falta confirmar pedido', 'No interesado', 'Compra en competencia', 'Volver a llamar'],
  'Postventa': ['Pedido incompleto', 'Producto dañado', 'Demora en entrega', 'Cambio de producto', 'Seguimiento de pedido'],
  'Consulta': ['Solo información', 'Consulta de precios', 'Tiene stock', 'No tenemos stock', 'Consulta de promociones'],
  'Reclamo': ['Mala atención', 'Producto defectuoso', 'Demora en entrega', 'Error de facturación', 'Error en pedido'],
  'Cobranza': ['Pagará hoy', 'Pagará esta semana', 'Solicita prórroga', 'No reconoce deuda', 'Volver a llamar'],
  'Actualización de datos': ['Actualización de teléfono', 'Actualización de dirección', 'Actualización de correo', 'Otros datos']
};
const INTENTOS = ['1 a 2 contactos', '3 a 5 contactos', 'Más de 5 contactos'], TIEMPOS = ['15 min', '30 min', '1 hora', '+ hora'], FRECUENCIAS = ['Semanal', 'Quincenal', 'Mensual'];
const MOTIVOS = ['Tiene stock', 'Precio alto', 'Compra a otro distribuidor', 'Sin liquidez', 'No trabaja el producto'], PROXQ = ['En 15 min', 'En 1 hora', 'En 3 horas', 'Mañana 10:00'];
const META = CFG.metaDiaria || 60;
const esContacto = (r) => ['Contactó', 'Número Correcto'].includes(r.estado) || r.sub === 'Venta OK';

/* Estado de la sesión */
let ME = null, VEND = {}, REC = [], CUR = null, T0 = null, PAUSA = null, canal = null;
const agName = (c) => VEND[c] || c || '—';
const fromRow = (r) => ({id: r.id, t: new Date(r.fecha_hora), agente: r.vendedor_codigo, cli: r.cliente_codigo, nom: r.nombre, canal: r.canal, estado: r.estado, sub: r.sub_detalle,
  monto: +r.monto || 0, dur: r.duracion_seg || 0, prox: r.proxima_accion ? new Date(r.proxima_accion) : null});
const CAMPOS = 'id,fecha_hora,vendedor_codigo,cliente_codigo,nombre,canal,estado,sub_detalle,monto,duracion_seg,proxima_accion';

/* ================= Sesión ================= */
$('#wave').parentElement.hidden = true;
const MODS = {admin: ['registrar', 'reporte'], vendedor: ['registrar']};
async function cargarPerfil() {
  const {data: {user}} = await sb.auth.getUser();
  if (!user) return false;
  const {data: v, error} = await sb.from('vendedores').select('codigo,nombre,rol,activo').eq('user_id', user.id).maybeSingle();
  if (error || !v || !v.activo) { await sb.auth.signOut(); $('#lerr').textContent = 'Tu usuario aún no está enlazado a un código de vendedor. Pídeselo a tu supervisor.'; return false; }
  ME = {c: v.codigo, n: v.nombre, role: v.rol, email: user.email};
  return true;
}
async function entrar() {
  $('#login').hidden = true; $('#app').hidden = false;
  const h = new Date().getHours();
  const nombre = ((ME.n.split(',')[1] || ME.n).trim().split(/\s+/)[0] || '').toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
  $('#hola').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${nombre}`;
  $('#hola-sub').textContent = (ME.role === 'admin' ? 'Supervisor' : 'Vendedor ' + ME.c) + ' · ' + new Date().toLocaleDateString('es-PE', {weekday: 'long', day: 'numeric', month: 'long'});
  $('#who-av').textContent = initials(ME.n); $('#who-n').textContent = ME.n; $('#who-role').textContent = ME.role === 'admin' ? 'Supervisor: Registrar y Reporte' : 'Vendedor: solo Registrar';
  const allowed = MODS[ME.role] || ['registrar'];
  $$('.mod').forEach((b) => b.hidden = !allowed.includes(b.dataset.m));
  $('#mods').hidden = allowed.length < 2;
  $('#st-items').hidden = ME.role !== 'vendedor';
  $('#f-cod').value = ME.c; $('#f-nom').value = ME.n;
  const {data: vs} = await sb.from('vendedores').select('codigo,nombre').range(0, 1999);
  VEND = Object.fromEntries((vs || []).map((v) => [v.codigo, v.nombre]));
  await cargarRecientes();
  escucharCambios();
  resetForm(); go('registrar');
  AVISADOS.clear(); revisarAvisos(true);
  const ya = pendientes().filter((r) => r.prox <= new Date()).length;
  if (ya) setTimeout(() => toast(`Tienes ${ya} reprogramación${ya === 1 ? '' : 'es'} para llamar ahora. Revisa la campana.`), 600);
}
async function cargarRecientes() {
  const desde = new Date(Date.now() - 14 * 864e5);
  const {data, error} = await sb.from('llamadas').select(CAMPOS).gte('fecha_hora', desde.toISOString()).order('fecha_hora').range(0, 4999);
  if (error) { toast('No se pudieron leer las gestiones: ' + error.message); REC = []; return; }
  REC = data.map(fromRow);
}
function escucharCambios() {
  if (canal) sb.removeChannel(canal);
  canal = sb.channel('llamadas-en-vivo').on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'llamadas'}, (p) => {
    const r = fromRow(p.new); if (REC.some((x) => x.id === r.id)) return;
    REC.push(r); renderToday(); renderAgenda();
    if (ME.role === 'admin') { liveBadge(); if (!$('#m-reporte').hidden) renderLive(); if (r.agente !== ME.c) toast(`${agName(r.agente)} registró: ${r.sub || r.estado}${r.monto ? ' · ' + soles(r.monto) : ''}`); }
  }).subscribe();
}
function go(m) {
  if (!(MODS[ME.role] || []).includes(m)) m = 'registrar';
  $$('.mod').forEach((b) => b.setAttribute('aria-selected', b.dataset.m === m));
  $('#m-registrar').hidden = m !== 'registrar'; $('#m-reporte').hidden = m !== 'reporte';
  if (m === 'registrar') { renderToday(); renderAgenda(); } else renderReporte();
  window.scrollTo(0, 0);
}
$$('.mod').forEach((b) => b.addEventListener('click', () => go(b.dataset.m)));
$('#logout').onclick = async () => { if (canal) sb.removeChannel(canal); await sb.auth.signOut(); ME = null; REC = []; $('#app').hidden = true; $('#login').hidden = false; $('#lp').value = ''; };
$('#flogin').addEventListener('submit', async (e) => {
  e.preventDefault(); const usuario = $('#lu').value.trim(), password = $('#lp').value;
  if (!usuario || !password) { $('#lerr').textContent = 'Escribe tu código y tu contraseña.'; return; }
  /* El código se convierte en el correo interno de la cuenta: 01CALL02 -> 01call02@callcenter.icen */
  const email = usuario.includes('@') ? usuario : `${usuario.toLowerCase()}@${CFG.dominioCuentas}`;
  $('#lbtn').disabled = true; $('#lerr').textContent = '';
  const {error} = await sb.auth.signInWithPassword({email, password});
  if (error) { $('#lerr').textContent = 'Código o contraseña incorrectos.'; $('#lbtn').disabled = false; return; }
  if (await cargarPerfil()) await entrar();
  $('#lbtn').disabled = false;
});

/* Estado del vendedor (pausas) */
$('#st-items').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return;
  PAUSA = b.dataset.st === 'Disponible' ? null : {v: b.dataset.st, t0: Date.now()};
  toast(PAUSA ? `En pausa: ${PAUSA.v}. No podrás guardar hasta volver a Disponible.` : 'Disponible'); renderToday(); });

/* ================= Registrar ================= */
const hoyRec = () => REC.filter((r) => r.t >= startOfToday() && (ME.role === 'admin' || r.agente === ME.c));
function renderToday() {
  const x = hoyRec(), c = x.filter(esContacto).length, v = x.filter((r) => r.sub === 'Venta OK');
  const meta = ME.role === 'admin' ? META * Math.max(1, new Set(x.map((r) => r.agente)).size) : META, p = Math.min(1, x.length / meta), C = 2 * Math.PI * 24;
  $('#today').innerHTML = `<div class="goal"><svg class="ring" viewBox="0 0 58 58" aria-hidden="true"><circle class="bg" cx="29" cy="29" r="24" fill="none" stroke-width="7"/><circle class="fg" cx="29" cy="29" r="24" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 29 29)"/><text x="29" y="34" text-anchor="middle">${Math.round(p * 100)}%</text></svg><div><div class="k">${ME.role === 'admin' ? 'Equipo hoy' : 'Mi meta de hoy'}</div><div class="v tnum">${x.length} <span class="fs-6 text-secondary fw-semibold">de ${meta}</span></div></div></div>
    <div><div class="k">Contactados</div><div class="v tnum">${c}</div></div>
    <div><div class="k">Ventas OK</div><div class="v tnum">${v.length}</div></div>
    <div><div class="k">${PAUSA ? '<span class="state-dot pause"></span>En ' + PAUSA.v.toLowerCase() : '<span class="state-dot"></span>Vendido hoy'}</div><div class="v tnum">${PAUSA ? '<span id="pz">00:00</span>' : soles(v.reduce((s, r) => s + r.monto, 0))}</div></div>`;
}
setInterval(() => { const el = $('#pz'); if (el && PAUSA) el.textContent = fmtDur(Math.floor((Date.now() - PAUSA.t0) / 1000)); }, 1000);

/* Búsqueda de clientes en la base */
let busq = 0, ultimos = [];
const agrupar = (rows) => { const m = new Map(); rows.forEach((r) => { const k = r.codigo; if (!m.has(k)) m.set(k, {cod: k, nom: r.nombre || '(sin nombre)', dist: r.distrito || '', tel: r.telefono || '', dirs: []}); if (r.direccion && !m.get(k).dirs.includes(r.direccion)) m.get(k).dirs.push(r.direccion); }); return [...m.values()]; };
async function buscarClientes(q) {
  const limpio = q.replace(/[^\p{L}\p{N} .-]/gu, '').trim(); if (limpio.length < 2) return [];
  const {data, error} = await sb.from('clientes').select('codigo,nombre,distrito,direccion,telefono').or(`codigo.ilike.%${limpio}%,nombre.ilike.%${limpio}%,telefono.ilike.%${limpio}%`).limit(30);
  if (error) { toast('No se pudo buscar: ' + error.message); return []; }
  return agrupar(data);
}
async function search() {
  const q = $('#q').value.trim(), n = ++busq;
  if (q.length < 2) { $('#results').hidden = true; return; }
  const list = await buscarClientes(q); if (n !== busq) return; ultimos = list;
  $('#results').innerHTML = list.slice(0, 8).map((c) => `<button type="button" class="list-group-item list-group-item-action d-flex gap-3 align-items-center" data-c="${esc(c.cod)}"><span class="small text-secondary tnum">${esc(c.cod)}</span><span class="flex-grow-1 text-truncate"><b class="small">${esc(c.nom)}</b><div class="small text-secondary">${esc(c.dist)}</div></span></button>`).join('') || '<div class="list-group-item small text-secondary">No hay clientes con ese dato. Regístralo con Nuevo cliente.</div>';
  $('#results').hidden = false;
}
let tBusq; $('#q').addEventListener('input', () => { clearTimeout(tBusq); tBusq = setTimeout(search, 250); });
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#btn-buscar').click(); } if (e.key === 'Escape') $('#results').hidden = true; });
$('#btn-buscar').onclick = async () => { const q = $('#q').value.trim(); if (!q) { toast('Escribe el código del cliente.'); return; }
  const list = await buscarClientes(q), ex = list.find((c) => c.cod === q); if (ex) selectCli(ex); else { ultimos = list; search(); } };
$('#results').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) selectCli(ultimos.find((c) => c.cod === b.dataset.c)); });
document.addEventListener('click', (e) => { if (!e.target.closest('#q-grp') && !e.target.closest('#results')) $('#results').hidden = true; });
async function selectCliPorCodigo(cod) { const {data} = await sb.from('clientes').select('codigo,nombre,distrito,direccion,telefono').eq('codigo', cod); const c = agrupar(data || [])[0]; if (c) selectCli(c); else toast('Ese cliente ya no está en el maestro.'); }
function selectCli(c) {
  if (!c) return; CUR = c; T0 = Date.now(); $('#results').hidden = true; $('#q').value = c.cod; $('#q').classList.remove('is-invalid');
  $('#c-nom').value = c.nom; $('#c-dist').value = c.dist; $('#c-tel').value = fmtTel(c.tel);
  $('#c-dir').innerHTML = (c.dirs.length ? c.dirs : ['(sin dirección)']).map((d) => `<option>${esc(d)}</option>`).join(''); $('#c-dir').disabled = c.dirs.length < 2;
  $('#tel-si').checked = true; $('#c-telnew').value = ''; $('#c-telnew').disabled = true;
  $('#st2').classList.add('done'); renderFicha();
}
$('#copytel').onclick = () => { if (CUR) navigator.clipboard?.writeText(digits(CUR.tel)).then(() => toast('Teléfono copiado'), () => toast(fmtTel(CUR.tel))); };
$$('input[name="telok"]').forEach((r) => r.onchange = () => { const no = $('#tel-no').checked; $('#c-telnew').disabled = !no; if (no) $('#c-telnew').focus(); });
$('#c-telnew').addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));

const tone = (r) => !esContacto(r) ? 'crit' : r.sub === 'Venta OK' ? 'good' : /Volver|Falta/i.test(r.sub || '') ? 'warn' : 'blue';
const toneIc = (r) => !esContacto(r) ? 'telephone-x' : r.sub === 'Venta OK' ? 'bag-check' : /Volver|Falta/i.test(r.sub || '') ? 'hourglass-split' : 'chat-left-dots';
async function renderFicha() {
  const c = CUR, el = $('#ficha');
  if (!c) { el.innerHTML = '<div class="cli-empty"><i class="bi bi-person-vcard"></i><b class="d-block text-body">Elige un cliente para empezar</b>Búscalo por código o tócalo en tu agenda. La duración se mide desde ese momento.</div>'; return; }
  el.innerHTML = `<div class="cb d-grid gap-3">
    <div class="cli-head"><span class="cli-av">${esc(initials(c.nom))}</span><div class="min-w-0"><b class="d-block lh-sm">${esc(c.nom)}</b><span class="small text-secondary"><i class="bi bi-geo-alt"></i> ${esc(c.dist)}</span></div></div>
    <div class="d-flex flex-wrap gap-1"><span class="pill blue">Código ${esc(c.cod)}</span>${c.dirs.length > 1 ? `<span class="pill">${c.dirs.length} direcciones</span>` : ''}</div>
    <div><div class="small fw-semibold mb-1">Últimas gestiones</div><div id="hist" class="small text-secondary">Cargando…</div></div></div>`;
  const {data} = await sb.from('llamadas').select(CAMPOS).eq('cliente_codigo', c.cod).order('fecha_hora', {ascending: false}).limit(5);
  if (CUR !== c) return;
  const hist = (data || []).map(fromRow);
  $('#hist').outerHTML = hist.length ? `<ul class="tl">${hist.map((r) => `<li><span class="ti pill ${tone(r)} p-0"><i class="bi bi-${toneIc(r)}"></i></span><span><b>${esc(r.sub || r.estado)}</b><div class="small text-secondary">${fechaCorta(r.t)} · ${esc(agName(r.agente))}</div></span></li>`).join('')}</ul>`
    : `<div class="small text-secondary">${ME.role === 'admin' ? 'Sin gestiones registradas.' : 'No tienes gestiones con este cliente.'}</div>`;
}

/* Formulario: desplegables dependientes, como en la app original */
const val = (id) => $('#' + id).value, radio = (n) => (document.querySelector(`input[name="${n}"]:checked`) || {}).value || '';
function opts(id, list, keep) { const el = $('#' + id), v = keep ? el.value : ''; el.innerHTML = '<option value="">Seleccionar</option>' + list.map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join(''); }
function dis(id, d) { $('#' + id).disabled = d; $(`label[for="${id}"]`).classList.toggle('lbl-off', d); }
const show = (id, s) => $('#' + id).hidden = !s;
opts('estado', ESTADOS.OUT); opts('gestion', Object.keys(GESTIONES)); opts('sub', []); opts('pedido', ['SI', 'NO']); opts('intentos', INTENTOS); opts('tiempo', TIEMPOS); opts('frec', FRECUENCIAS); opts('motivo', MOTIVOS);
$('#proxq').innerHTML = PROXQ.map((q) => `<button type="button" class="btn btn-outline-secondary" data-q="${q}">${q}</button>`).join('');
const sugTiempo = () => { const m = T0 ? (Date.now() - T0) / 60000 : 0; return m <= 15 ? '15 min' : m <= 30 ? '30 min' : m <= 60 ? '1 hora' : '+ hora'; };
function syncForm(src) {
  const tipo = radio('tipo');
  if (src === 'tipo') { opts('estado', ESTADOS[tipo]); if (tipo === 'IN') $('#estado').value = 'Contactó'; }
  const est = val('estado'), ok = est === 'Contactó';
  dis('gestion', !ok); if (!ok) $('#gestion').value = '';
  const g = val('gestion');
  if (['gestion', 'estado', 'tipo'].includes(src)) opts('sub', g ? GESTIONES[g] : [], src !== 'gestion');
  dis('sub', !g);
  if (src === 'pedido') { const p = val('pedido'); if (p === 'SI') $('#sub').value = 'Venta OK'; else if (p === 'NO' && (val('sub') === 'Venta OK' || !val('sub'))) $('#sub').value = 'No interesado'; }
  if (src === 'sub' && g === 'Venta') $('#pedido').value = val('sub') ? (val('sub') === 'Venta OK' ? 'SI' : 'NO') : '';
  dis('pedido', g !== 'Venta'); if (g !== 'Venta') $('#pedido').value = '';
  dis('intentos', !(est && !ok)); if (ok || !est) $('#intentos').value = '';
  dis('tiempo', !ok); if (!ok) $('#tiempo').value = ''; else if ((src === 'estado' || src === 'tipo') && !val('tiempo')) $('#tiempo').value = sugTiempo();
  const sub = val('sub');
  show('x-monto', sub === 'Venta OK'); show('x-erp', sub === 'Venta OK'); show('x-motivo', /No interesado|Compra en competencia/.test(sub));
  show('x-prox', /Volver a llamar|Falta confirmar/.test(sub) || ['No contesta', 'Apagado'].includes(est));
  $('#x-box').hidden = ['x-monto', 'x-erp', 'x-motivo', 'x-prox'].every((id) => $('#' + id).hidden);
  $('#st3').classList.toggle('done', !!est);
}
$('#f').addEventListener('change', (e) => { const id = e.target.name === 'tipo' ? 'tipo' : e.target.id; if (['tipo', 'estado', 'gestion', 'sub', 'pedido'].includes(id)) syncForm(id); e.target.classList?.remove('is-invalid'); $('#g-canal').classList.remove('border', 'border-danger', 'rounded'); });
$('#proxq').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; const v = b.dataset.q, d = new Date();
  if (v === 'En 15 min') d.setMinutes(d.getMinutes() + 15); else if (v === 'En 1 hora') d.setHours(d.getHours() + 1); else if (v === 'En 3 horas') d.setHours(d.getHours() + 3); else { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
  $('#prox').value = toLocal(d); $('#prox').classList.remove('is-invalid'); });
$('#monto').addEventListener('input', (e) => e.target.value = e.target.value.replace(/[^\d.]/g, ''));
function validate() {
  $$('#f .is-invalid').forEach((x) => x.classList.remove('is-invalid'));
  const errs = [], bad = (id, m) => { const el = $('#' + id); if (el.classList.contains('btn-group')) el.classList.add('border', 'border-danger', 'rounded'); else el.classList.add('is-invalid'); errs.push(m); };
  if (PAUSA) { $('#errsum').textContent = `Estás en ${PAUSA.v.toLowerCase()}. Cambia tu estado a Disponible en el menú de tu nombre para registrar.`; return false; }
  if (!CUR) bad('q', 'el cliente');
  if (CUR && $('#tel-no').checked && !/^9\d{8}$/.test(val('c-telnew'))) bad('c-telnew', 'el número nuevo (9 dígitos, empieza con 9)');
  if (!radio('canal')) bad('g-canal', 'el canal');
  if (!val('estado')) bad('estado', 'el estado del contacto');
  if (val('estado') === 'Contactó') { if (!val('gestion')) bad('gestion', 'el tipo de gestión'); else if (!val('sub')) bad('sub', 'el sub detalle');
    if (val('gestion') === 'Venta' && !val('pedido')) bad('pedido', 'si hizo pedido'); if (!val('tiempo')) bad('tiempo', 'el tiempo de llamada'); }
  else if (val('estado') && !val('intentos')) bad('intentos', 'el seguimiento');
  if (!$('#x-motivo').hidden && !val('motivo')) bad('motivo', 'el motivo de no compra');
  if (!$('#x-prox').hidden && !val('prox')) bad('prox', 'la fecha de reprogramación');
  $('#errsum').textContent = errs.length ? 'Falta completar: ' + errs.join(', ') + '.' : '';
  return !errs.length;
}
$('#f').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!validate()) return;
  const btn = $('#f button[type="submit"]'); btn.disabled = true;
  const fila = {vendedor_codigo: ME.c, cliente_codigo: CUR.cod, direccion: val('c-dir') || null, distrito: CUR.dist || null, nombre: CUR.nom, telefono: digits(CUR.tel) || null,
    numero_nuevo: $('#tel-no').checked ? val('c-telnew') : null, canal: radio('canal'), tipo_llamada: radio('tipo'), estado: val('estado'), sub_detalle: val('sub') || null,
    frecuencia_compra: val('frec') || null, hizo_pedido: val('pedido') || null, tipo_gestion: val('gestion') || null, seguimiento: val('intentos') || null, tiempo_llamada: val('tiempo') || null,
    observacion: val('obs').trim() || null, duracion_seg: Math.round((Date.now() - T0) / 1000), monto: val('sub') === 'Venta OK' && val('monto') ? +val('monto') : null,
    nro_pedido_erp: val('sub') === 'Venta OK' ? (val('erp').trim() || null) : null, motivo_no_compra: $('#x-motivo').hidden ? null : val('motivo'),
    proxima_accion: !$('#x-prox').hidden && val('prox') ? new Date(val('prox')).toISOString() : null};
  const {data, error} = await sb.from('llamadas').insert(fila).select(CAMPOS).single();
  btn.disabled = false;
  if (error) { $('#errsum').textContent = 'No se pudo guardar: ' + error.message + '. Revisa tu conexión e inténtalo de nuevo.'; return; }
  const r = fromRow(data); if (!REC.some((x) => x.id === r.id)) REC.push(r);
  toast(`Gestión guardada${r.monto ? ' · ' + soles(r.monto) : ''}${r.prox ? ' · reprogramada para ' + fechaCorta(r.prox) : ''}`);
  resetForm(); renderToday(); renderAgenda(); liveBadge();
});
function resetForm() {
  CUR = null; T0 = null; $('#f').reset(); if (ME) { $('#f-cod').value = ME.c; $('#f-nom').value = ME.n; }
  ['q', 'c-nom', 'c-dist', 'c-tel'].forEach((i) => $('#' + i).value = ''); $('#c-dir').innerHTML = ''; $('#c-dir').disabled = true; $('#c-telnew').disabled = true;
  opts('estado', ESTADOS.OUT); opts('sub', []); $('#errsum').textContent = ''; $$('#f .is-invalid').forEach((x) => x.classList.remove('is-invalid')); $('#g-canal').classList.remove('border', 'border-danger', 'rounded');
  $('#st2').classList.remove('done'); syncForm(); renderFicha();
}
$('#btn-limpiar').onclick = resetForm;
setInterval(() => { const on = !!T0; $('#timer').classList.toggle('on', on); $('#timer-v').textContent = on ? fmtDur(Math.floor((Date.now() - T0) / 1000)) : '00:00'; }, 500);

/* Reprogramaciones y notificaciones */
function pendientes() { if (!ME) return []; const latest = {}; REC.forEach((r) => { if (r.cli) latest[r.cli] = r; }); return Object.values(latest).filter((r) => r.prox && (ME.role === 'admin' || r.agente === ME.c)).sort((a, b) => a.prox - b.prox); }
const AVISADOS = new Set();
function renderNotif() {
  if (!ME) return;
  const ahora = new Date(), fin = startOfToday(); fin.setDate(fin.getDate() + 1);
  const lista = pendientes().filter((r) => r.prox < fin), vencidas = lista.filter((r) => r.prox <= ahora);
  const b = $('#notif-n'); b.hidden = !vencidas.length; b.textContent = vencidas.length;
  $('#notif-list').innerHTML = `<div class="nh"><b>Reprogramaciones de hoy</b><span class="pill ${vencidas.length ? 'crit' : ''}">${vencidas.length} para llamar ya</span></div>` +
    (lista.map((r) => { const late = r.prox <= ahora, mins = Math.round((ahora - r.prox) / 60000), k = late ? (mins > 30 ? 'crit' : 'warn') : 'blue';
      return `<button type="button" class="notif-item" data-c="${esc(r.cli)}"><span class="ni ${k}"><i class="bi bi-${late ? 'alarm' : 'clock'}"></i></span><span class="flex-grow-1 min-w-0"><b class="text-truncate">${esc(r.nom || r.cli)}</b><small>${esc(r.sub || r.estado)}${ME.role === 'admin' ? ' · ' + esc(agName(r.agente)) : ''}</small></span><small class="${late ? 'text-danger fw-semibold' : ''} text-nowrap">${late ? (mins < 1 ? 'Ahora' : 'Hace ' + (mins >= 60 ? Math.floor(mins / 60) + ' h' : mins + ' min')) : hora(r.prox)}</small></button>`; }).join('') || '<div class="notif-empty"><i class="bi bi-bell-slash d-block fs-4 mb-1"></i>No tienes reprogramaciones pendientes para hoy.</div>');
}
function revisarAvisos(silencio) {
  if (!ME) return;
  const nuevas = pendientes().filter((r) => r.prox <= new Date() && !AVISADOS.has(r.id));
  nuevas.forEach((r) => AVISADOS.add(r.id));
  if (nuevas.length && !silencio) {
    toast(nuevas.length === 1 ? `Reprogramación: toca llamar a ${nuevas[0].nom || nuevas[0].cli} (agendado para las ${hora(nuevas[0].prox)}).` : `Tienes ${nuevas.length} reprogramaciones para llamar ahora.`);
    const bell = $('.bell'); bell.classList.remove('ring-on'); void bell.offsetWidth; bell.classList.add('ring-on');
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('CallCenter GVD', {body: `Reprogramación: ${nuevas[0].nom || nuevas[0].cli}`});
  }
  renderNotif();
}
setInterval(() => revisarAvisos(false), 20000);
$('.bell').addEventListener('click', () => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); });
$('#notif-list').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; BS.Dropdown.getOrCreateInstance($('.bell')).hide(); go('registrar'); selectCliPorCodigo(b.dataset.c); });
function renderAgenda() {
  const q = pendientes();
  renderNotif();
  $('#ag-sub').textContent = q.length ? `${q.length} pendiente${q.length === 1 ? '' : 's'}` : 'Sin pendientes';
  $('#agenda').innerHTML = q.slice(0, 8).map((r) => { const late = r.prox < new Date(), k = late ? 'crit' : 'warn';
    return `<button type="button" class="list-group-item list-group-item-action ag-row" data-c="${esc(r.cli)}"><span class="ai pill ${k} p-0"><i class="bi bi-${late ? 'alarm' : 'telephone-forward'}"></i></span><span class="flex-grow-1 text-truncate"><b class="small d-block text-truncate">${esc(r.nom || r.cli)}</b><span class="small text-secondary">${esc(r.sub || r.estado)}</span></span><span class="when ${late ? 'text-danger fw-semibold' : 'text-secondary'}">${late ? 'Vencido' : fechaCorta(r.prox)}</span></button>`; }).join('') || '<div class="list-group-item small text-secondary">Cuando reprogrames una llamada, aparecerá aquí.</div>';
}
$('#agenda').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { selectCliPorCodigo(b.dataset.c); window.scrollTo({top: 0, behavior: 'smooth'}); } });

/* Nuevo cliente */
$('#btn-nuevo').onclick = () => { $('#fn').reset(); $('#n-err').textContent = ''; $$('#fn .is-invalid').forEach((x) => x.classList.remove('is-invalid')); BS.Modal.getOrCreateInstance($('#m-nuevo')).show(); };
['#n-doc', '#n-tel'].forEach((id) => $(id).addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, '')));
$('#fn').addEventListener('submit', async (e) => { e.preventDefault(); $$('#fn .is-invalid').forEach((x) => x.classList.remove('is-invalid'));
  const v = (id) => $(id).value.trim(), errs = [], bad = (id, m) => { $(id).classList.add('is-invalid'); errs.push(m); };
  if (!/^(\d{8}|\d{11})$/.test(v('#n-doc'))) bad('#n-doc', 'DNI de 8 o RUC de 11 dígitos'); if (!/^9\d{8}$/.test(v('#n-tel'))) bad('#n-tel', 'teléfono de 9 dígitos');
  if (v('#n-nom').length < 3) bad('#n-nom', 'nombre'); if (!v('#n-dist')) bad('#n-dist', 'distrito'); if (!v('#n-dir')) bad('#n-dir', 'dirección');
  if (errs.length) { $('#n-err').textContent = 'Revisa: ' + errs.join(', ') + '.'; return; }
  const fila = {codigo: v('#n-doc'), nombre: v('#n-nom').toUpperCase(), distrito: v('#n-dist').toUpperCase(), direccion: v('#n-dir').toUpperCase(), telefono: v('#n-tel'), vendedor_codigo: ME.c};
  const {error} = await sb.from('clientes').insert(fila);
  if (error) { $('#n-err').textContent = 'No se pudo guardar: ' + error.message; return; }
  BS.Modal.getOrCreateInstance($('#m-nuevo')).hide();
  selectCli({cod: fila.codigo, nom: fila.nombre, dist: fila.distrito, tel: fila.telefono, dirs: [fila.direccion]});
  toast('Cliente agregado con su DNI o RUC como código. Queda pendiente de alta en el ERP.'); });

/* ================= Reporte (solo supervisor) ================= */
function liveBadge() { if (!ME || ME.role !== 'admin') return; const n = REC.filter((r) => r.t >= startOfToday()).length, b = $('#live-bdg'); b.hidden = !n; b.textContent = n; }
function renderLive() {
  const x = REC.filter((r) => r.t >= startOfToday()), c = x.filter(esContacto), v = x.filter((r) => r.sub === 'Venta OK'), ags = new Set(x.map((r) => r.agente));
  const k = (ic, l, val, s, lead) => `<div class="kp ${lead ? 'lead' : ''}"><div class="l"><i class="bi bi-${ic}"></i>${l}</div><div class="v tnum">${val}</div><div class="s">${s}</div></div>`;
  $('#live-kpis').innerHTML = [k('telephone', 'Gestiones hoy', x.length, `de <b>${ags.size}</b> vendedores`, true), k('person-check', 'Contactabilidad', pct(x.length ? c.length / x.length * 100 : 0), `${c.length} contactados`),
    k('bag-check', 'Ventas OK', v.length, pct(c.length ? v.length / c.length * 100 : 0) + ' de contactados'), k('cash-coin', 'Vendido', soles(v.reduce((s, r) => s + r.monto, 0)), 'con monto registrado'),
    k('calendar-check', 'Reprogramadas', x.filter((r) => r.prox).length, 'con fecha de próxima acción')].join('');
  $('#t-live').innerHTML = `<thead><tr><th>Hora</th><th>Vendedor</th><th>Cliente</th><th>Canal</th><th>Resultado</th><th class="num">Monto</th><th class="num">Duración</th></tr></thead><tbody>` +
    (x.slice().reverse().slice(0, 60).map((r) => `<tr><td class="tnum">${hora(r.t)}</td><td>${esc(agName(r.agente))}</td><td class="text-truncate" style="max-width:240px">${esc(r.nom || r.cli)}</td><td>${esc(r.canal)}</td><td><span class="pill ${tone(r)}">${esc(r.sub || r.estado)}</span></td><td class="num tnum">${r.monto ? soles(r.monto) : '—'}</td><td class="num tnum">${r.dur ? fmtDur(r.dur) : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="text-secondary">Todavía no hay gestiones hoy. Aparecerán aquí apenas un vendedor guarde la primera.</td></tr>') + '</tbody>';
}

const D = window.HIST, T = D.resumen.find((r) => r.periodo === 'Todo'), V = D.resumen.find((r) => r.periodo !== 'Todo');
const M = Object.fromEntries(D.mensual.map((r) => [r.mes, r])), CL = D.clientes[0], Q = D.calidad[0], F = Object.fromEntries(D.frecuencia.map((r) => [r.frecuencia, r]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const C = {s1: css('--s1'), s2: css('--s2'), gray: css('--gray'), ink: css('--ink'), muted: css('--muted'), line: css('--line')};
Chart.defaults.font.family = css('--f'); Chart.defaults.color = C.muted; Chart.defaults.borderColor = C.line; Chart.defaults.maintainAspectRatio = false; Chart.defaults.plugins.legend.display = false;
Object.assign(Chart.defaults.plugins.tooltip, {backgroundColor: '#fff', titleColor: C.ink, bodyColor: C.ink, borderColor: C.line, borderWidth: 1, padding: 10, cornerRadius: 10, titleFont: {weight: '700'}});
const valueLabels = {id: 'vl', afterDatasetsDraw(ch, _, o) { if (!o || !o.fmt) return; const {ctx} = ch; ctx.save(); ctx.font = `600 11px ${css('--f')}`; ctx.fillStyle = C.ink; ctx.textAlign = o.h ? 'left' : 'center';
  ch.data.datasets.forEach((ds, di) => ch.getDatasetMeta(di).data.forEach((el, i) => { const v = ds.data[i]; if (v == null) return; const t = o.fmt(v, i); if (o.h) ctx.fillText(t, el.x + 6, el.y + 4); else ctx.fillText(t, el.x, el.y - 6); })); ctx.restore(); }};
const mk = (id, cfg) => { const old = Chart.getChart(id); if (old) old.destroy(); return new Chart($('#' + id), cfg); };
const noGrid = {display: false};
const bars = (id, labels, data, fmt, o = {}) => { const best = Math.max(...data);
  return mk(id, {type: 'bar', plugins: [valueLabels], data: {labels, datasets: [{data, backgroundColor: o.color || data.map((v) => v === best ? C.s1 : C.gray), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 46}]},
    options: {indexAxis: o.h ? 'y' : 'x', layout: {padding: {top: 18, right: o.h ? 90 : 0}}, plugins: {vl: {fmt: o.lbl || fmt, h: o.h}, tooltip: {callbacks: {label: o.tip || ((c) => ' ' + fmt(c.parsed[o.h ? 'x' : 'y']))}}},
      scales: o.h ? {x: {display: false, beginAtZero: true}, y: {grid: noGrid, border: {display: false}}} : {y: {display: false, beginAtZero: true}, x: {grid: noGrid}}}}); };

let repDone = false;
function renderReporte() {
  renderLive();
  if (repDone) return; repDone = true;
  $('#alert-txt').innerHTML = `En el Excel BD_CallCenter pasó de <b>${int(M['2026-06'].gestiones)}</b> gestiones en junio a <b>${int(M['2026-10'].gestiones)}</b> en octubre, y lo poco que queda es casi solo ventas. Por eso el módulo Registrar obliga a anotar cada intento.`;
  const k = (ic, l, v, s, lead) => `<div class="kp ${lead ? 'lead' : ''}"><div class="l"><i class="bi bi-${ic}"></i>${l}</div><div class="v tnum">${v}</div><div class="s">${s}</div></div>`;
  $('#rep-kpis').innerHTML = [k('bag-check', 'Ventas OK (Excel)', int(T.ventas), `Últimos 3 meses: <b>${int(V.ventas)}</b>`, true), k('telephone', 'Gestiones', int(T.gestiones), `Últimos 3 meses: <b>${int(V.gestiones)}</b>`),
    k('bullseye', 'Conversión', pct(T.conv_pct), `Últimos 3 meses: <b>${pct(V.conv_pct)}</b>`), k('person-check', 'Contactabilidad', pct(T.contact_pct), `Últimos 3 meses: <b>${pct(V.contact_pct)}</b>`),
    k('people', 'Clientes atendidos', int(T.clientes), `Del ${fecha(T.desde)} al ${fecha(T.hasta)}`)].join('');
  drawSub('resumen');
}
const drawn = {};
$$('.stab').forEach((b) => b.addEventListener('click', () => { $$('.stab').forEach((x) => x.setAttribute('aria-selected', x === b)); $$('.spane').forEach((p) => p.hidden = p.id !== 'p-' + b.dataset.p); drawSub(b.dataset.p); }));
function drawSub(p) { if (drawn[p]) return; drawn[p] = true; SUB[p](); }
const SUB = {
  resumen() {
    const ms = D.mensual.map((r) => MES[+r.mes.slice(5) - 1]);
    bars('ch-mes', ms, D.mensual.map((r) => r.gestiones), int, {color: C.s1});
    mk('ch-conv', {type: 'line', plugins: [valueLabels], data: {labels: ms, datasets: [{data: D.mensual.map((r) => r.conv_pct), borderColor: C.s2, borderWidth: 2, pointRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: C.s2, pointBorderWidth: 2, tension: 0}]},
      options: {layout: {padding: {top: 20, left: 6, right: 12}}, plugins: {vl: {fmt: pct}, tooltip: {callbacks: {label: (c) => ' ' + pct(c.parsed.y)}}}, scales: {y: {min: 0, max: 100, grid: {color: '#EEF2F7'}, border: {display: false}, ticks: {callback: (v) => v + '%', stepSize: 25}}, x: {grid: noGrid}}}});
    const sem = D.semanal, cx = $('#ch-sem').getContext('2d'), g = cx.createLinearGradient(0, 0, 0, 210); g.addColorStop(0, 'rgba(42,120,214,.26)'); g.addColorStop(1, 'rgba(42,120,214,0)');
    mk('ch-sem', {type: 'line', data: {labels: sem.map((r) => { const [, m, d] = r.semana.split('-'); return `${+d} ${MES[+m - 1]}`; }), datasets: [{data: sem.map((r) => r.agentes), borderColor: C.s1, backgroundColor: g, fill: true, borderWidth: 2, pointRadius: 3, pointBackgroundColor: C.s1, tension: 0}]},
      options: {interaction: {mode: 'index', intersect: false}, plugins: {tooltip: {callbacks: {title: (c) => 'Semana del ' + c[0].label, label: (c) => ` ${c.parsed.y} agentes · ${int(sem[c.dataIndex].gestiones)} gestiones`}}}, scales: {y: {beginAtZero: true, grid: {color: '#EEF2F7'}, border: {display: false}, ticks: {stepSize: 2}}, x: {grid: noGrid, ticks: {maxTicksLimit: 8}}}}});
    const f = (k, ic, tag, h, p, d) => `<div class="card find ${k}"><span class="tp"><i class="bi bi-${ic}"></i>${tag}</span><h4>${h}</h4><p>${p}</p><div class="do">${d}</div></div>`;
    $('#finds').innerHTML = [
      f('crit', 'graph-down-arrow', 'Crítico', 'Hoy casi solo se registran ventas', `La conversión pasó de <b>${pct(M['2026-05'].conv_pct)}</b> en mayo a <b>${pct(M['2026-09'].conv_pct)}</b> en septiembre: se dejaron de anotar las llamadas sin resultado.`, 'El módulo Registrar pide cada intento, con su estado.'),
      f('good', 'star', 'Oportunidad', 'Los clientes semanales compran más', `<b>${pct(F.Semanal.conv_pct)}</b> de conversión contra <b>${pct(F.Mensual.conv_pct)}</b> de los mensuales.`, 'Priorizar a los semanales en la agenda.'),
      f('good', 'arrow-repeat', 'Oportunidad', 'Se recompra en una semana', `Entre dos compras de un cliente pasan <b>${int(CL.recompra_dias)}</b> días (mediana), y <b>${int(CL.recompraron)}</b> clientes recompraron.`, 'Reprogramar una llamada a los 7 días de cada venta.'),
      f('warn', 'person-x', 'Atención', 'Parte de la cartera nunca se llamó', `<b>${int(CL.maestro_nunca)}</b> de los <b>${int(CL.maestro)}</b> clientes del maestro no tienen gestiones.`, 'Asignar cartera por vendedor.'),
      f('warn', 'stopwatch', 'Atención', 'La duración no se estaba midiendo', `<b>${int(Q.tiempo_15)}</b> de <b>${int(Q.con_tiempo)}</b> registros decían "15 min".`, 'El cronómetro del módulo Registrar lo resuelve.'),
      f('warn', 'exclamation-diamond', 'Atención', '"Seleccionar" guardado como respuesta', `<b>${int(Q.seleccionar)}</b> gestiones lo tienen en el Excel.`, 'El formulario nuevo no deja guardarlo.')].join('');
  },
  agentes() {
    const rows = D.agente_mes, meses = [...new Set(rows.map((r) => r.mes))].sort(), ags = [...new Set(rows.map((r) => r.agente))].sort(), max = Math.max(...rows.map((r) => r.gestiones));
    const ramp = ['#EEF2F7', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
    let h = '<div class="h"></div>' + meses.map((m) => `<div class="h">${MES[+m.slice(5) - 1]}</div>`).join('');
    ags.forEach((a) => { h += `<div class="r">${a}</div>`; meses.forEach((m) => { const v = (rows.find((r) => r.agente === a && r.mes === m) || {}).gestiones || 0, k = v ? Math.min(6, 1 + Math.floor(5.99 * v / max)) : 0;
      h += `<div class="c" style="background:${ramp[k]};color:${k >= 4 ? '#fff' : k ? C.ink : C.muted}" title="${a}, ${MESL[+m.slice(5) - 1]}: ${int(v)} gestiones">${v ? int(v) : '·'}</div>`; }); });
    $('#heat').style.gridTemplateColumns = `auto repeat(${meses.length}, minmax(3.2rem, 1fr))`; $('#heat').innerHTML = h;
    const cols = [['agente', 'Agente'], ['gestiones', 'Gestiones', int], ['dias', 'Días', int], ['por_dia', 'Por día', dec], ['contact_pct', 'Contact.', pct], ['conv_pct', 'Conversión', pct], ['ventas', 'Ventas', int], ['min_entre', 'Min. entre', dec], ['pendientes', 'Pendientes', int], ['seleccionar', '"Seleccionar"', int], ['ultimo_dia', 'Último día'], ['gestiones_3m', 'Últ. 3 meses', int]];
    let key = 'gestiones', dir = -1; const maxG = Math.max(...D.agentes.map((a) => a.gestiones));
    const cell = (a, [k, , f]) => k === 'agente' ? `<td class="fw-bold">${a.agente}</td>`
      : k === 'gestiones' ? `<td class="num tnum">${int(a.gestiones)}<span class="bar-in"><i style="width:${a.gestiones / maxG * 100}%"></i></span></td>`
      : k === 'conv_pct' ? `<td class="num"><span class="pill ${a.conv_pct >= 60 ? 'good' : a.conv_pct >= 35 ? 'warn' : 'crit'}">${pct(a.conv_pct)}</span></td>`
      : k === 'min_entre' ? `<td class="num">${a.min_entre == null ? '—' : `<span class="pill ${a.min_entre < 1.5 ? 'warn' : ''}">${dec(a.min_entre)}</span>`}</td>`
      : k === 'ultimo_dia' ? `<td class="num">${+a.ultimo_dia.slice(8)} ${MES[+a.ultimo_dia.slice(5, 7) - 1]}</td>`
      : k === 'seleccionar' ? `<td class="num">${a.seleccionar > 50 ? `<span class="pill crit">${int(a.seleccionar)}</span>` : int(a.seleccionar)}</td>`
      : `<td class="num tnum">${a[k] == null ? '—' : f(a[k])}</td>`;
    const render = () => { const s = D.agentes.slice().sort((a, b) => { const x = a[key], y = b[key]; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir; });
      $('#t-ag').innerHTML = `<thead><tr>${cols.map(([k, l]) => `<th class="sort ${k === 'agente' ? '' : 'num'}" data-k="${k}" aria-sort="${k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${l}</th>`).join('')}</tr></thead><tbody>${s.map((a) => `<tr>${cols.map((c) => cell(a, c)).join('')}</tr>`).join('')}</tbody>`; };
    $('#t-ag').addEventListener('click', (e) => { const th = e.target.closest('th[data-k]'); if (!th) return; const k = th.dataset.k; if (k === key) dir = -dir; else { key = k; dir = k === 'agente' ? 1 : -1; } render(); });
    render();
  },
  clientes() {
    const st = [['Clientes llamados', CL.llamados], ['Contactados', CL.llamados - CL.nunca_contactados], ['Compraron', CL.compraron], ['Recompraron', CL.recompraron], ['Fieles (4+ compras)', CL.fieles_4mas]];
    const ord = ['#86b6ef', '#5598e7', '#3987e5', '#2a78d6', '#1c5cab'];
    let wi = 0, worst = 0; st.forEach((s, i) => { if (i && st[i - 1][1] - s[1] > worst) { worst = st[i - 1][1] - s[1]; wi = i; } });
    $('#funnel').innerHTML = st.map(([l, v], i) => `<div class="fr"><span class="fw-semibold">${l}</span><span class="track"><i style="width:${v / st[0][1] * 100}%;background:${i === wi ? css('--crit') : ord[i]}"></i></span><span class="val tnum">${int(v)}<small>${i ? '−' + int(st[i - 1][1] - v) : 'base'}</small></span></div>`).join('') +
      `<p class="small text-secondary mb-0 mt-2"><i class="bi bi-info-circle"></i> En rojo, el paso que más clientes pierde. Aparte, ${int(CL.maestro_nunca)} de los ${int(CL.maestro)} clientes del maestro nunca se llamaron.</p>`;
    bars('ch-recompra', D.dist_recompra.map((r) => r.dias), D.dist_recompra.map((r) => r.recompras), int);
    bars('ch-llam', D.dist_llamadas.map((r) => r.llamadas), D.dist_llamadas.map((r) => r.clientes), int);
    bars('ch-vcli', D.dist_ventas.map((r) => r.ventas === '0' ? 'Ninguna' : r.ventas), D.dist_ventas.map((r) => r.clientes), int);
  },
  cuando() {
    bars('ch-frec', D.frecuencia.map((r) => r.frecuencia), D.frecuencia.map((r) => r.conv_pct), pct);
    bars('ch-hora', D.hora.map((r) => r.hora + ':00'), D.hora.map((r) => r.conv_pct), pct);
    bars('ch-dia', D.dia.map((r) => r.dia), D.dia.map((r) => r.conv_pct), pct);
    const cs = [...new Set(D.canal.map((r) => r.canal))], get = (c, p) => (D.canal.find((r) => r.canal === c && r.periodo === p) || {}).conv_pct;
    mk('ch-canal', {type: 'bar', plugins: [valueLabels], data: {labels: cs, datasets: [{label: 'Todo el periodo', data: cs.map((c) => get(c, 'Todo')), backgroundColor: C.s1, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 40}, {label: 'Últimos 3 meses', data: cs.map((c) => get(c, 'Ultimos 3 meses')), backgroundColor: C.s2, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 40}]},
      options: {layout: {padding: {top: 18}}, datasets: {bar: {categoryPercentage: .7, barPercentage: .9}}, plugins: {vl: {fmt: pct}, tooltip: {callbacks: {label: (c) => ` ${c.dataset.label}: ${pct(c.parsed.y)}`}}}, scales: {y: {display: false, min: 0, max: 112}, x: {grid: noGrid}}}});
    const ds = D.distrito;
    bars('ch-dist', ds.map((r) => r.distrito), ds.map((r) => r.gestiones), int, {h: true, color: ds.map((r) => r.conv_pct >= 60 ? C.s1 : C.gray), lbl: (v, i) => `${int(v)} · ${pct(ds[i].conv_pct)}`, tip: (c) => ` ${int(ds[c.dataIndex].gestiones)} gestiones · ${pct(ds[c.dataIndex].conv_pct)} conversión`});
  },
  calidad() {
    $('#q-sub').textContent = `Sobre ${int(Q.registros)} gestiones del Excel. Cada punto ya está resuelto en el formulario nuevo.`;
    const r = (k, ic, t, v) => `<div class="qrow"><span class="qi ${k}"><i class="bi bi-${ic}"></i></span><span>${t}</span><b class="tnum">${v}</b></div>`;
    $('#quality').innerHTML = [r('crit', 'x-octagon', '"Seleccionar" guardado como respuesta', int(Q.seleccionar)), r('crit', 'bag-x', 'Ventas OK con un estado que no es de contacto', int(Q.venta_sin_estado)),
      r('crit', 'stopwatch', 'Tiempo de llamada = "15 min"', `${int(Q.tiempo_15)} de ${int(Q.con_tiempo)}`), r('warn', 'calendar-week', 'Frecuencia de compra llena', `${int(Q.frec_llena)} de ${int(Q.registros)}`),
      r('warn', 'chat-left-text', 'Con observación escrita', int(Q.obs)), r('warn', 'person-vcard', 'Con DNI o RUC', int(Q.dni)), r('warn', 'table', 'Clientes con columnas Mes-3 a Mes-0 llenas', `${int(Q.mes_cols_llenas)} de ${int(Q.clientes_maestro)}`)].join('');
  }
};

/* Inicio: si ya hay sesión guardada, entra directo */
resetForm();
(async () => { const {data: {session}} = await sb.auth.getSession(); if (session && await cargarPerfil()) await entrar(); })();
})();
