'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { NoConfig } from '../Shell';
import { todayMX, addDays, clinicDays, isClinicDay, parseDate, longDate, shortDate, slotTimes, hhmm, STATUS, waLink, reminderText, validatePerson } from '../../lib/util';

function adminDays() {
  const t = todayMX(); const past = []; let d = addDays(t, -1);
  while (past.length < 2) { if (isClinicDay(parseDate(d))) past.unshift(d); d = addDays(d, -1); }
  return [...past, ...clinicDays(t, 7)];
}
const Pill = ({ s }) => <span className={`pill ${s}`}>{STATUS[s]}</span>;

export default function AdminPage() {
  const [session, setSession] = useState(undefined);
  const [isStaff, setIsStaff] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) { setIsStaff(null); return; }
    supabase.from('staff').select('user_id').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setIsStaff(!!data));
  }, [session]);

  if (!supabase) return <NoConfig />;
  if (session === undefined) return <p className="note">Cargando…</p>;
  if (!session) return <Login />;
  if (isStaff === null) return <p className="note">Verificando acceso…</p>;
  if (!isStaff) {
    return (
      <section className="card login">
        <h2>Sin permiso</h2>
        <p>Tu cuenta ({session.user.email}) no está autorizada para usar el panel. Pide a quien administra el sistema que la agregue.</p>
        <div><button className="btn ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div>
      </section>
    );
  }
  return <Panel email={session.user.email} />;
}

function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr('Correo o contraseña incorrectos.');
  }
  return (
    <>
      <section className="hero"><h1>Panel de control</h1><p>Acceso para el personal de la Fundación.</p></section>
      <form className="card login" onSubmit={go}>
        <div className="field"><label htmlFor="a-mail">Correo</label><input id="a-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="a-pw">Contraseña</label><input id="a-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err && <p className="err" role="alert">{err}</p>}
        <div><button className="btn" type="submit" disabled={busy}>Entrar</button></div>
      </form>
    </>
  );
}

function Panel({ email }) {
  const days = useMemo(adminDays, []);
  const [services, setServices] = useState([]);
  const [sid, setSid] = useState('mast');
  const [day, setDay] = useState(clinicDays(todayMX(), 1)[0]);
  const [appts, setAppts] = useState([]);
  const [wait, setWait] = useState([]);
  const [totals, setTotals] = useState({ A: 0, N: 0, rec: 0, can: 0, all: 0 });
  const [toastMsg, setToast] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState({ name: '', phone: '', age: '', time: '' });
  const [err, setErr] = useState('');
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [exporting, setExporting] = useState(false);

  const svc = services.find((s) => s.id === sid);
  const toast = (m) => { setToast(m); setTimeout(() => setToast(''), 3600); };

  useEffect(() => { supabase.from('services').select('*').eq('active', true).order('name').then(({ data }) => data && setServices(data)); }, []);

  const load = useCallback(async () => {
    const [a, w, t] = await Promise.all([
      supabase.from('appointments').select('*').eq('service_id', sid).eq('appt_date', day).neq('status', 'cancelled'),
      supabase.from('waitlist').select('*').eq('service_id', sid).eq('appt_date', day).order('created_at'),
      supabase.rpc('staff_stats'),
    ]);
    setAppts(a.data || []); setWait(w.data || []);
    const st = t.data || {};
    setTotals({ A: st.attended || 0, N: st.noshow || 0, rec: st.recovered || 0, can: st.cancelled || 0, all: st.total || 0 });
  }, [sid, day]);

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  if (!svc) return <p className="note">Cargando…</p>;
  const times = slotTimes(svc);
  const byTime = {}; appts.forEach((a) => { byTime[hhmm(a.appt_time)] = a; });
  const count = (s) => appts.filter((a) => a.status === s).length;
  const conf = count('confirmed'), pend = count('pending'), att = count('attended'), nos = count('noshow');
  const free = times.length - appts.length;
  const pn = appts.filter((a) => a.status === 'pending').sort((a, b) => a.appt_time.localeCompare(b.appt_time));
  const pct = (n) => `${(n / times.length) * 100}%`;
  const freeTimes = times.filter((t) => !byTime[t]);

  async function exportAll() {
    setExporting(true);
    try {
      const rows = [];
      for (let from = 0; ; from += 1000) { // Supabase entrega máximo 1000 filas por consulta
        const { data, error } = await supabase.from('appointments').select('*')
          .order('appt_date').order('appt_time').order('id').range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      const names = Object.fromEntries(services.map((x) => [x.id, x.name]));
      const cell = (v) => {
        let t = String(v ?? '');
        if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // evita que Excel lo interprete como fórmula
        return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
      };
      const mx = (v) => (v ? new Date(v).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' }) : '');
      const head = ['Folio', 'Servicio', 'Fecha', 'Hora', 'Nombre', 'Teléfono', 'Edad', 'Estado', 'De lista de espera', 'Recordatorio enviado', 'Intentos sin respuesta', 'Registrada'];
      const body = rows.map((a) => [a.folio, names[a.service_id] || a.service_id, a.appt_date, hhmm(a.appt_time), a.name, a.phone, a.age, STATUS[a.status], a.from_waitlist ? 'Sí' : 'No', mx(a.reminded_at), a.no_answer, mx(a.created_at)]);
      const csv = '\uFEFF' + [head, ...body].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `citas-${todayMX()}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`Descargadas ${rows.length} citas (se abre con Excel)`);
    } catch (e) { toast('No se pudo descargar. Intenta de nuevo.'); }
    setExporting(false);
  }

  async function update(id, patch, okMsg) {
    const { error } = await supabase.from('appointments').update(patch).eq('id', id);
    if (error) toast('No se pudo guardar. Revisa tu conexión.'); else if (okMsg) toast(okMsg);
    load();
  }
  async function setStatus(a, status) {
    if (status === 'cancelled') {
      await update(a.id, { status }, wait.length ? `Cupo liberado y ofrecido a ${wait[0].name} (lista de espera)` : 'Cita cancelada. El cupo queda libre');
    } else await update(a.id, { status });
  }
  async function release() {
    const ids = pn.map((a) => a.id);
    const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).in('id', ids);
    setConfirmRelease(false);
    toast(error ? 'No se pudo liberar.' : `${ids.length} cupos liberados${wait.length ? ' y reasignados desde la lista de espera' : ''}`);
    load();
  }
  async function assignNext() {
    const w = wait[0]; const t = freeTimes[0];
    if (!w || !t) return;
    const { error } = await supabase.from('appointments').insert({ service_id: sid, appt_date: day, appt_time: t, name: w.name, phone: w.phone, age: w.age, from_waitlist: true });
    if (!error) await supabase.from('waitlist').delete().eq('id', w.id);
    toast(error ? 'Ese horario ya se ocupó.' : `Cupo asignado a ${w.name}`); load();
  }
  async function submitAdd(e) {
    e.preventDefault();
    const v = validatePerson({ ...add, ok: true }); if (v) return setErr(v);
    const t = add.time || freeTimes[0];
    const { error } = await supabase.from('appointments').insert({ service_id: sid, appt_date: day, appt_time: t, name: add.name.trim(), phone: add.phone.replace(/\D/g, ''), age: Number(add.age) });
    if (error) return setErr('Ese horario ya se ocupó.');
    setAdd({ name: '', phone: '', age: '', time: '' }); setErr(''); setAddOpen(false); toast('Paciente agendado'); load();
  }
  const markSent = (a) => update(a.id, { reminded_at: new Date().toISOString() });
  async function copy(a) {
    try { await navigator.clipboard.writeText(reminderText(a, svc.name)); toast('Mensaje copiado'); }
    catch { toast('No se pudo copiar. Selecciónalo manualmente'); }
  }

  const statTotal = totals.A + totals.N;
  return (
    <>
      <section className="hero">
        <h1>Panel de control</h1>
        <p>Control diario de citas, asistencia y lista de espera. Lo que se cancela se reasigna solo. <button className="btn small ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión ({email})</button></p>
      </section>

      <section className="card">
        <div className="step-h"><h2>Servicio</h2></div>
        <div className="chips">
          {services.map((s) => (
            <button key={s.id} className="chip" aria-pressed={s.id === sid} onClick={() => { setSid(s.id); setAddOpen(false); setConfirmRelease(false); }}>
              <b>{s.name}</b><small>{s.slots_per_day} lugares por día</small>
            </button>
          ))}
        </div>
        <div className="step-h"><h2>Día</h2></div>
        <div className="chips">
          {days.map((d) => (
            <button key={d} className="chip" aria-pressed={d === day} onClick={() => { setDay(d); setAddOpen(false); setConfirmRelease(false); }}>
              <b>{shortDate(d)}</b><small>{d === todayMX() ? 'Hoy' : d < todayMX() ? 'Pasado' : 'Próximo'}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="panel">
        <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
          <section className="card">
            <h2>{svc.name} · {longDate(day)}</h2>
            <div className="stats">
              <div className="stat"><b>{appts.length}/{times.length}</b><span>Cupos ocupados</span></div>
              <div className="stat ok"><b>{conf + att}</b><span>Confirmadas o atendidas</span></div>
              <div className="stat warn"><b>{pend}</b><span>Por confirmar</span></div>
              <div className="stat"><b>{free}</b><span>Libres</span></div>
              {nos > 0 && <div className="stat bad"><b>{nos}</b><span>No asistieron</span></div>}
            </div>
            <div className="bar-s" role="img" aria-label="Distribución de cupos">
              <i style={{ width: pct(conf + att), background: 'var(--ok)' }} /><i style={{ width: pct(pend), background: 'var(--warn)' }} /><i style={{ width: pct(nos), background: 'var(--bad)' }} />
            </div>
            <div className="legend"><span><i style={{ background: 'var(--ok)' }} />Confirmadas/atendidas</span><span><i style={{ background: 'var(--warn)' }} />Por confirmar</span><span><i style={{ background: 'var(--bad)' }} />No asistieron</span><span><i style={{ background: 'var(--line)' }} />Libres</span></div>
          </section>

          <section className="card">
            <div className="step-h"><h2>Agenda del día</h2><button className="btn small ghost" onClick={() => { setAddOpen(!addOpen); setErr(''); }}>{addOpen ? 'Cerrar' : '+ Agregar paciente'}</button></div>
            {addOpen && (freeTimes.length ? (
              <form onSubmit={submitAdd}>
                <div className="form">
                  <div className="field"><label htmlFor="n-name">Nombre</label><input id="n-name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></div>
                  <div className="field"><label htmlFor="n-phone">Teléfono</label><input id="n-phone" inputMode="tel" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} /></div>
                  <div className="field"><label htmlFor="n-age">Edad</label><input id="n-age" inputMode="numeric" value={add.age} onChange={(e) => setAdd({ ...add, age: e.target.value })} /></div>
                  <div className="field"><label htmlFor="n-time">Hora</label><select id="n-time" value={add.time || freeTimes[0]} onChange={(e) => setAdd({ ...add, time: e.target.value })}>{freeTimes.map((t) => <option key={t}>{t}</option>)}</select></div>
                </div>
                {err && <p className="err" role="alert">{err}</p>}
                <div style={{ marginTop: 12 }}><button className="btn small" type="submit">Agendar</button></div>
              </form>
            ) : <p className="note">No hay horarios libres este día.</p>)}
            <div className="rows">
              {times.map((t) => {
                const a = byTime[t];
                if (!a) return <div key={t} className="row free"><span className="t">{t}</span><span className="who">Libre</span></div>;
                return (
                  <div key={t} className="row">
                    <span className="t">{t}</span>
                    <span className="who"><b>{a.name}{a.from_waitlist && <small> · de lista de espera</small>}</b>
                      <small>{a.phone} · {a.age} años · {a.folio}{a.reminded_at && <> · <span className="sent">Recordatorio enviado</span></>}</small></span>
                    <Pill s={a.status} />
                    <span className="acts">
                      {a.status === 'pending' && <>
                        <a className="btn small ok a-btn" href={waLink(a, svc.name)} target="_blank" rel="noopener noreferrer" onClick={() => markSent(a)}>WhatsApp</a>
                        <button className="btn small ghost" onClick={() => setStatus(a, 'confirmed')}>Confirmar</button>
                        <button className="btn small bad" onClick={() => setStatus(a, 'cancelled')}>Cancelar</button></>}
                      {a.status === 'confirmed' && <>
                        <button className="btn small ok" onClick={() => setStatus(a, 'attended')}>Asistió</button>
                        <button className="btn small bad" onClick={() => setStatus(a, 'noshow')}>No asistió</button>
                        <button className="btn small ghost" onClick={() => setStatus(a, 'cancelled')}>Cancelar</button></>}
                      {(a.status === 'attended' || a.status === 'noshow') && <button className="btn small ghost" onClick={() => setStatus(a, 'confirmed')}>Deshacer</button>}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
          <section className="card">
            <h2>Recordatorios</h2>
            {pn.length ? <>
              <p className="note">Mensaje que recibe cada paciente:</p>
              <div className="msg">{reminderText(pn[0], svc.name)}</div>
              <div className="rows">
                {pn.map((p) => (
                  <div key={p.id} className="row">
                    <span className="who"><b>{p.name}</b><small>{hhmm(p.appt_time)} h{p.reminded_at && <> · <span className="sent">Enviado</span></>}</small></span>
                    <a className="btn small ok a-btn" href={waLink(p, svc.name)} target="_blank" rel="noopener noreferrer" onClick={() => markSent(p)}>{p.reminded_at ? 'Reenviar' : 'Enviar'}</a>
                  </div>
                ))}
              </div>
              <div className="chips"><button className="btn small ghost" onClick={() => copy(pn[0])}>Copiar mensaje</button></div>
              <p className="note">El botón abre WhatsApp con el mensaje escrito. Solo falta tocar Enviar. Si la paciente responde por WhatsApp, toca Confirmar o Cancelar en su cita. Si usa “Mi cita”, el cambio llega solo.</p>
            </> : <p className="note">No hay citas por confirmar este día.</p>}
            {pn.length > 0 && (confirmRelease
              ? <><p className="err">Se cancelarán {pn.length} citas sin confirmar y se ofrecerán a la lista de espera.</p>
                  <div className="chips"><button className="btn small bad" onClick={release}>Sí, liberar</button><button className="btn small ghost" onClick={() => setConfirmRelease(false)}>No</button></div></>
              : <div><button className="btn small bad" onClick={() => setConfirmRelease(true)}>Liberar sin confirmar ({pn.length})</button></div>)}
          </section>

          <section className="card">
            <h2>Llamar a pendientes</h2>
            {pn.length ? <>
              <p className="note">Citas sin confirmar de este día, por hora. Úsala con quienes no respondieron el WhatsApp.</p>
              <div className="rows">
                {pn.map((p) => (
                  <div key={p.id} className="row">
                    <span className="t">{hhmm(p.appt_time)}</span>
                    <span className="who"><b>{p.name}</b>
                      <small><a className="tel" href={`tel:${p.phone}`}>{p.phone}</a>{' '}
                        <span className="tag">{p.reminded_at ? 'WhatsApp enviado' : 'Sin WhatsApp'}</span>
                        {p.no_answer > 0 && <> <span className="tag">No contestó ×{p.no_answer}</span></>}</small></span>
                    <span className="acts">
                      <button className="btn small ok" onClick={() => setStatus(p, 'confirmed')}>Confirmó</button>
                      <button className="btn small bad" onClick={() => setStatus(p, 'cancelled')}>Canceló</button>
                      <button className="btn small ghost" onClick={() => update(p.id, { no_answer: p.no_answer + 1 }, 'Intento de llamada registrado')}>No contestó</button>
                    </span>
                  </div>
                ))}
              </div></> : <p className="note">Nadie pendiente por llamar este día.</p>}
          </section>

          <section className="card">
            <h2>Lista de espera</h2>
            {wait.length ? <div className="rows">{wait.map((w, i) => <div key={w.id} className="row"><span className="who"><b>{i + 1}. {w.name}</b><small>{w.phone}</small></span></div>)}</div> : <p className="note">Nadie en espera para este día.</p>}
            {wait.length > 0 && free > 0 && <div><button className="btn small" onClick={assignNext}>Asignar al siguiente</button></div>}
          </section>

          <section className="card">
            <h2>Resultados</h2>
            <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="stat bad"><b>{statTotal ? `${Math.round((totals.N / statTotal) * 100)}%` : '—'}</b><span>Inasistencia</span></div>
              <div className="stat ok"><b>{totals.rec}</b><span>Cupos recuperados</span></div>
              <div className="stat"><b>{totals.can}</b><span>Cancelaciones</span></div>
              <div className="stat"><b>{totals.all}</b><span>Citas registradas</span></div>
            </div>
            <div><button className="btn small ghost" onClick={exportAll} disabled={exporting}>{exporting ? 'Preparando…' : 'Descargar todas las citas (Excel)'}</button></div>
          </section>
        </div>
      </div>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  );
}
