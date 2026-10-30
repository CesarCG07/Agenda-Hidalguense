-- Agenda Hidalguense · esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run

create extension if not exists pgcrypto;

-- ---------- Servicios ----------
create table if not exists services (
  id            text primary key,
  name          text not null,
  slots_per_day int  not null check (slots_per_day > 0),
  slot_minutes  int  not null default 30 check (slot_minutes > 0),
  start_time    time not null default '08:30',
  active        boolean not null default true
);

insert into services (id, name, slots_per_day, slot_minutes) values
  ('mast',   'Mastografía',         10, 25),
  ('dens',   'Densitometría',        8, 30),
  ('orient', 'Orientación médica',   6, 30)
on conflict (id) do nothing;

-- ---------- Personal autorizado ----------
create table if not exists staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name    text
);

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

-- ---------- Utilidades ----------
create or replace function mx_today() returns date
language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date; $$;

-- Folio aleatorio sin caracteres ambiguos (no se puede adivinar en secuencia)
create or replace function gen_folio() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  f text;
begin
  loop
    f := 'HG-';
    for i in 1..6 loop
      f := f || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from appointments where folio = f);
  end loop;
  return f;
end $$;

-- ---------- Límite de intentos (pacientes) ----------
-- Evita que alguien adivine folios o llene los cupos con reservas falsas.
-- Cuenta intentos por dispositivo (según la IP que reenvía Supabase) y además un tope global.
-- Es una protección básica: no sustituye a un CAPTCHA si algún día hubiera abuso real.
create table if not exists rate_hits (
  id     bigint generated always as identity primary key,
  bucket text not null,
  key    text not null,
  at     timestamptz not null default now()
);
create index if not exists rate_hits_idx on rate_hits (bucket, key, at);
alter table rate_hits enable row level security;   -- sin políticas: nadie la lee ni la escribe directamente

create or replace function client_key() returns text
language plpgsql stable as $$
declare h json; v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then h := null;
  end;
  v := coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1));
  return coalesce(nullif(trim(v), ''), 'desconocido');
end $$;

create or replace function rate_check(p_bucket text, p_per_client int, p_global int) returns void
language plpgsql security definer set search_path = public as $$
declare k text := client_key(); n_client int; n_global int;
begin
  delete from rate_hits where at < now() - interval '1 day';
  select count(*) filter (where key = k), count(*) into n_client, n_global
    from rate_hits where bucket = p_bucket and at > now() - interval '10 minutes';
  if n_client >= p_per_client or n_global >= p_global then raise exception 'rate_limited'; end if;
  insert into rate_hits (bucket, key) values (p_bucket, k);
end $$;
revoke all on function rate_check from public;

-- ---------- Citas ----------
do $$ begin
  create type appt_status as enum ('pending','confirmed','cancelled','attended','noshow');
exception when duplicate_object then null; end $$;

create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  folio         text unique not null default gen_folio(),
  service_id    text not null references services(id),
  appt_date     date not null,
  appt_time     time not null,
  name          text not null check (length(trim(name)) >= 3),
  phone         text not null check (phone ~ '^[0-9]{10}$'),
  age           int  not null check (age between 18 and 99),
  status        appt_status not null default 'pending',
  from_waitlist boolean not null default false,
  reminded_at   timestamptz,
  no_answer     int not null default 0,
  created_at    timestamptz not null default now()
);

-- Un horario no puede ocupar dos citas activas (evita dobles reservas aunque dos personas reserven a la vez)
create unique index if not exists appt_slot_unique
  on appointments (service_id, appt_date, appt_time) where status <> 'cancelled';
create index if not exists appt_day_idx on appointments (service_id, appt_date);

-- ---------- Lista de espera ----------
create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  service_id text not null references services(id),
  appt_date  date not null,
  name       text not null check (length(trim(name)) >= 3),
  phone      text not null check (phone ~ '^[0-9]{10}$'),
  age        int  not null check (age between 18 and 99),
  created_at timestamptz not null default now()
);
create index if not exists wait_day_idx on waitlist (service_id, appt_date, created_at);

-- ---------- Seguridad por filas (RLS) ----------
alter table services     enable row level security;
alter table staff        enable row level security;
alter table appointments enable row level security;
alter table waitlist     enable row level security;

drop policy if exists services_read   on services;
drop policy if exists services_write  on services;
drop policy if exists staff_self      on staff;
drop policy if exists appt_staff      on appointments;
drop policy if exists wait_staff      on waitlist;

create policy services_read  on services for select using (true);
create policy services_write on services for all using (is_staff()) with check (is_staff());
create policy staff_self     on staff    for select using (user_id = auth.uid());
-- Las pacientes NO leen ni escriben tablas directamente: solo usan las funciones de abajo.
create policy appt_staff on appointments for all using (is_staff()) with check (is_staff());
create policy wait_staff on waitlist     for all using (is_staff()) with check (is_staff());

-- ---------- Reasignación automática desde la lista de espera ----------
create or replace function promote_waitlist() returns trigger
language plpgsql security definer set search_path = public as $$
declare w waitlist%rowtype;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.appt_date >= mx_today() then
    select * into w from waitlist
      where service_id = new.service_id and appt_date = new.appt_date
      order by created_at limit 1 for update skip locked;
    if found then
      insert into appointments (service_id, appt_date, appt_time, name, phone, age, from_waitlist)
        values (new.service_id, new.appt_date, new.appt_time, w.name, w.phone, w.age, true);
      delete from waitlist where id = w.id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_promote on appointments;
create trigger trg_promote after update of status on appointments
  for each row execute function promote_waitlist();

-- ---------- Funciones públicas para pacientes ----------
-- Solo devuelven lo mínimo necesario; nunca datos de otras personas.

create or replace function valid_slot(p_service text, p_date date, p_time time) returns boolean
language plpgsql stable as $$
declare s services%rowtype; i int;
begin
  select * into s from services where id = p_service and active;
  if not found then return false; end if;
  if extract(dow from p_date) not in (3,4,5) then return false; end if;       -- miércoles a viernes
  if p_date <= mx_today() or p_date > mx_today() + 60 then return false; end if;
  for i in 0..s.slots_per_day-1 loop
    if p_time = s.start_time + make_interval(mins => i * s.slot_minutes) then return true; end if;
  end loop;
  return false;
end $$;

create or replace function taken_times(p_service text, p_date date) returns setof time
language sql stable security definer set search_path = public as $$
  select appt_time from appointments
  where service_id = p_service and appt_date = p_date and status <> 'cancelled';
$$;

create or replace function booked_count(p_service text, p_dates date[]) returns table(d date, n int)
language sql stable security definer set search_path = public as $$
  select appt_date, count(*)::int from appointments
  where service_id = p_service and appt_date = any(p_dates) and status <> 'cancelled'
  group by appt_date;
$$;

create or replace function book_appointment(
  p_service text, p_date date, p_time time, p_name text, p_phone text, p_age int)
returns table (folio text, service_id text, appt_date date, appt_time time, name text, status appt_status)
language plpgsql security definer set search_path = public as $$
declare phone_d text := regexp_replace(p_phone, '\D', '', 'g'); a appointments%rowtype;
begin
  perform rate_check('book', 6, 60);
  if not valid_slot(p_service, p_date, p_time) then raise exception 'invalid_slot'; end if;
  begin
    insert into appointments (service_id, appt_date, appt_time, name, phone, age)
      values (p_service, p_date, p_time, trim(p_name), phone_d, p_age) returning * into a;
  exception when unique_violation then raise exception 'slot_taken';
  end;
  return query select a.folio, a.service_id, a.appt_date, a.appt_time, a.name, a.status;
end $$;

create or replace function join_waitlist(
  p_service text, p_date date, p_name text, p_phone text, p_age int) returns void
language plpgsql security definer set search_path = public as $$
declare s services%rowtype; phone_d text := regexp_replace(p_phone, '\D', '', 'g'); n int;
begin
  perform rate_check('book', 6, 60);
  select * into s from services where id = p_service and active;
  if not found or extract(dow from p_date) not in (3,4,5)
     or p_date <= mx_today() or p_date > mx_today() + 60 then raise exception 'invalid_slot'; end if;
  select count(*) into n from appointments
    where service_id = p_service and appt_date = p_date and status <> 'cancelled';
  if n < s.slots_per_day then raise exception 'not_full'; end if;
  if (select count(*) from waitlist where service_id = p_service and appt_date = p_date) >= 30 then
    raise exception 'waitlist_full'; end if;
  insert into waitlist (service_id, appt_date, name, phone, age) values (p_service, p_date, trim(p_name), phone_d, p_age);
end $$;

create or replace function lookup_appointment(p_folio text, p_last4 text)
returns table (folio text, service_id text, appt_date date, appt_time time, name text, status appt_status)
language plpgsql volatile security definer set search_path = public as $$
begin
  perform rate_check('lookup', 15, 300);
  return query select a.folio, a.service_id, a.appt_date, a.appt_time, a.name, a.status
    from appointments a
    where a.folio = upper(trim(p_folio)) and right(a.phone, 4) = regexp_replace(p_last4, '\D', '', 'g');
end $$;

-- Devuelve el estado nuevo ('confirmed' o 'cancelled'), o 'not_found' / 'not_allowed'.
-- Los fallos se devuelven como valor y no como error a propósito: un error deshace la transacción
-- completa y borraría el conteo del límite de intentos.
create or replace function patient_set_status(p_folio text, p_last4 text, p_status appt_status)
returns text
language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype;
begin
  perform rate_check('lookup', 15, 300);
  if p_status not in ('confirmed','cancelled') then return 'not_allowed'; end if;
  select * into a from appointments
    where folio = upper(trim(p_folio)) and right(phone, 4) = regexp_replace(p_last4, '\D', '', 'g');
  if not found then return 'not_found'; end if;
  if a.appt_date < mx_today() or a.status not in ('pending','confirmed') then return 'not_allowed'; end if;
  if p_status = 'confirmed' and a.status <> 'pending' then return 'not_allowed'; end if;
  update appointments set status = p_status where id = a.id;
  return p_status::text;
end $$;

revoke all on function taken_times, booked_count, book_appointment, join_waitlist,
  lookup_appointment, patient_set_status from public;
grant execute on function taken_times, booked_count, book_appointment, join_waitlist,
  lookup_appointment, patient_set_status to anon, authenticated;

-- Resultados del panel, calculados en la base (la API devuelve como máximo 1000 filas por consulta).
-- Corre con los permisos de quien llama: una persona que no es del personal ve ceros.
create or replace function staff_stats() returns json
language sql stable set search_path = public as $$
  select json_build_object(
    'attended',  count(*) filter (where status = 'attended'),
    'noshow',    count(*) filter (where status = 'noshow'),
    'recovered', count(*) filter (where from_waitlist and status <> 'cancelled'),
    'cancelled', count(*) filter (where status = 'cancelled'),
    'total',     count(*))
  from appointments;
$$;
revoke all on function staff_stats from public;
grant execute on function staff_stats to authenticated;

-- ---------- Alta del personal ----------
-- 1) Crea el usuario en Supabase > Authentication > Users > Add user (correo y contraseña).
-- 2) Autorízalo con (cambia el correo):
--    insert into staff (user_id, name) select id, 'Nombre' from auth.users where email = 'registro@ejemplo.org';
