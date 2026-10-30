'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { NoConfig } from './Shell';
import { clinicDays, addDays, todayMX, longDate, shortDate, slotTimes, hhmm, validatePerson, friendlyError } from '../lib/util';

const EMPTY = { name: '', phone: '', age: '', ok: false };

export default function BookPage() {
  const [services, setServices] = useState([]);
  const [service, setService] = useState(null);
  const [counts, setCounts] = useState({});
  const [taken, setTaken] = useState([]);
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [waited, setWaited] = useState(null);
  const [loadErr, setLoadErr] = useState('');

  const days = useMemo(() => clinicDays(addDays(todayMX(), 1), 9), []);
  const svc = services.find((s) => s.id === service);
  const times = svc ? slotTimes(svc) : [];

  useEffect(() => {
    if (!supabase) return;
    supabase.from('services').select('*').eq('active', true).order('name').then(({ data, error }) => {
      if (error || !data?.length) { setLoadErr('No pudimos cargar los servicios. Intenta de nuevo en unos minutos.'); return; }
      setServices(data); setService(data.find((s) => s.id === 'mast')?.id || data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!supabase || !service) return;
    setDate((d) => d || days[0]);
    supabase.rpc('booked_count', { p_service: service, p_dates: days }).then(({ data }) => {
      const m = {}; (data || []).forEach((r) => { m[r.d] = r.n; }); setCounts(m);
    });
  }, [service, days]);

  useEffect(() => {
    if (!supabase || !service || !date) return;
    supabase.rpc('taken_times', { p_service: service, p_date: date }).then(({ data }) => {
      setTaken((data || []).map(hhmm));
    });
  }, [service, date]);

  if (!supabase) return <NoConfig />;
  if (loadErr) return <div className="fatal" role="alert">{loadErr}</div>;
  if (!svc) return <p className="note">Cargando agenda…</p>;

  const free = times.filter((t) => !taken.includes(t));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const freeLeft = (d) => (d === date ? free.length : Math.max(0, svc.slots_per_day - (counts[d] || 0)));

  async function refresh() {
    const { data } = await supabase.rpc('taken_times', { p_service: service, p_date: date });
    setTaken((data || []).map(hhmm));
  }

  async function submit(e) {
    e.preventDefault();
    const v = validatePerson(form);
    if (v) return setErr(v);
    setBusy(true); setErr('');
    const person = { p_name: form.name.trim(), p_phone: form.phone, p_age: Number(form.age) };
    if (!free.length) {
      const { error } = await supabase.rpc('join_waitlist', { p_service: service, p_date: date, ...person });
      setBusy(false);
      if (error) return setErr(friendlyError(error));
      setWaited({ name: form.name.trim(), phone: form.phone, service: svc.name, date });
      return;
    }
    if (!time) { setBusy(false); return setErr('Elige una hora.'); }
    const { data, error } = await supabase.rpc('book_appointment', { p_service: service, p_date: date, p_time: time, ...person });
    setBusy(false);
    if (error) { setErr(friendlyError(error)); setTime(null); refresh(); return; }
    setDone(Array.isArray(data) ? data[0] : data);
    setForm(EMPTY); setTime(null);
  }

  function again() { setDone(null); setWaited(null); setTime(null); setErr(''); refresh(); }

  if (done) {
    return (
      <section className="card">
        <h2>Tu cita quedó registrada</h2>
        <div className="folio">{done.folio}</div>
        <dl className="kv">
          <dt>Servicio</dt><dd>{svc.name}</dd>
          <dt>Día</dt><dd>{longDate(done.appt_date)}</dd>
          <dt>Hora</dt><dd>{hhmm(done.appt_time)} h</dd>
          <dt>Paciente</dt><dd>{done.name}</dd>
        </dl>
        <p className="note">Guarda tu folio y los últimos 4 dígitos de tu teléfono: los necesitas para confirmar o cancelar en “Mi cita”. Te enviaremos un recordatorio por WhatsApp. Si ya no puedes asistir, cancela para que otra persona use tu lugar.</p>
        <div className="chips">
          <Link className="btn a-btn" href={`/mi-cita?folio=${done.folio}`}>Confirmar mi asistencia</Link>
          <button className="btn ghost" onClick={again}>Agendar otra cita</button>
        </div>
      </section>
    );
  }
  if (waited) {
    return (
      <section className="card">
        <h2>Estás en la lista de espera</h2>
        <p>{waited.name}, si alguien cancela tu {waited.service.toLowerCase()} del {longDate(waited.date)}, te avisaremos por WhatsApp al {waited.phone} y tendrás unas horas para aceptar el lugar.</p>
        <div><button className="btn ghost" onClick={again}>Volver a la agenda</button></div>
      </section>
    );
  }

  return (
    <>
      <section className="hero">
        <h1>Agenda tu cita</h1>
        <p>Elige el servicio, el día y la hora. Atendemos de miércoles a viernes, de 8:30 a 13:00 h. Si no puedes asistir, cancela desde “Mi cita” para que otra persona use el lugar.</p>
      </section>

      <section className="card">
        <div className="step-h"><h2>1. Servicio</h2></div>
        <div className="chips">
          {services.map((s) => (
            <button key={s.id} className="chip" aria-pressed={s.id === service} onClick={() => { setService(s.id); setTime(null); setErr(''); }}>
              <b>{s.name}</b><small>{s.slots_per_day} lugares por día</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="step-h"><h2>2. Día</h2><span>Lugares libres por día</span></div>
        <div className="chips">
          {days.map((d) => {
            const n = freeLeft(d);
            return (
              <button key={d} className="chip" aria-pressed={d === date} onClick={() => { setDate(d); setTime(null); setErr(''); }}>
                <b>{shortDate(d)}</b><small>{n ? `${n} libres` : 'Lleno'}</small>
              </button>
            );
          })}
        </div>
      </section>

      <form className="card" onSubmit={submit} noValidate>
        <div className="step-h"><h2>3. Hora</h2><span>{date && longDate(date)}</span></div>
        <div className="slots">
          {times.map((t) => (
            <button key={t} type="button" className="slot" aria-pressed={time === t} disabled={taken.includes(t)} onClick={() => { setTime(t); setErr(''); }}>{t}</button>
          ))}
        </div>
        {!free.length && <p className="note">Este día ya no tiene lugares. Anótate en la lista de espera: si alguien cancela, te avisamos.</p>}
        {!free.length || time ? (
          <>
            <div className="step-h"><h2>4. Tus datos</h2>{time && <span>{svc.name} · {shortDate(date)} · {time} h</span>}</div>
            <div className="form">
              <div className="field"><label htmlFor="f-name">Nombre completo</label><input id="f-name" autoComplete="name" value={form.name} onChange={set('name')} /></div>
              <div className="field"><label htmlFor="f-phone">Teléfono (WhatsApp)</label><input id="f-phone" inputMode="tel" autoComplete="tel" placeholder="771 000 0000" value={form.phone} onChange={set('phone')} /></div>
              <div className="field"><label htmlFor="f-age">Edad</label><input id="f-age" inputMode="numeric" value={form.age} onChange={set('age')} /></div>
              <label className="check full" style={{ gridColumn: '1/-1' }}>
                <input type="checkbox" id="f-ok" checked={form.ok} onChange={set('ok')} />
                <span>Acepto el aviso de privacidad. Solo se guardan nombre, teléfono y edad para gestionar la cita; no se registran datos clínicos.</span>
              </label>
            </div>
            {err && <p className="err" role="alert">{err}</p>}
            <div><button className="btn" type="submit" disabled={busy}>{busy ? 'Enviando…' : free.length ? 'Reservar mi lugar' : 'Anotarme en lista de espera'}</button></div>
          </>
        ) : <p className="note">Elige una hora disponible para continuar.</p>}
      </form>
    </>
  );
}
