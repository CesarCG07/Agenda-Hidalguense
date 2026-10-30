'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Agendar cita' },
  { href: '/mi-cita', label: 'Mi cita' },
  { href: '/admin', label: 'Panel de control' },
];

export default function Shell({ children }) {
  const path = usePathname();
  return (
    <>
      <header className="top">
        <div className="wrap bar">
          <div className="brand">
            <span className="mark" aria-hidden="true"></span>
            <div><b>Agenda Hidalguense</b><small>Citas de mastografía y servicios de atención</small></div>
          </div>
          <nav className="tabs" aria-label="Secciones">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className="tab" aria-current={path === t.href ? 'page' : undefined}>{t.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap" id="app">{children}</main>
    </>
  );
}

export function NoConfig() {
  return (
    <div className="fatal" role="alert">
      Falta conectar la base de datos. Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver README).
    </div>
  );
}
