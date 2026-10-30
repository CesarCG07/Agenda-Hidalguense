export const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
export const DIAS3 = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
export const STATUS = { pending: 'Por confirmar', confirmed: 'Confirmada', cancelled: 'Cancelada', attended: 'Asistió', noshow: 'No asistió' };

const pad = (n) => String(n).padStart(2, '0');

// Fecha de hoy en la Ciudad de México, como 'AAAA-MM-DD'
export function todayMX() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function longDate(s) { const d = parseDate(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; }
export function shortDate(s) { const d = parseDate(s); return `${DIAS3[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; }
export function isClinicDay(d) { const w = d.getDay(); return w >= 3 && w <= 5; } // miércoles a viernes

// Próximos n días de atención a partir de 'from' (AAAA-MM-DD), incluyéndolo si aplica
export function clinicDays(from, n) {
  const out = []; const d = parseDate(from);
  while (out.length < n) { if (isClinicDay(d)) out.push(isoDate(d)); d.setDate(d.getDate() + 1); }
  return out;
}
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); }

// Horarios de un servicio según su configuración en la base de datos
export function slotTimes(svc) {
  const [h, m] = svc.start_time.split(':').map(Number);
  const start = h * 60 + m; const out = [];
  for (let i = 0; i < svc.slots_per_day; i++) {
    const t = start + i * svc.slot_minutes;
    out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }
  return out;
}
export const hhmm = (t) => String(t).slice(0, 5);

export function validatePerson({ name, phone, age, ok }) {
  const digits = String(phone).replace(/\D/g, '');
  if (String(name).trim().length < 3) return 'Escribe tu nombre completo.';
  if (digits.length !== 10) return 'El teléfono debe tener 10 dígitos.';
  const a = Number(age);
  if (!(a >= 18 && a <= 99)) return 'Escribe una edad entre 18 y 99.';
  if (ok === false) return 'Acepta el aviso de privacidad para continuar.';
  return '';
}

export function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (m.includes('slot_taken')) return 'Ese horario acaba de ocuparse. Elige otro.';
  if (m.includes('invalid_slot')) return 'Ese día u horario no está disponible.';
  if (m.includes('not_full')) return 'Todavía hay lugares ese día. Elige una hora.';
  if (m.includes('waitlist_full')) return 'La lista de espera de ese día está llena.';
  if (m.includes('not_found')) return 'No encontramos una cita con esos datos. Revisa el folio y los 4 dígitos.';
  if (m.includes('rate_limited')) return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (m.includes('not_allowed')) return 'Esta cita ya no se puede modificar.';
  return 'Ocurrió un problema. Intenta de nuevo en unos minutos.';
}

export function reminderText(a, svcName) {
  return `Hola ${a.name.split(' ')[0]}, te recordamos tu cita de ${svcName.toLowerCase()} en Fundación Hidalguense el ${longDate(a.appt_date)} a las ${hhmm(a.appt_time)} h.\n\nResponde CONFIRMO para asegurar tu lugar, o CANCELO si no podrás asistir, así otra persona podrá usarlo. Si no recibimos respuesta, tu lugar podría liberarse.\nFolio: ${a.folio}`;
}
export function waLink(a, svcName) {
  let d = String(a.phone).replace(/\D/g, '');
  if (d.length === 10) d = '52' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(reminderText(a, svcName))}`;
}
