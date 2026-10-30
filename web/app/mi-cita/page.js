'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { NoConfig } from '../Shell';
import { longDate, hhmm, STATUS, friendlyError } from '../../lib/util';

function MiCita() {
  const params = useSearchParams();
  const [folio, setFolio] = useState(params.get('folio') || '');
  const [last4, setLast4] = useState('');
  const [appt, setAppt] = useState(null);
  const [svcs, setSvcs] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [askCancel, setAskCancel] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('services').select('id,name').then(({ data }) => {
      const m = {}; (data || []).forEach((s) => { m[s.id] = s.name; }); setSvcs(m);
    });
  }, []);

  if (!supabase) return <NoConfig />;

  async function search(e) {
    e?.preventDefault();
    setBusy(true); setErr(''); setMsg(''); setAskCancel(false);
    const { data, error } = await supabase.rpc('lookup_appointment', { p_folio: folio, p_last4: last4 });
    setBusy(false);
    if (error || !data?.length) { setAppt(null); return setErr(friendlyError(error || 'not_found')); }
    setAppt(data[0]);
  }

  async function change(status) {
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('patient_set_status', { p_folio: appt.folio, p_last4: last4, p_status: status });
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    if (data !== status) return setErr(friendlyError(data)); // 'not_found' o 'not_allowed'
    setAppt({ ...appt, status });
    setAskCancel(false);
    setMsg(status === 'confirmed' ? 'Gracias, tu asistencia quedó confirmada.' : 'Tu cita fue cancelada. Gracias por avisar.');
  }

  return (
    <>
      <section className="hero">
        <h1>Mi cita</h1>
        <p>Escribe tu folio y los últimos 4 dígitos de tu teléfono para confirmar tu asistencia o cancelar.</p>
      </section>

      <form className="card" onSubmit={search}>
        <div className="form">
          <div className="field"><label htmlFor="l-folio">Folio</label><input id="l-folio" placeholder="HG-ABC234" autoCapitalize="characters" value={folio} onChange={(e) => setFolio(e.target.value)} /></div>
          <div className="field"><label htmlFor="l-phone">Últimos 4 dígitos del teléfono</label><input id="l-phone" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value)} /></div>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div><button className="btn" type="submit" disabled={busy}>Buscar mi cita</button></div>
      </form>

      {appt && (
        <section className="card">
          <h2>{appt.name}</h2>
          <dl className="kv">
            <dt>Folio</dt><dd style={{ fontFamily: 'var(--f-mono)' }}>{appt.folio}</dd>
            <dt>Servicio</dt><dd>{svcs[appt.service_id] || appt.service_id}</dd>
            <dt>Día</dt><dd>{longDate(appt.appt_date)}</dd>
            <dt>Hora</dt><dd>{hhmm(appt.appt_time)} h</dd>
            <dt>Estado</dt><dd><span className={`pill ${appt.status}`}>{STATUS[appt.status]}</span></dd>
          </dl>
          {msg && <p role="status" style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
          {appt.status === 'pending' && (
            <div className="chips">
              <button className="btn ok" disabled={busy} onClick={() => change('confirmed')}>Confirmo que asistiré</button>
              <button className="btn bad" disabled={busy} onClick={() => setAskCancel(true)}>Cancelar mi cita</button>
            </div>
          )}
          {appt.status === 'confirmed' && (
            <>
              <p className="note">Tu asistencia está confirmada. Si ya no puedes ir, cancela para que otra persona use tu lugar.</p>
              <div><button className="btn bad" disabled={busy} onClick={() => setAskCancel(true)}>Cancelar mi cita</button></div>
            </>
          )}
          {askCancel && (
            <div className="card" role="alertdialog" aria-label="Confirmar cancelación">
              <p><b>¿Seguro que quieres cancelar?</b> Tu lugar se ofrecerá a otra persona.</p>
              <div className="chips">
                <button className="btn bad" disabled={busy} onClick={() => change('cancelled')}>Sí, cancelar</button>
                <button className="btn ghost" onClick={() => setAskCancel(false)}>No, conservar mi cita</button>
              </div>
            </div>
          )}
          {appt.status === 'cancelled' && <div><Link className="btn a-btn" href="/">Agendar nueva cita</Link></div>}
        </section>
      )}
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="note">Cargando…</p>}><MiCita /></Suspense>;
}
