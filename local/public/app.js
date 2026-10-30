(function () {
'use strict';
/* ---------- Utilidades ---------- */
var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
var DIAS3 = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var STATUS = { pending: 'Por confirmar', confirmed: 'Confirmada', cancelled: 'Cancelada', attended: 'Asistió', noshow: 'No asistió' };
function pad(n) { return String(n).padStart(2, '0'); }
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function parse(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
function longDate(s) { var d = parse(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
function shortDate(s) { var d = parse(s); return DIAS3[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()]; }
function isClinic(s) { return CFG.clinicDays.indexOf(parse(s).getDay()) >= 0; }
function clinicDays(from, n) { var out = [], d = from; while (out.length < n) { if (isClinic(d)) out.push(d); d = addDays(d, 1); } return out; }
function prevClinicDays(from, n) { var out = [], d = addDays(from, -1); while (out.length < n) { if (isClinic(d)) out.unshift(d); d = addDays(d, -1); } return out; }
function svc(id) { return CFG.services.filter(function (s) { return s.id === id; })[0]; }
function validate(f, needOk) {
  if (String(f.name).trim().length < 3) return 'Escribe el nombre completo.';
  if (String(f.phone).replace(/\D/g, '').length !== 10) return 'El teléfono debe tener 10 dígitos.';
  var a = Number(f.age); if (!(a >= 18 && a <= 99)) return 'La edad debe estar entre 18 y 99.';
  if (needOk && !f.ok) return 'Confirma que la paciente conoce el aviso de privacidad.';
  return '';
}
function reminderText(a) {
  return 'Hola ' + a.name.split(' ')[0] + ', te recordamos tu cita de ' + svc(a.service_id).name.toLowerCase() + ' en Fundación Hidalguense el ' + longDate(a.appt_date) + ' a las ' + a.appt_time + ' h.\n\nResponde CONFIRMO para asegurar tu lugar, o CANCELO si no podrás asistir, así otra persona podrá usarlo. Si no recibimos respuesta, tu lugar podría liberarse.\nFolio: ' + a.folio;
}
function confirmText(a) {
  return 'Hola ' + a.name.split(' ')[0] + ', tu cita de ' + svc(a.service_id).name.toLowerCase() + ' en Fundación Hidalguense quedó registrada para el ' + longDate(a.appt_date) + ' a las ' + a.appt_time + ' h.\n\nSi no puedes asistir, avísanos para que otra persona use tu lugar.\nFolio: ' + a.folio;
}
function waLink(a, text) {
  var d = String(a.phone).replace(/\D/g, ''); if (d.length === 10) d = '52' + d;
  return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
}
function pill(s) { return '<span class="pill ' + s + '">' + STATUS[s] + '</span>'; }

var tt;
function toast(m) { var t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 3800); }

var CFG = null, SESSION = { needsPin: false, ok: true };
function api(path, body) {
  var opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  return fetch(path, opt).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401 && j.error === 'login') { SESSION.ok = false; render(); throw new Error('login'); }
      if (!r.ok) { var e = new Error(j.message || 'Ocurrió un problema.'); e.code = j.error; throw e; }
      return j;
    });
  });
}

/* ---------- Estado de la interfaz ---------- */
var ui = {
  service: 'mast', date: null, time: null, taken: [], counts: {},
  form: { name: '', phone: '', age: '', ok: false }, err: '', busy: false, done: null, waited: null,
  aService: 'mast', aDay: null, appts: [], wait: [], stats: { attended: 0, noshow: 0, recovered: 0, cancelled: 0, total: 0 },
  addOpen: false, add: { name: '', phone: '', age: '', time: '' }, confirmRelease: false, pin: '', pinErr: ''
};
function route() { return (location.hash || '#agendar').replace('#', '') === 'panel' ? 'panel' : 'agendar'; }

/* ---------- Carga de datos ---------- */
function bookDays() { return clinicDays(addDays(CFG.today, 1), 9); }
function adminDays() { return prevClinicDays(CFG.today, 2).concat(clinicDays(CFG.today, 7)); }
function loadBook() {
  if (!ui.date) ui.date = bookDays()[0];
  return Promise.all([
    api('/api/day?service=' + ui.service + '&date=' + ui.date),
    api('/api/counts?service=' + ui.service + '&dates=' + bookDays().join(',')),
  ]).then(function (r) { ui.taken = r[0].taken; ui.counts = r[1]; });
}
function loadAdmin() {
  if (!ui.aDay) ui.aDay = clinicDays(CFG.today, 1)[0];
  return Promise.all([
    api('/api/admin/day?service=' + ui.aService + '&date=' + ui.aDay),
    api('/api/admin/stats'),
  ]).then(function (r) { ui.appts = r[0].appts; ui.wait = r[0].waitlist; ui.stats = r[1]; });
}
function refresh() {
  var p = route() === 'panel' ? loadAdmin() : loadBook();
  return p.then(render).catch(function (e) { if (e.message !== 'login') toast(e.message); });
}

/* ---------- Vistas ---------- */
function serviceChips(cur, action) {
  return '<div class="chips">' + CFG.services.map(function (s) {
    return '<button class="chip" data-a="' + action + '" data-v="' + s.id + '" aria-pressed="' + (s.id === cur) + '"><b>' + esc(s.name) + '</b><small>' + s.slots + ' lugares por día</small></button>';
  }).join('') + '</div>';
}
function loginView() {
  return '<section class="hero"><h1>Agenda Hidalguense</h1><p>Escribe el PIN para entrar.</p></section>' +
    '<form class="card login" id="login-form"><div class="field"><label for="pin">PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" value="' + esc(ui.pin) + '"></div>' +
    (ui.pinErr ? '<p class="err" role="alert">' + esc(ui.pinErr) + '</p>' : '') + '<div><button class="btn" type="submit">Entrar</button></div></form>';
}
function personFields(prefix, f, withOk) {
  return '<div class="form">' +
    '<div class="field"><label for="' + prefix + 'name">Nombre completo</label><input id="' + prefix + 'name" autocomplete="off" value="' + esc(f.name) + '"></div>' +
    '<div class="field"><label for="' + prefix + 'phone">Teléfono (WhatsApp)</label><input id="' + prefix + 'phone" inputmode="tel" autocomplete="off" placeholder="771 000 0000" value="' + esc(f.phone) + '"></div>' +
    '<div class="field"><label for="' + prefix + 'age">Edad</label><input id="' + prefix + 'age" inputmode="numeric" autocomplete="off" value="' + esc(f.age) + '"></div>' +
    (withOk ? '<label class="check full" style="grid-column:1/-1"><input type="checkbox" id="f-ok"' + (f.ok ? ' checked' : '') + '><span>La paciente conoce el aviso de privacidad. Solo se guardan nombre, teléfono y edad para gestionar la cita; no se registran datos clínicos.</span></label>' : '') +
    '</div>';
}
function bookView() {
  var s = svc(ui.service);
  if (ui.done) {
    var a = ui.done;
    return '<section class="card"><h2>La cita quedó registrada</h2><div class="folio">' + esc(a.folio) + '</div>' +
      '<dl class="kv"><dt>Servicio</dt><dd>' + esc(s.name) + '</dd><dt>Día</dt><dd>' + longDate(a.appt_date) + '</dd><dt>Hora</dt><dd>' + a.appt_time + ' h</dd><dt>Paciente</dt><dd>' + esc(a.name) + '</dd><dt>Teléfono</dt><dd>' + esc(a.phone) + '</dd></dl>' +
      '<p class="note">Envía la confirmación a la paciente por WhatsApp y anota el folio por si lo necesita. El recordatorio se envía desde el Panel de control.</p>' +
      '<div class="chips"><a class="btn ok a-btn" target="_blank" rel="noopener noreferrer" href="' + waLink(a, confirmText(a)) + '">Enviar confirmación por WhatsApp</a><button class="btn ghost" data-a="again">Agendar otra cita</button></div></section>';
  }
  if (ui.waited) {
    var w = ui.waited;
    return '<section class="card"><h2>Quedó en la lista de espera</h2><p>' + esc(w.name) + ' quedó anotada para ' + esc(svc(w.service).name.toLowerCase()) + ' del ' + longDate(w.date) + '. Si alguien cancela, el lugar pasa a ella y aparecerá en el Panel de control.</p><div><button class="btn ghost" data-a="again">Volver a la agenda</button></div></section>';
  }
  var free = s.times.filter(function (t) { return ui.taken.indexOf(t) < 0; });
  var h = '<section class="hero"><h1>Agendar cita</h1><p>Elige el servicio, el día y la hora, y captura los datos de la paciente. Atención de miércoles a viernes, de 8:30 a 13:00 h.</p></section>';
  h += '<section class="card"><div class="step-h"><h2>1. Servicio</h2></div>' + serviceChips(ui.service, 'svc') + '</section>';
  h += '<section class="card"><div class="step-h"><h2>2. Día</h2><span>Lugares libres por día</span></div><div class="chips">' + bookDays().map(function (d) {
    var n = d === ui.date ? free.length : Math.max(0, s.slots - (ui.counts[d] || 0));
    return '<button class="chip" data-a="day" data-v="' + d + '" aria-pressed="' + (d === ui.date) + '"><b>' + shortDate(d) + '</b><small>' + (n ? n + ' libres' : 'Lleno') + '</small></button>';
  }).join('') + '</div></section>';
  h += '<form class="card" id="book-form" novalidate><div class="step-h"><h2>3. Hora</h2><span>' + longDate(ui.date) + '</span></div><div class="slots">' + s.times.map(function (t) {
    return '<button type="button" class="slot" data-a="time" data-v="' + t + '" aria-pressed="' + (ui.time === t) + '"' + (ui.taken.indexOf(t) >= 0 ? ' disabled' : '') + '>' + t + '</button>';
  }).join('') + '</div>';
  if (!free.length) h += '<p class="note">Este día ya no tiene lugares. Puedes anotar a la paciente en la lista de espera: si alguien cancela, el lugar pasa a ella.</p>';
  if (!free.length || ui.time) {
    h += '<div class="step-h"><h2>4. Datos de la paciente</h2>' + (ui.time ? '<span>' + esc(s.name) + ' · ' + shortDate(ui.date) + ' · ' + ui.time + ' h</span>' : '') + '</div>' + personFields('f-', ui.form, true) +
      (ui.err ? '<p class="err" role="alert">' + esc(ui.err) + '</p>' : '') +
      '<div><button class="btn" type="submit"' + (ui.busy ? ' disabled' : '') + '>' + (free.length ? 'Registrar cita' : 'Anotar en lista de espera') + '</button></div>';
  } else h += '<p class="note">Elige una hora disponible para continuar.</p>';
  return h + '</form>';
}
function adminView() {
  var s = svc(ui.aService), d = ui.aDay, times = s.times, today = CFG.today;
  var by = {}; ui.appts.forEach(function (a) { by[a.appt_time] = a; });
  var cnt = function (st) { return ui.appts.filter(function (a) { return a.status === st; }).length; };
  var conf = cnt('confirmed'), pend = cnt('pending'), att = cnt('attended'), nos = cnt('noshow'), free = times.length - ui.appts.length;
  var pn = ui.appts.filter(function (a) { return a.status === 'pending'; });
  var freeTimes = times.filter(function (t) { return !by[t]; });
  var pct = function (n) { return (n / times.length * 100) + '%'; };
  var st = ui.stats, den = st.attended + st.noshow;

  var h = '<section class="hero"><h1>Panel de control</h1><p>Control diario de citas, asistencia y lista de espera. Lo que se cancela se reasigna solo.</p>' +
    '<div class="sp"><a class="btn small ghost a-btn" href="/api/admin/export.csv">Descargar todas las citas (Excel)</a>' + (SESSION.needsPin ? '<button class="btn small ghost" data-a="logout">Cerrar sesión</button>' : '') + '</div></section>';
  h += '<section class="card"><div class="step-h"><h2>Servicio</h2></div>' + serviceChips(ui.aService, 'asvc') + '<div class="step-h"><h2>Día</h2></div><div class="chips">' + adminDays().map(function (x) {
    return '<button class="chip" data-a="aday" data-v="' + x + '" aria-pressed="' + (x === d) + '"><b>' + shortDate(x) + '</b><small>' + (x === today ? 'Hoy' : x < today ? 'Pasado' : 'Próximo') + '</small></button>';
  }).join('') + '</div></section>';
  h += '<div class="panel"><div style="display:grid;gap:24px;min-width:0">';
  h += '<section class="card"><h2>' + esc(s.name) + ' · ' + longDate(d) + '</h2><div class="stats"><div class="stat"><b>' + ui.appts.length + '/' + times.length + '</b><span>Cupos ocupados</span></div><div class="stat ok"><b>' + (conf + att) + '</b><span>Confirmadas o atendidas</span></div><div class="stat warn"><b>' + pend + '</b><span>Por confirmar</span></div><div class="stat"><b>' + free + '</b><span>Libres</span></div>' + (nos ? '<div class="stat bad"><b>' + nos + '</b><span>No asistieron</span></div>' : '') + '</div>' +
    '<div class="bar-s" role="img" aria-label="Distribución de cupos"><i style="width:' + pct(conf + att) + ';background:var(--ok)"></i><i style="width:' + pct(pend) + ';background:var(--warn)"></i><i style="width:' + pct(nos) + ';background:var(--bad)"></i></div>' +
    '<div class="legend"><span><i style="background:var(--ok)"></i>Confirmadas/atendidas</span><span><i style="background:var(--warn)"></i>Por confirmar</span><span><i style="background:var(--bad)"></i>No asistieron</span><span><i style="background:var(--line)"></i>Libres</span></div></section>';

  h += '<section class="card"><div class="step-h"><h2>Agenda del día</h2><button class="btn small ghost" data-a="addToggle">' + (ui.addOpen ? 'Cerrar' : '+ Agregar paciente') + '</button></div>';
  if (ui.addOpen) {
    h += freeTimes.length ? '<form id="add-form" novalidate>' + personFields('n-', ui.add, false) +
      '<div class="field" style="margin-top:12px;max-width:200px"><label for="n-time">Hora</label><select id="n-time">' + freeTimes.map(function (t) { return '<option' + ((ui.add.time || freeTimes[0]) === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      (ui.err ? '<p class="err" role="alert">' + esc(ui.err) + '</p>' : '') + '<div style="margin-top:12px"><button class="btn small" type="submit">Agendar</button></div></form>' : '<p class="note">No hay horarios libres este día.</p>';
  }
  h += '<div class="rows">' + times.map(function (t) {
    var a = by[t];
    if (!a) return '<div class="row free"><span class="t">' + t + '</span><span class="who">Libre</span></div>';
    var acts = '';
    if (a.status === 'pending') acts = '<a class="btn small ok a-btn" target="_blank" rel="noopener noreferrer" data-a="wa" data-id="' + a.id + '" href="' + waLink(a, reminderText(a)) + '">WhatsApp</a><button class="btn small ghost" data-a="set" data-s="confirmed" data-id="' + a.id + '">Confirmar</button><button class="btn small bad" data-a="set" data-s="cancelled" data-id="' + a.id + '">Cancelar</button>';
    else if (a.status === 'confirmed') acts = '<button class="btn small ok" data-a="set" data-s="attended" data-id="' + a.id + '">Asistió</button><button class="btn small bad" data-a="set" data-s="noshow" data-id="' + a.id + '">No asistió</button><button class="btn small ghost" data-a="set" data-s="cancelled" data-id="' + a.id + '">Cancelar</button>';
    else acts = '<button class="btn small ghost" data-a="set" data-s="confirmed" data-id="' + a.id + '">Deshacer</button>';
    return '<div class="row"><span class="t">' + t + '</span><span class="who"><b>' + esc(a.name) + (a.from_waitlist ? ' <small>· de lista de espera</small>' : '') + '</b><small>' + esc(a.phone) + ' · ' + a.age + ' años · ' + esc(a.folio) + (a.reminded_at ? ' · <span class="sent">Recordatorio enviado</span>' : '') + '</small></span>' + pill(a.status) + '<span class="acts">' + acts + '</span></div>';
  }).join('') + '</div></section></div>';

  h += '<div style="display:grid;gap:24px;min-width:0">';
  h += '<section class="card"><h2>Recordatorios</h2>' + (pn.length ?
    '<p class="note">Mensaje que recibe cada paciente:</p><div class="msg">' + esc(reminderText(pn[0])) + '</div><div class="rows">' + pn.map(function (p) {
      return '<div class="row"><span class="who"><b>' + esc(p.name) + '</b><small>' + p.appt_time + ' h' + (p.reminded_at ? ' · <span class="sent">Enviado</span>' : '') + '</small></span><a class="btn small ok a-btn" target="_blank" rel="noopener noreferrer" data-a="wa" data-id="' + p.id + '" href="' + waLink(p, reminderText(p)) + '">' + (p.reminded_at ? 'Reenviar' : 'Enviar') + '</a></div>';
    }).join('') + '</div><div class="chips"><button class="btn small ghost" data-a="copy" data-id="' + pn[0].id + '">Copiar mensaje</button></div>' +
    '<p class="note">El botón abre WhatsApp con el mensaje escrito. Solo falta tocar Enviar. Cuando la paciente responda, toca Confirmar o Cancelar en su cita.</p>' : '<p class="note">No hay citas por confirmar este día.</p>');
  if (pn.length) h += ui.confirmRelease ? '<p class="err">Se cancelarán ' + pn.length + ' citas sin confirmar y se ofrecerán a la lista de espera.</p><div class="chips"><button class="btn small bad" data-a="release">Sí, liberar</button><button class="btn small ghost" data-a="releaseNo">No</button></div>' : '<div><button class="btn small bad" data-a="releaseAsk">Liberar sin confirmar (' + pn.length + ')</button></div>';
  h += '</section>';

  h += '<section class="card"><h2>Llamar a pendientes</h2>' + (pn.length ? '<p class="note">Citas sin confirmar de este día, por hora. Úsala con quienes no respondieron el WhatsApp.</p><div class="rows">' + pn.map(function (p) {
    return '<div class="row"><span class="t">' + p.appt_time + '</span><span class="who"><b>' + esc(p.name) + '</b><small><a class="tel" href="tel:' + esc(p.phone) + '">' + esc(p.phone) + '</a> <span class="tag">' + (p.reminded_at ? 'WhatsApp enviado' : 'Sin WhatsApp') + '</span>' + (p.no_answer ? ' <span class="tag">No contestó ×' + p.no_answer + '</span>' : '') + '</small></span><span class="acts"><button class="btn small ok" data-a="set" data-s="confirmed" data-id="' + p.id + '">Confirmó</button><button class="btn small bad" data-a="set" data-s="cancelled" data-id="' + p.id + '">Canceló</button><button class="btn small ghost" data-a="noans" data-id="' + p.id + '">No contestó</button></span></div>';
  }).join('') + '</div>' : '<p class="note">Nadie pendiente por llamar este día.</p>') + '</section>';

  h += '<section class="card"><h2>Lista de espera</h2>' + (ui.wait.length ? '<div class="rows">' + ui.wait.map(function (w, i) { return '<div class="row"><span class="who"><b>' + (i + 1) + '. ' + esc(w.name) + '</b><small>' + esc(w.phone) + '</small></span></div>'; }).join('') + '</div>' : '<p class="note">Nadie en espera para este día.</p>') +
    (ui.wait.length && free > 0 ? '<div><button class="btn small" data-a="assign">Asignar al siguiente</button></div>' : '') + '</section>';

  h += '<section class="card"><h2>Resultados</h2><div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat bad"><b>' + (den ? Math.round(st.noshow / den * 100) + '%' : '—') + '</b><span>Inasistencia</span></div><div class="stat ok"><b>' + st.recovered + '</b><span>Cupos recuperados</span></div><div class="stat"><b>' + st.cancelled + '</b><span>Cancelaciones</span></div><div class="stat"><b>' + st.total + '</b><span>Citas registradas</span></div></div></section>';
  return h + '</div></div>';
}

function render() {
  if (!CFG) return;
  var r = route();
  document.querySelectorAll('.tab').forEach(function (a) { if (a.dataset.tab === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  var banner = CFG.demo ? '<div class="demo"><span>Modo demo: datos de ejemplo en un archivo aparte. Tus datos reales no se tocan.</span></div>' : '';
  var scrollY = window.scrollY;
  $app.innerHTML = (SESSION.needsPin && !SESSION.ok) ? loginView() : banner + (r === 'panel' ? adminView() : bookView());
  if (document.body.dataset.keepScroll) window.scrollTo(0, scrollY);
  var f = document.body.dataset.focus; if (f) { var el = document.getElementById(f); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} } }
}
var $app = document.getElementById('app');

/* ---------- Eventos ---------- */
function reload(msg) { if (msg) toast(msg); return refresh(); }
function fail(e) { if (e.message !== 'login') toast(e.message); return refresh(); }
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-a]'); if (!b) return;
  var a = b.dataset.a, v = b.dataset.v, id = b.dataset.id;
  var rec = id && ui.appts.filter(function (x) { return x.id === id; })[0];
  if (a === 'svc') { ui.service = v; ui.time = null; ui.err = ''; return refresh(); }
  if (a === 'day') { ui.date = v; ui.time = null; ui.err = ''; return refresh(); }
  if (a === 'time') { ui.time = v; ui.err = ''; return render(); }
  if (a === 'again') { ui.done = null; ui.waited = null; ui.time = null; ui.err = ''; ui.form = { name: '', phone: '', age: '', ok: false }; return refresh(); }
  if (a === 'asvc') { ui.aService = v; ui.addOpen = false; ui.confirmRelease = false; return refresh(); }
  if (a === 'aday') { ui.aDay = v; ui.addOpen = false; ui.confirmRelease = false; return refresh(); }
  if (a === 'addToggle') { ui.addOpen = !ui.addOpen; ui.err = ''; return render(); }
  if (a === 'releaseAsk') { ui.confirmRelease = true; return render(); }
  if (a === 'releaseNo') { ui.confirmRelease = false; return render(); }
  if (a === 'wa') { api('/api/admin/remind', { id: id }).then(refresh).catch(function () {}); return; } // el enlace se abre solo
  if (a === 'set') { return api('/api/admin/status', { id: id, status: b.dataset.s }).then(function (r) { reload(r.promoted ? 'Cupo liberado y asignado a ' + r.promoted + ' (lista de espera)' : (b.dataset.s === 'cancelled' ? 'Cita cancelada. El cupo queda libre' : '')); }).catch(fail); }
  if (a === 'noans') { return api('/api/admin/noanswer', { id: id }).then(function () { reload('Intento de llamada registrado'); }).catch(fail); }
  if (a === 'release') { return api('/api/admin/release', { service: ui.aService, date: ui.aDay }).then(function (r) { ui.confirmRelease = false; reload(r.released + ' cupos liberados' + (r.reassigned ? ' y ' + r.reassigned + ' reasignados desde la lista de espera' : '')); }).catch(fail); }
  if (a === 'assign') { return api('/api/admin/assign', { service: ui.aService, date: ui.aDay }).then(function (r) { reload('Cupo asignado a ' + r.name); }).catch(fail); }
  if (a === 'copy') { var txt = reminderText(rec); try { navigator.clipboard.writeText(txt).then(function () { toast('Mensaje copiado'); }, function () { toast('No se pudo copiar. Selecciónalo manualmente'); }); } catch (x) { toast('No se pudo copiar. Selecciónalo manualmente'); } return; }
  if (a === 'logout') { return api('/api/logout', {}).then(function () { SESSION.ok = false; render(); }); }
});
document.addEventListener('input', function (e) {
  var i = e.target.id, v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (i === 'f-name') ui.form.name = v; else if (i === 'f-phone') ui.form.phone = v; else if (i === 'f-age') ui.form.age = v; else if (i === 'f-ok') ui.form.ok = v;
  else if (i === 'n-name') ui.add.name = v; else if (i === 'n-phone') ui.add.phone = v; else if (i === 'n-age') ui.add.age = v; else if (i === 'n-time') ui.add.time = v;
  else if (i === 'pin') ui.pin = v;
});
document.addEventListener('submit', function (e) {
  e.preventDefault(); var id = e.target.id;
  if (id === 'login-form') {
    return api('/api/login', { pin: ui.pin }).then(function () { SESSION.ok = true; ui.pin = ''; ui.pinErr = ''; return refresh(); })
      .catch(function (er) { ui.pinErr = er.message; render(); });
  }
  if (id === 'book-form') {
    var s = svc(ui.service), free = s.times.filter(function (t) { return ui.taken.indexOf(t) < 0; });
    var v = validate(ui.form, true); if (v) { ui.err = v; return render(); }
    if (free.length && !ui.time) { ui.err = 'Elige una hora.'; return render(); }
    var person = { service: ui.service, date: ui.date, name: ui.form.name, phone: ui.form.phone, age: Number(ui.form.age) };
    ui.busy = true;
    var p = free.length ? api('/api/book', Object.assign({ time: ui.time }, person)).then(function (a) { ui.done = a; ui.form = { name: '', phone: '', age: '', ok: false }; ui.time = null; })
      : api('/api/waitlist', person).then(function () { ui.waited = { name: ui.form.name.trim(), service: ui.service, date: ui.date }; ui.form = { name: '', phone: '', age: '', ok: false }; });
    return p.then(function () { ui.busy = false; ui.err = ''; return refresh(); }).catch(function (er) { ui.busy = false; ui.err = er.message; if (er.code === 'slot_taken') ui.time = null; return refresh(); });
  }
  if (id === 'add-form') {
    var vv = validate(ui.add, false); if (vv) { ui.err = vv; return render(); }
    var freeT = svc(ui.aService).times.filter(function (t) { return !ui.appts.some(function (a) { return a.appt_time === t; }); });
    return api('/api/admin/add', { service: ui.aService, date: ui.aDay, time: ui.add.time || freeT[0], name: ui.add.name, phone: ui.add.phone, age: Number(ui.add.age) })
      .then(function () { ui.add = { name: '', phone: '', age: '', time: '' }; ui.err = ''; ui.addOpen = false; return reload('Paciente agendada'); })
      .catch(function (er) { ui.err = er.message; return refresh(); });
  }
});
window.addEventListener('hashchange', function () { window.scrollTo(0, 0); refresh(); });
setInterval(function () { if (document.visibilityState === 'visible' && route() === 'panel' && !(SESSION.needsPin && !SESSION.ok) && !ui.addOpen) { document.body.dataset.keepScroll = '1'; refresh().then(function () { delete document.body.dataset.keepScroll; }); } }, 8000);

/* ---------- Inicio ---------- */
function hidePacLink() { var l = document.getElementById('pac-link'); if (l && CFG && CFG.portal === false) l.hidden = true; }
Promise.all([fetch('/api/config').then(function (r) { return r.json(); }), fetch('/api/session').then(function (r) { return r.json(); })]).then(function (r) {
  CFG = r[0]; SESSION = r[1]; hidePacLink();
  if (SESSION.needsPin && !SESSION.ok) return render();
  return refresh();
}).catch(function () { $app.innerHTML = '<div class="fatal" role="alert">No se pudo conectar con la agenda. Revisa que la ventana negra del programa siga abierta.</div>'; });
})();
