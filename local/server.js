'use strict';
/*
 * Agenda Hidalguense · MVP local
 * Servidor sin dependencias externas: solo requiere Node.js 22.13 o superior.
 * Guarda todo en un archivo (datos/agenda.db). Nada sale de esta computadora.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch (e) {
  console.error('\nEsta aplicación necesita Node.js 22.13 o superior (versión LTS).');
  console.error('Descárgalo gratis en https://nodejs.org y vuelve a abrirla.\n');
  process.exit(1);
}

const ROOT = __dirname;
const DEMO = process.argv.includes('--demo');

// ---------- Configuración ----------
let CFG;
try { CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); }
catch (e) { console.error('No se pudo leer config.json: ' + e.message); process.exit(1); }

const PORT = Number(process.env.PORT || CFG.puerto || 3000);
const LAN = CFG.acceso === 'red-local';
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const PIN = String(CFG.pin || '');
const CLINIC_DAYS = CFG.dias_atencion || [3, 4, 5];
const MAX_AHEAD = CFG.dias_anticipacion_max || 60;
const PORTAL = CFG.portal_pacientes !== false; // página /paciente para que las pacientes agenden y confirmen
const SERVICES = (CFG.servicios || []).map((s) => ({ id: s.id, name: s.nombre, slots: s.cupos, minutes: s.minutos, start: s.inicio || '08:30' }));
if (!SERVICES.length) { console.error('config.json no tiene servicios.'); process.exit(1); }
if (LAN && !PIN) {
  console.error('\nPara usar la agenda desde otras computadoras de la red hay que definir un "pin" en config.json.');
  console.error('Sin PIN solo puede abrirse desde esta computadora.\n');
  process.exit(1);
}

// ---------- Fechas ----------
const pad = (n) => String(n).padStart(2, '0');
const todayMX = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseDate(s)) === s;
const isClinicDay = (s) => CLINIC_DAYS.includes(parseDate(s).getDay());

function slotTimes(svc) {
  const [h, m] = svc.start.split(':').map(Number);
  const out = [];
  for (let i = 0; i < svc.slots; i++) { const t = h * 60 + m + i * svc.minutes; out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`); }
  return out;
}
const svcById = (id) => SERVICES.find((s) => s.id === id);

// ---------- Base de datos ----------
const DATA_DIR = path.join(ROOT, 'datos');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, DEMO ? 'demo.db' : 'agenda.db'));
db.exec(`
  pragma journal_mode = wal;
  create table if not exists appointments (
    id text primary key,
    folio text unique not null,
    service_id text not null,
    appt_date text not null,
    appt_time text not null,
    name text not null,
    phone text not null,
    age integer not null,
    status text not null default 'pending'
      check (status in ('pending','confirmed','cancelled','attended','noshow')),
    from_waitlist integer not null default 0,
    reminded_at text,
    no_answer integer not null default 0,
    created_at text not null default (datetime('now'))
  );
  create unique index if not exists appt_slot_unique
    on appointments (service_id, appt_date, appt_time) where status <> 'cancelled';
  create index if not exists appt_day_idx on appointments (service_id, appt_date);
  create table if not exists waitlist (
    id text primary key,
    service_id text not null,
    appt_date text not null,
    name text not null,
    phone text not null,
    age integer not null,
    created_at text not null default (datetime('now'))
  );
`);

const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const plain = (r) => (r ? { ...r } : r);
const plainAll = (rs) => rs.map((r) => ({ ...r }));

function tx(fn) {
  db.exec('begin immediate');
  try { const r = fn(); db.exec('commit'); return r; }
  catch (e) { db.exec('rollback'); throw e; }
}

class HttpError extends Error { constructor(status, code, msg) { super(msg); this.status = status; this.code = code; } }
const bad = (code, msg) => new HttpError(400, code, msg);

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genFolio() {
  for (;;) {
    let f = 'HG-';
    for (let i = 0; i < 6; i++) f += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (!one('select 1 as x from appointments where folio = ?', f)) return f;
  }
}

function cleanPerson(b) {
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').replace(/\D/g, '');
  const age = Number(b.age);
  if (name.length < 3 || name.length > 120) throw bad('invalid_name', 'Escribe el nombre completo.');
  if (phone.length !== 10) throw bad('invalid_phone', 'El teléfono debe tener 10 dígitos.');
  if (!Number.isInteger(age) || age < 18 || age > 99) throw bad('invalid_age', 'La edad debe estar entre 18 y 99.');
  return { name, phone, age };
}

function checkDay(svc, date, { allowToday }) {
  if (!svc) throw bad('invalid_slot', 'Servicio no válido.');
  if (!isDate(date) || !isClinicDay(date)) throw bad('invalid_slot', 'Ese día no hay atención.');
  const t = todayMX();
  if (date < (allowToday ? t : addDays(t, 1)) || date > addDays(t, MAX_AHEAD)) throw bad('invalid_slot', 'Esa fecha no está disponible.');
}

function insertAppt(svc, date, time, person, fromWait) {
  const id = crypto.randomUUID();
  try {
    run('insert into appointments (id, folio, service_id, appt_date, appt_time, name, phone, age, from_waitlist) values (?,?,?,?,?,?,?,?,?)',
      id, genFolio(), svc.id, date, time, person.name, person.phone, person.age, fromWait ? 1 : 0);
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) throw bad('slot_taken', 'Ese horario acaba de ocuparse. Elige otro.');
    throw e;
  }
  return plain(one('select * from appointments where id = ?', id));
}

function book(b, { allowToday }) {
  const svc = svcById(b.service);
  const person = cleanPerson(b);
  checkDay(svc, b.date, { allowToday });
  if (!slotTimes(svc).includes(b.time)) throw bad('invalid_slot', 'Ese horario no existe.');
  return tx(() => insertAppt(svc, b.date, b.time, person, false));
}

const activeCount = (sid, date) => one("select count(*) as n from appointments where service_id = ? and appt_date = ? and status <> 'cancelled'", sid, date).n;

function joinWaitlist(b) {
  const svc = svcById(b.service);
  const person = cleanPerson(b);
  checkDay(svc, b.date, { allowToday: false });
  return tx(() => {
    if (activeCount(svc.id, b.date) < svc.slots) throw bad('not_full', 'Todavía hay lugares ese día.');
    if (one('select count(*) as n from waitlist where service_id = ? and appt_date = ?', svc.id, b.date).n >= 30) throw bad('waitlist_full', 'La lista de espera de ese día está llena.');
    run('insert into waitlist (id, service_id, appt_date, name, phone, age) values (?,?,?,?,?,?)', crypto.randomUUID(), svc.id, b.date, person.name, person.phone, person.age);
    return { ok: true };
  });
}

// Pasa el primer lugar de la lista de espera al horario indicado
function promote(sid, date, time) {
  const w = one('select * from waitlist where service_id = ? and appt_date = ? order by created_at, rowid limit 1', sid, date);
  if (!w) return null;
  const a = insertAppt(svcById(sid), date, time, { name: w.name, phone: w.phone, age: w.age }, true);
  run('delete from waitlist where id = ?', w.id);
  return a;
}

function setStatus(id, status) {
  if (!['pending', 'confirmed', 'cancelled', 'attended', 'noshow'].includes(status)) throw bad('invalid_status', 'Estado no válido.');
  return tx(() => {
    const a = one('select * from appointments where id = ?', id);
    if (!a) throw new HttpError(404, 'not_found', 'No se encontró la cita.');
    run('update appointments set status = ? where id = ?', status, id);
    let promoted = null;
    if (status === 'cancelled' && a.status !== 'cancelled' && a.appt_date >= todayMX()) promoted = promote(a.service_id, a.appt_date, a.appt_time);
    return { promoted: promoted ? promoted.name : null };
  });
}

function findByFolio(folio, last4) {
  const f = String(folio || '').trim().toUpperCase();
  const l = String(last4 || '').replace(/\D/g, '');
  const a = l.length === 4 ? one('select * from appointments where folio = ?', f) : null;
  if (!a || a.phone.slice(-4) !== l) throw new HttpError(404, 'not_found', 'No encontramos una cita con esos datos. Revisa el folio y los 4 dígitos.');
  return a;
}
function patientLookup(b) {
  const a = findByFolio(b.folio, b.last4);
  return { folio: a.folio, service_id: a.service_id, appt_date: a.appt_date, appt_time: a.appt_time, name: a.name, status: a.status };
}
function patientSetStatus(b) {
  const a = findByFolio(b.folio, b.last4);
  const status = String(b.status);
  if (!['confirmed', 'cancelled'].includes(status) || a.appt_date < todayMX() || !['pending', 'confirmed'].includes(a.status) || (status === 'confirmed' && a.status !== 'pending'))
    throw bad('not_allowed', 'Esta cita ya no se puede modificar.');
  setStatus(a.id, status);
  return { status };
}

function release(sid, date) {
  return tx(() => {
    const ps = all("select * from appointments where service_id = ? and appt_date = ? and status = 'pending' order by appt_time", sid, date);
    let moved = 0;
    for (const a of ps) {
      run("update appointments set status = 'cancelled' where id = ?", a.id);
      if (date >= todayMX() && promote(sid, date, a.appt_time)) moved++;
    }
    return { released: ps.length, reassigned: moved };
  });
}

function assignNext(sid, date) {
  return tx(() => {
    const svc = svcById(sid);
    const taken = all("select appt_time from appointments where service_id = ? and appt_date = ? and status <> 'cancelled'", sid, date).map((r) => r.appt_time);
    const free = slotTimes(svc).find((t) => !taken.includes(t));
    if (!free) throw bad('slot_taken', 'No hay horarios libres.');
    const a = promote(sid, date, free);
    if (!a) throw bad('no_waitlist', 'No hay nadie en lista de espera.');
    return { name: a.name };
  });
}

function stats() {
  const rows = all('select status, from_waitlist from appointments');
  const n = (f) => rows.filter(f).length;
  return {
    attended: n((r) => r.status === 'attended'), noshow: n((r) => r.status === 'noshow'),
    recovered: n((r) => r.from_waitlist && r.status !== 'cancelled'), cancelled: n((r) => r.status === 'cancelled'), total: rows.length,
  };
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita que Excel interprete texto como fórmula
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const mxTime = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' }) : '');
function exportCsv() {
  const head = ['Folio', 'Servicio', 'Fecha', 'Hora', 'Nombre', 'Teléfono', 'Edad', 'Estado', 'De lista de espera', 'Recordatorio enviado', 'Intentos sin respuesta', 'Registrada'];
  const names = { pending: 'Por confirmar', confirmed: 'Confirmada', cancelled: 'Cancelada', attended: 'Asistió', noshow: 'No asistió' };
  const rows = all('select * from appointments order by appt_date, appt_time, service_id').map((a) =>
    [a.folio, svcById(a.service_id)?.name || a.service_id, a.appt_date, a.appt_time, a.name, a.phone, a.age, names[a.status], a.from_waitlist ? 'Sí' : 'No', mxTime(a.reminded_at), a.no_answer, mxTime(a.created_at)]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---------- Datos de ejemplo (solo con --demo) ----------
function seedDemo() {
  if (one('select count(*) as n from appointments').n > 0) return;
  const names = ['María Guadalupe Ríos', 'Ana Laura Cruz', 'Rosa Elena Martínez', 'Patricia Olvera', 'Juana Hernández', 'Elvira Sánchez', 'Carmen Ortega', 'Lucía Vargas', 'Teresa Montes', 'Silvia Rangel', 'Leticia Mejía', 'Marta Beltrán', 'Irma Cornejo', 'Verónica Pérez', 'Alma Delia Ruiz', 'Josefina Lara', 'Gloria Muñoz', 'Yolanda Reyes', 'Beatriz Aguilar', 'Norma Téllez', 'Esther Palacios', 'Dolores Cano', 'Graciela Soto', 'Concepción Ávila', 'Rocío Zúñiga', 'Margarita Islas', 'Lourdes Camacho', 'Felipa Guerrero', 'Raquel Trejo', 'Sofía Barrera'];
  let k = 0;
  const person = () => { const i = k++; return { name: names[i % names.length], phone: '77155501' + pad((i * 7) % 100), age: 40 + ((i * 3) % 25) }; };
  const clinicFrom = (start, n, dir) => { const out = []; let d = start; while (out.length < n) { d = addDays(d, dir); if (isClinicDay(d)) out.push(d); } return dir < 0 ? out.reverse() : out; };
  const t = todayMX();
  const mast = svcById('mast') || SERVICES[0];
  const times = slotTimes(mast);
  const put = (svc, date, time, status, p) => { const a = insertAppt(svc, date, time, p || person(), false); run('update appointments set status = ? where id = ?', status, a.id); };
  clinicFrom(t, 2, -1).forEach((d) => times.forEach((tm, i) => put(mast, d, tm, i % 3 === 1 ? 'noshow' : 'attended')));
  const upcoming = [isClinicDay(t) ? t : clinicFrom(t, 1, 1)[0]];
  upcoming.push(...clinicFrom(upcoming[0], 2, 1));
  times.slice(0, 8).forEach((tm, i) => put(mast, upcoming[0], tm, i % 3 === 2 ? 'pending' : 'confirmed'));
  times.forEach((tm, i) => put(mast, upcoming[1], tm, i % 5 < 2 ? 'pending' : 'confirmed'));
  times.slice(0, 4).forEach((tm) => put(mast, upcoming[2], tm, 'pending'));
  for (let i = 0; i < 2; i++) { const p = person(); run('insert into waitlist (id, service_id, appt_date, name, phone, age) values (?,?,?,?,?,?)', crypto.randomUUID(), mast.id, upcoming[1], p.name, p.phone, p.age); }
  const dens = svcById('dens');
  if (dens) slotTimes(dens).slice(0, 3).forEach((tm, i) => put(dens, upcoming[0], tm, i ? 'confirmed' : 'pending'));
}
if (DEMO) seedDemo();

// ---------- Límite de intentos (solo en modo red, para pacientes) ----------
const hits = new Map();
function rateLimit(req, bucket, max) {
  const key = bucket + '|' + (req.socket.remoteAddress || '?');
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= max) throw new HttpError(429, 'rate', 'Demasiados intentos. Espera unos minutos e intenta de nuevo.');
  list.push(now); hits.set(key, list);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 600000)) hits.delete(k); }, 600000).unref();

// ---------- Sesiones (solo si hay PIN) ----------
const sessions = new Map();
let failures = [];
function cookieToken(req) { const m = /(?:^|;\s*)hg=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return m ? m[1] : null; }
const isAuthed = (req) => !PIN || sessions.has(cookieToken(req));

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };
const PUBLIC = path.join(ROOT, 'public');

function send(res, status, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(isObj ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 100000) { reject(bad('too_big', 'Solicitud demasiado grande.')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(bad('bad_json', 'Solicitud no válida.')); } });
  });
}
const q = (url, k) => url.searchParams.get(k) || '';

async function api(req, res, url) {
  const p = url.pathname; const m = req.method;
  if (m === 'POST' && !/^application\/json/.test(req.headers['content-type'] || '')) throw bad('bad_type', 'Solicitud no válida.');

  if (p === '/api/session' && m === 'GET') return send(res, 200, { needsPin: !!PIN, ok: isAuthed(req) });
  if (p === '/api/login' && m === 'POST') {
    const now = Date.now(); failures = failures.filter((t) => now - t < 60000);
    if (failures.length >= 5) throw new HttpError(429, 'locked', 'Demasiados intentos. Espera un minuto.');
    const b = await readBody(req);
    const a = Buffer.from(String(b.pin || '')), e = Buffer.from(PIN);
    if (!PIN || a.length !== e.length || !crypto.timingSafeEqual(a, e)) { failures.push(now); throw new HttpError(401, 'bad_pin', 'PIN incorrecto.'); }
    const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, now);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `hg=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` });
  }
  if (p === '/api/logout' && m === 'POST') { sessions.delete(cookieToken(req)); return send(res, 200, { ok: true }, { 'Set-Cookie': 'hg=; Max-Age=0; Path=/' }); }

  if (p === '/api/config' && m === 'GET') {
    return send(res, 200, { today: todayMX(), clinicDays: CLINIC_DAYS, maxAhead: MAX_AHEAD, demo: DEMO, portal: PORTAL,
      services: SERVICES.map((s) => ({ id: s.id, name: s.name, slots: s.slots, times: slotTimes(s) })) });
  }
  if (p === '/api/demo-hint' && m === 'GET') {
    if (!DEMO) throw new HttpError(404, 'not_found', 'No encontrado.');
    const a = one("select folio, phone from appointments where status = 'pending' and appt_date >= ? order by appt_date, appt_time limit 1", todayMX());
    return send(res, 200, a ? { folio: a.folio, last4: a.phone.slice(-4) } : {});
  }

  // Rutas de pacientes: abiertas si el portal está activo; si no, solo con sesión
  const staff = isAuthed(req);
  const patientRoute = ['/api/day', '/api/counts', '/api/book', '/api/waitlist', '/api/mi-cita/buscar', '/api/mi-cita/estado'].includes(p);
  if (patientRoute) {
    if (!staff && !PORTAL) throw new HttpError(401, 'login', 'Inicia sesión.');
    const limited = LAN && !(PIN && staff); // en modo red se limitan los intentos de pacientes
    if (p === '/api/day' && m === 'GET') {
      const sid = q(url, 'service'), date = q(url, 'date');
      if (!svcById(sid) || !isDate(date)) throw bad('invalid_slot', 'Consulta no válida.');
      return send(res, 200, { taken: all("select appt_time from appointments where service_id = ? and appt_date = ? and status <> 'cancelled'", sid, date).map((r) => r.appt_time) });
    }
    if (p === '/api/counts' && m === 'GET') {
      const sid = q(url, 'service'); const dates = q(url, 'dates').split(',').filter(isDate).slice(0, 31);
      if (!svcById(sid)) throw bad('invalid_slot', 'Consulta no válida.');
      const out = {}; dates.forEach((d) => { out[d] = activeCount(sid, d); });
      return send(res, 200, out);
    }
    if (m === 'POST') {
      if (limited) rateLimit(req, p === '/api/book' || p === '/api/waitlist' ? 'book' : 'lookup', p === '/api/book' || p === '/api/waitlist' ? 12 : 20);
      const b = await readBody(req);
      if (p === '/api/book') return send(res, 200, book(b, { allowToday: false }));
      if (p === '/api/waitlist') return send(res, 200, joinWaitlist(b));
      if (p === '/api/mi-cita/buscar') return send(res, 200, patientLookup(b));
      if (p === '/api/mi-cita/estado') return send(res, 200, patientSetStatus(b));
    }
  }

  // Rutas del personal: siempre con sesión si hay PIN
  if (!staff) throw new HttpError(401, 'login', 'Inicia sesión.');

  if (p === '/api/admin/day' && m === 'GET') {
    const sid = q(url, 'service'), date = q(url, 'date');
    if (!svcById(sid) || !isDate(date)) throw bad('invalid_slot', 'Consulta no válida.');
    return send(res, 200, {
      appts: plainAll(all("select * from appointments where service_id = ? and appt_date = ? and status <> 'cancelled' order by appt_time", sid, date)),
      waitlist: plainAll(all('select * from waitlist where service_id = ? and appt_date = ? order by created_at, rowid', sid, date)),
    });
  }
  if (p === '/api/admin/stats' && m === 'GET') return send(res, 200, stats());
  if (p === '/api/admin/export.csv' && m === 'GET') {
    return send(res, 200, exportCsv(), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="citas-${todayMX()}.csv"` });
  }
  if (m === 'POST' && p.startsWith('/api/admin/')) {
    const b = await readBody(req);
    if (p === '/api/admin/status') return send(res, 200, setStatus(String(b.id), String(b.status)));
    if (p === '/api/admin/add') return send(res, 200, book(b, { allowToday: true }));
    if (p === '/api/admin/remind') { run("update appointments set reminded_at = datetime('now') where id = ?", String(b.id)); return send(res, 200, { ok: true }); }
    if (p === '/api/admin/noanswer') { run('update appointments set no_answer = no_answer + 1 where id = ?', String(b.id)); return send(res, 200, { ok: true }); }
    if (p === '/api/admin/release') { if (!svcById(b.service) || !isDate(b.date)) throw bad('invalid_slot', 'Consulta no válida.'); return send(res, 200, release(b.service, b.date)); }
    if (p === '/api/admin/assign') { if (!svcById(b.service) || !isDate(b.date)) throw bad('invalid_slot', 'Consulta no válida.'); return send(res, 200, assignNext(b.service, b.date)); }
  }
  throw new HttpError(404, 'not_found', 'No encontrado.');
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/paciente') { if (!PORTAL) return send(res, 404, 'No encontrado', { 'Content-Type': 'text/plain; charset=utf-8' }); rel = '/paciente.html'; }
  if (!PORTAL && rel === '/paciente.js') return send(res, 404, 'No encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'No encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!LAN) { // protege contra páginas externas que intenten hablar con el servidor local
      const host = String(req.headers.host || '').replace(/:\d+$/, '');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return send(res, 403, 'Acceso no permitido', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET') return send(res, 405, 'No permitido', { 'Content-Type': 'text/plain; charset=utf-8' });
    serveStatic(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
    console.error(e);
    send(res, 500, { error: 'server', message: 'Ocurrió un problema en el servidor.' });
  }
});

function openBrowser(url) {
  const { spawn } = require('child_process');
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch (e) { /* si no se puede, el usuario abre el enlace a mano */ }
}

server.listen(PORT, HOST, () => {
  console.log('\n  Agenda Hidalguense' + (DEMO ? '  [MODO DEMO: datos de ejemplo]' : ''));
  console.log(`  Panel del personal:  http://localhost:${PORT}`);
  if (PORTAL) console.log(`  Vista de pacientes:  http://localhost:${PORT}/paciente`);
  if (LAN) console.log('  Acceso desde la red local habilitado (requiere PIN).');
  console.log('  Para cerrar la agenda, cierra esta ventana o presiona Ctrl+C.\n');
  if (process.argv.includes('--abrir')) openBrowser(`http://localhost:${PORT}`);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\nEl puerto ${PORT} ya está en uso. ¿Ya tienes la agenda abierta? Si no, cambia "puerto" en config.json.\n`);
  else console.error(e);
  process.exit(1);
});
