#!/usr/bin/env node
/*
 * Convierte los datos de la versión local (datos/agenda.db) en un archivo SQL
 * (exportar-web.sql) que se pega en el "SQL Editor" de Supabase para llevar las
 * citas y la lista de espera a la versión web.
 *
 * Uso:   node exportar-para-web.js [--archivo ruta.db] [--solo-vigentes] [--salida archivo.sql]
 *   --solo-vigentes  solo citas de hoy en adelante (más lista de espera vigente)
 *
 * Es seguro ejecutarlo más de una vez: lo que ya existe en la web se omite.
 * No modifica la base local.
 */
const fs = require('node:fs');
const path = require('node:path');
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch { console.error('Necesitas Node.js 22.13 o más reciente (https://nodejs.org).'); process.exit(1); }

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const dbFile = path.resolve(opt('--archivo') || path.join(__dirname, 'datos', 'agenda.db'));
const outFile = path.resolve(opt('--salida') || path.join(__dirname, 'exportar-web.sql'));
const soloVigentes = args.includes('--solo-vigentes');

if (!fs.existsSync(dbFile)) { console.error(`No encuentro la base de datos: ${dbFile}\nUsa la app local al menos una vez, o indica --archivo ruta.db`); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const db = new DatabaseSync(dbFile, { readOnly: true });

const q = (v) => (v === null || v === undefined || v === '' ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");
const ts = (v) => (v ? q(String(v).replace(' ', 'T') + 'Z') : 'null'); // SQLite guarda UTC
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());

const where = soloVigentes ? `where appt_date >= '${today}'` : '';
const appts = db.prepare(`select * from appointments ${where} order by appt_date, appt_time`).all();
const waits = db.prepare(`select * from waitlist ${where} order by created_at`).all();

const skipped = [];
const valid = (r, tag) => {
  const ok = String(r.name || '').trim().length >= 3 && /^[0-9]{10}$/.test(r.phone) && r.age >= 18 && r.age <= 99;
  if (!ok) skipped.push(`${tag} ${r.folio || r.id} (${r.name}): datos que la web no acepta (nombre, teléfono de 10 dígitos o edad 18-99)`);
  return ok;
};

const L = [];
L.push('-- Generado por exportar-para-web.js el ' + new Date().toISOString());
L.push('-- Pegar completo en Supabase > SQL Editor > Run. Se puede repetir sin duplicar datos.');
L.push('begin;');
for (const s of cfg.servicios) {
  L.push(`insert into services (id, name, slots_per_day, slot_minutes, start_time) values (${q(s.id)}, ${q(s.nombre)}, ${+s.cupos}, ${+s.minutos}, ${q(s.inicio)}) on conflict (id) do nothing;`);
}
let na = 0, nw = 0;
for (const a of appts) {
  if (!valid(a, 'Cita')) continue;
  L.push(`insert into appointments (id, folio, service_id, appt_date, appt_time, name, phone, age, status, from_waitlist, reminded_at, no_answer, created_at) values (${q(a.id)}, ${q(a.folio)}, ${q(a.service_id)}, ${q(a.appt_date)}, ${q(a.appt_time)}, ${q(a.name)}, ${q(a.phone)}, ${+a.age}, ${q(a.status)}, ${a.from_waitlist ? 'true' : 'false'}, ${ts(a.reminded_at)}, ${+a.no_answer || 0}, ${ts(a.created_at)}) on conflict do nothing;`);
  na++;
}
for (const w of waits) {
  if (!valid({ ...w, folio: 'espera' }, 'Lista de espera')) continue;
  L.push(`insert into waitlist (id, service_id, appt_date, name, phone, age, created_at) values (${q(w.id)}, ${q(w.service_id)}, ${q(w.appt_date)}, ${q(w.name)}, ${q(w.phone)}, ${+w.age}, ${ts(w.created_at)}) on conflict do nothing;`);
  nw++;
}
L.push('commit;');
fs.writeFileSync(outFile, L.join('\n') + '\n', 'utf8');

console.log(`Listo: ${na} citas y ${nw} personas en lista de espera${soloVigentes ? ' (solo vigentes)' : ''}.`);
if (skipped.length) { console.log(`\nOmitidas ${skipped.length} (corrígelas a mano si hacen falta):`); skipped.forEach((x) => console.log(' - ' + x)); }
console.log(`\nArchivo creado: ${outFile}\nSiguiente paso: abre Supabase > SQL Editor, pega el contenido y presiona Run.`);
