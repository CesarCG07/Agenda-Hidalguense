(function () {
'use strict';
var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
var DIAS3 = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var STATUS = { pending: 'Por confirmar', confirmed: 'Confirmada', cancelled: 'Cancelada', attended: 'Asistió', noshow: 'No asistió' };
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n) { return String(n).padStart(2, '0'); }
function parse(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
function longDate(s) { var d = parse(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
function shortDate(s) { var d = parse(s); return DIAS3[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()]; }
function isClinic(s) { return CFG.clinicDays.indexOf(parse(s).getDay()) >= 0; }
function clinicDays(from, n) { var out = [], d = from; while (out.length < n) { if (isClinic(d)) out.push(d); d = addDays(d, 1); } return out; }
function svc(id) { return CFG.services.filter(function (s) { return s.id === id; })[0]; }
function bookDays() { return clinicDays(addDays(CFG.today, 1), 9); }
var tt;
function toast(m) { var t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 3800); }

var CFG = null;
function api(path, body) {
  var opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  return fetch(path, opt).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) { var e = new Error(j.message || 'Ocurrió un problema. Intenta de nuevo en unos minutos.'); e.code = j.error; throw e; }
      return j;
    });
  });
}

var EMPTY = { name: '', phone: '', age: '', ok: false };
var ui = {
  service: 'mast', date: null, time: null, taken: [], counts: {}, form: Object.assign({}, EMPTY), err: '', busy: false, done: null, donePhone4: '', waited: null,
  folio: '', last4: '', appt: null, mErr: '', msg: '', askCancel: false, hint: null
};
function route() { return (location.hash || '#agendar').replace('#', '') === 'mi-cita' ? 'mi-cita' : 'agendar'; }
function validate(f) {
  if (String(f.name).trim().length < 3) return 'Escribe tu nombre completo.';
  if (String(f.phone).replace(/\D/g, '').length !== 10) return 'El teléfono debe tener 10 dígitos.';
  var a = Number(f.age); if (!(a >= 18 && a <= 99)) return 'Escribe una edad entre 18 y 99.';
  if (!f.ok) return 'Acepta el aviso de privacidad para continuar.';
  return '';
}

function loadBook() {
  if (!ui.date) ui.date = bookDays()[0];
  return Promise.all([
    api('/api/day?service=' + ui.service + '&date=' + ui.date),
    api('/api/counts?service=' + ui.service + '&dates=' + bookDays().join(',')),
  ]).then(function (r) { ui.taken = r[0].taken; ui.counts = r[1]; });
}
function refresh() {
  var p = route() === 'agendar' ? loadBook() : (CFG.demo && !ui.hint ? api('/api/demo-hint').then(function (h) { ui.hint = h; }).catch(function () {}) : Promise.resolve());
  return p.then(render).catch(function (e) { toast(e.message); });
}

function serviceChips() {
  return '<div class="chips">' + CFG.services.map(function (s) {
    return '<button class="chip" data-a="svc" data-v="' + s.id + '" aria-pressed="' + (s.id === ui.service) + '"><b>' + esc(s.name) + '</b><small>' + s.slots + ' lugares por día</small></button>';
  }).join('') + '</div>';
}
function bookView() {
  var s = svc(ui.service);
  if (ui.done) {
    var a = ui.done;
    return '<section class="card"><h2>Tu cita quedó registrada</h2><div class="folio">' + esc(a.folio) + '</div>' +
      '<dl class="kv"><dt>Servicio</dt><dd>' + esc(s.name) + '</dd><dt>Día</dt><dd>' + longDate(a.appt_date) + '</dd><dt>Hora</dt><dd>' + a.appt_time + ' h</dd><dt>Paciente</dt><dd>' + esc(a.name) + '</dd></dl>' +
      '<p class="note">Guarda tu folio y los últimos 4 dígitos de tu teléfono: los necesitas para confirmar o cancelar en “Mi cita”. Si ya no puedes asistir, cancela para que otra persona use tu lugar.</p>' +
      '<div class="chips"><button class="btn" data-a="goMine">Confirmar mi asistencia</button><button class="btn ghost" data-a="again">Agendar otra cita</button></div></section>';
  }
  if (ui.waited) {
    var w = ui.waited;
    return '<section class="card"><h2>Estás en la lista de espera</h2><p>' + esc(w.name) + ', si alguien cancela tu ' + esc(svc(w.service).name.toLowerCase()) + ' del ' + longDate(w.date) + ', la Fundación se comunicará contigo al ' + esc(w.phone) + ' para ofrecerte el lugar.</p><div><button class="btn ghost" data-a="again">Volver a la agenda</button></div></section>';
  }
  var free = s.times.filter(function (t) { return ui.taken.indexOf(t) < 0; });
  var h = '<section class="hero"><h1>Agenda tu cita</h1><p>Elige el servicio, el día y la hora. Atendemos de miércoles a viernes, de 8:30 a 13:00 h. Si no puedes asistir, cancela desde “Mi cita” para que otra persona use el lugar.</p></section>';
  h += '<section class="card"><div class="step-h"><h2>1. Servicio</h2></div>' + serviceChips() + '</section>';
  h += '<section class="card"><div class="step-h"><h2>2. Día</h2><span>Lugares libres por día</span></div><div class="chips">' + bookDays().map(function (d) {
    var n = d === ui.date ? free.length : Math.max(0, s.slots - (ui.counts[d] || 0));
    return '<button class="chip" data-a="day" data-v="' + d + '" aria-pressed="' + (d === ui.date) + '"><b>' + shortDate(d) + '</b><small>' + (n ? n + ' libres' : 'Lleno') + '</small></button>';
  }).join('') + '</div></section>';
  h += '<form class="card" id="book-form" novalidate><div class="step-h"><h2>3. Hora</h2><span>' + longDate(ui.date) + '</span></div><div class="slots">' + s.times.map(function (t) {
    return '<button type="button" class="slot" data-a="time" data-v="' + t + '" aria-pressed="' + (ui.time === t) + '"' + (ui.taken.indexOf(t) >= 0 ? ' disabled' : '') + '>' + t + '</button>';
  }).join('') + '</div>';
  if (!free.length) h += '<p class="note">Este día ya no tiene lugares. Anótate en la lista de espera: si alguien cancela, la Fundación te avisa.</p>';
  if (!free.length || ui.time) {
    var f = ui.form;
    h += '<div class="step-h"><h2>4. Tus datos</h2>' + (ui.time ? '<span>' + esc(s.name) + ' · ' + shortDate(ui.date) + ' · ' + ui.time + ' h</span>' : '') + '</div><div class="form">' +
      '<div class="field"><label for="f-name">Nombre completo</label><input id="f-name" autocomplete="name" value="' + esc(f.name) + '"></div>' +
      '<div class="field"><label for="f-phone">Teléfono (WhatsApp)</label><input id="f-phone" inputmode="tel" autocomplete="tel" placeholder="771 000 0000" value="' + esc(f.phone) + '"></div>' +
      '<div class="field"><label for="f-age">Edad</label><input id="f-age" inputmode="numeric" value="' + esc(f.age) + '"></div>' +
      '<label class="check full" style="grid-column:1/-1"><input type="checkbox" id="f-ok"' + (f.ok ? ' checked' : '') + '><span>Acepto el aviso de privacidad. Solo se guardan nombre, teléfono y edad para gestionar la cita; no se registran datos clínicos.</span></label></div>' +
      (ui.err ? '<p class="err" role="alert">' + esc(ui.err) + '</p>' : '') +
      '<div><button class="btn" type="submit"' + (ui.busy ? ' disabled' : '') + '>' + (free.length ? 'Reservar mi lugar' : 'Anotarme en lista de espera') + '</button></div>';
  } else h += '<p class="note">Elige una hora disponible para continuar.</p>';
  return h + '</form>';
}
function mineView() {
  var h = '<section class="hero"><h1>Mi cita</h1><p>Escribe tu folio y los últimos 4 dígitos de tu teléfono para confirmar tu asistencia o cancelar.</p></section>';
  h += '<form class="card" id="lookup-form"><div class="form"><div class="field"><label for="l-folio">Folio</label><input id="l-folio" placeholder="HG-ABC234" autocapitalize="characters" autocomplete="off" value="' + esc(ui.folio) + '"></div>' +
    '<div class="field"><label for="l-phone">Últimos 4 dígitos del teléfono</label><input id="l-phone" inputmode="numeric" maxlength="4" autocomplete="off" value="' + esc(ui.last4) + '"></div></div>' +
    (ui.mErr ? '<p class="err" role="alert">' + esc(ui.mErr) + '</p>' : '') + '<div><button class="btn" type="submit"' + (ui.busy ? ' disabled' : '') + '>Buscar mi cita</button></div>' +
    (CFG.demo && ui.hint && ui.hint.folio && !ui.appt ? '<p class="note">Modo demo, para probar: folio <b style="font-family:var(--f-mono)">' + esc(ui.hint.folio) + '</b>, últimos 4 dígitos <b style="font-family:var(--f-mono)">' + esc(ui.hint.last4) + '</b>.</p>' : '') + '</form>';
  var a = ui.appt;
  if (a) {
    h += '<section class="card"><h2>' + esc(a.name) + '</h2><dl class="kv"><dt>Folio</dt><dd style="font-family:var(--f-mono)">' + esc(a.folio) + '</dd><dt>Servicio</dt><dd>' + esc((svc(a.service_id) || {}).name || a.service_id) + '</dd><dt>Día</dt><dd>' + longDate(a.appt_date) + '</dd><dt>Hora</dt><dd>' + a.appt_time + ' h</dd><dt>Estado</dt><dd><span class="pill ' + a.status + '">' + STATUS[a.status] + '</span></dd></dl>';
    if (ui.msg) h += '<p role="status" style="color:var(--ok);font-weight:600">' + esc(ui.msg) + '</p>';
    if (a.status === 'pending') h += '<div class="chips"><button class="btn ok" data-a="pConfirm"' + (ui.busy ? ' disabled' : '') + '>Confirmo que asistiré</button><button class="btn bad" data-a="pAsk">Cancelar mi cita</button></div>';
    else if (a.status === 'confirmed') h += '<p class="note">Tu asistencia está confirmada. Si ya no puedes ir, cancela para que otra persona use tu lugar.</p><div><button class="btn bad" data-a="pAsk">Cancelar mi cita</button></div>';
    else if (a.status === 'cancelled') h += '<p class="note">Esta cita fue cancelada. Puedes agendar una nueva cuando quieras.</p><div><a class="btn a-btn" href="#agendar">Agendar nueva cita</a></div>';
    else h += '<p class="note">Esta cita ya fue atendida o cerrada.</p>';
    if (ui.askCancel) h += '<div class="card" role="alertdialog" aria-label="Confirmar cancelación"><p><b>¿Seguro que quieres cancelar?</b> Tu lugar se ofrecerá a otra persona.</p><div class="chips"><button class="btn bad" data-a="pCancel"' + (ui.busy ? ' disabled' : '') + '>Sí, cancelar</button><button class="btn ghost" data-a="pNo">No, conservar mi cita</button></div></div>';
    h += '</section>';
  }
  return h;
}
var $app = document.getElementById('app');
function render() {
  if (!CFG) return;
  var r = route();
  document.querySelectorAll('.tab').forEach(function (a) { if (a.dataset.tab === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  var banner = CFG.demo ? '<div class="demo"><span>Modo demo: datos de ejemplo. Lo que hagas aquí se ve en el panel del personal.</span></div>' : '';
  $app.innerHTML = banner + (r === 'agendar' ? bookView() : mineView());
}

function search() {
  ui.busy = true; ui.mErr = ''; ui.msg = ''; ui.askCancel = false; render();
  return api('/api/mi-cita/buscar', { folio: ui.folio, last4: ui.last4 })
    .then(function (a) { ui.appt = a; })
    .catch(function (e) { ui.appt = null; ui.mErr = e.message; })
    .then(function () { ui.busy = false; render(); });
}
function change(status) {
  ui.busy = true; ui.mErr = ''; render();
  return api('/api/mi-cita/estado', { folio: ui.appt.folio, last4: ui.last4, status: status })
    .then(function () { ui.appt.status = status; ui.askCancel = false; ui.msg = status === 'confirmed' ? 'Gracias, tu asistencia quedó confirmada.' : 'Tu cita fue cancelada. Gracias por avisar.'; })
    .catch(function (e) { ui.mErr = e.message; })
    .then(function () { ui.busy = false; render(); });
}

document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-a]'); if (!b) return;
  var a = b.dataset.a, v = b.dataset.v;
  if (a === 'svc') { ui.service = v; ui.time = null; ui.err = ''; return refresh(); }
  if (a === 'day') { ui.date = v; ui.time = null; ui.err = ''; return refresh(); }
  if (a === 'time') { ui.time = v; ui.err = ''; return render(); }
  if (a === 'again') { ui.done = null; ui.waited = null; ui.time = null; ui.err = ''; ui.form = Object.assign({}, EMPTY); return refresh(); }
  if (a === 'goMine') { ui.folio = ui.done.folio; ui.last4 = ui.donePhone4; ui.appt = null; ui.mErr = ''; ui.msg = ''; ui.done = null; location.hash = '#mi-cita'; return search(); }
  if (a === 'pConfirm') return change('confirmed');
  if (a === 'pAsk') { ui.askCancel = true; return render(); }
  if (a === 'pNo') { ui.askCancel = false; return render(); }
  if (a === 'pCancel') return change('cancelled');
});
document.addEventListener('input', function (e) {
  var i = e.target.id, v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (i === 'f-name') ui.form.name = v; else if (i === 'f-phone') ui.form.phone = v; else if (i === 'f-age') ui.form.age = v; else if (i === 'f-ok') ui.form.ok = v;
  else if (i === 'l-folio') ui.folio = v; else if (i === 'l-phone') ui.last4 = v;
});
document.addEventListener('submit', function (e) {
  e.preventDefault(); var id = e.target.id;
  if (id === 'lookup-form') return search();
  if (id === 'book-form') {
    var s = svc(ui.service), free = s.times.filter(function (t) { return ui.taken.indexOf(t) < 0; });
    var v = validate(ui.form); if (v) { ui.err = v; return render(); }
    if (free.length && !ui.time) { ui.err = 'Elige una hora.'; return render(); }
    var person = { service: ui.service, date: ui.date, name: ui.form.name, phone: ui.form.phone, age: Number(ui.form.age) };
    var phone4 = String(ui.form.phone).replace(/\D/g, '').slice(-4);
    ui.busy = true; render();
    var p = free.length
      ? api('/api/book', Object.assign({ time: ui.time }, person)).then(function (a) { ui.done = a; ui.donePhone4 = phone4; ui.form = Object.assign({}, EMPTY); ui.time = null; })
      : api('/api/waitlist', person).then(function () { ui.waited = { name: ui.form.name.trim(), phone: ui.form.phone, service: ui.service, date: ui.date }; ui.form = Object.assign({}, EMPTY); });
    return p.then(function () { ui.busy = false; ui.err = ''; return refresh(); })
      .catch(function (er) { ui.busy = false; ui.err = er.message; if (er.code === 'slot_taken') ui.time = null; return refresh(); });
  }
});
window.addEventListener('hashchange', function () { window.scrollTo(0, 0); ui.mErr = ''; refresh(); });

api('/api/config').then(function (c) { CFG = c; return refresh(); })
  .catch(function () { $app.innerHTML = '<div class="fatal" role="alert">No se pudo conectar con la agenda. Intenta de nuevo en unos minutos o comunícate con la Fundación.</div>'; });
})();
