# Agenda Hidalguense · Versión web (siguiente paso)

> Esta versión es **opcional**: se monta solo si, tras probar el MVP local (`../local`), la Fundación decide que quiere que las pacientes se autogestionen. Ver `../README.md` para decidir.

Agenda de citas con base de datos compartida. Las pacientes agendan, confirman y cancelan solas; el personal lo ve de inmediato en el panel. Cuando alguien cancela, el lugar pasa automáticamente a la lista de espera.

**Costo a este volumen: $0** (Supabase plan gratuito + hosting estático gratuito). El WhatsApp sigue siendo con enlaces prellenados desde el panel.

## Cómo está armado
- `supabase/schema.sql`: tablas, seguridad y reglas. Las pacientes nunca leen las tablas: solo usan funciones que devuelven lo mínimo (cupos ocupados, su propia cita con folio + 4 últimos dígitos). Una restricción en la base impide dos citas en el mismo horario.
- `app/`: sitio en Next.js. `/` agendar, `/mi-cita` confirmar o cancelar, `/admin` panel del personal con inicio de sesión.
- `lib/`: conexión a la base y utilidades (horarios, mensaje de recordatorio, enlace de WhatsApp).

## Puesta en marcha (unos 30 minutos)

### 1. Base de datos (Supabase)
1. Crea una cuenta en supabase.com y un proyecto nuevo (región más cercana). Guarda la contraseña de la base.
2. Entra a **SQL Editor > New query**, pega todo `supabase/schema.sql` y presiona **Run**.
3. Crea al personal: **Authentication > Users > Add user** (correo y contraseña; marca "Auto Confirm User").
4. Autoriza a cada persona en el SQL Editor (cambia el correo):
   ```sql
   insert into staff (user_id, name)
   select id, 'Nombre' from auth.users where email = 'registro@ejemplo.org';
   ```
5. **Authentication > Sign In / Providers > Email**: desactiva "Allow new users to sign up" para que nadie más cree cuentas.
6. **Project Settings > API**: copia la *Project URL* y la clave *anon public*.

### 2. Sitio (hosting estático gratuito)
El sitio se exporta como archivos estáticos (carpeta `out`, menos de 1 MB), así que funciona en cualquier hosting gratuito. La opción recomendada es **Cloudflare Pages**, porque sirve archivos estáticos sin límite de tráfico y no pide tarjeta. Alternativas: Netlify (plan gratuito con tope duro) o Vercel Hobby (revisar la condición de uso no comercial).
1. Sube esta carpeta a un repositorio de GitHub (`node_modules` ya está en `.gitignore`).
2. En Cloudflare: **Workers & Pages > Create > Pages > Connect to Git**, elige el repositorio.
3. Configura la compilación:
   - Build command: `npm run build`
   - Build output directory: `out`
   - Environment variables: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (los valores del paso 1.6)
4. **Save and Deploy**. Cloudflare entrega una dirección `*.pages.dev`; el dominio propio es opcional y tiene costo aparte.

Para probarlo en tu computadora: copia `.env.example` a `.env.local`, llena los valores, y ejecuta `npm install` y `npm run dev`.

## Llevar los datos del piloto local a la web
Si primero usaron la versión local y luego pasan a la web:
1. Completa los pasos 1 y 2 de arriba (la base debe tener `schema.sql` aplicado). Los servicios de `local/config.json` deben tener los mismos `id` que la tabla `services` (por defecto `mast`, `dens`, `orient`).
2. Cierra la agenda local y, en la carpeta `local/`, haz doble clic en `exportar-para-web.bat` (Windows) o `exportar-para-web.command` (Mac), o ejecuta `node exportar-para-web.js`. Con `--solo-vigentes` solo se llevan las citas de hoy en adelante.
3. Se crea `exportar-web.sql`. Ábrelo, copia todo, pégalo en **SQL Editor** de Supabase y presiona **Run**.
4. Se conservan folios, estados, asistencia y fechas de registro, así que los folios ya entregados siguen funcionando. Se puede repetir sin duplicar. Las filas que la web no acepta (teléfono sin 10 dígitos, edad fuera de 18-99) se listan al exportar y se omiten.
5. Revisa los totales en el Panel contra la versión local. El archivo `.sql` contiene datos personales: bórralo después.

## Ajustes que se hacen en la base, sin tocar código
Cupos y horarios por servicio (tabla `services`, en Table Editor): `slots_per_day`, `slot_minutes` y `start_time`. Los días de atención (miércoles a viernes) están en `valid_slot()` dentro de `schema.sql` y en `isClinicDay()` en `lib/util.js`.

## Qué considerar
- **Privacidad:** se guardan nombre, teléfono y edad, sin datos clínicos. Hay que publicar el aviso de privacidad completo (LFPDPPP) y enlazarlo en la casilla del formulario.
- **Folio y límite de intentos:** el folio es aleatorio y se pide junto con los últimos 4 dígitos del teléfono. La base limita los intentos: máximo 6 reservas y 15 consultas/cambios de cita cada 10 minutos por conexión, y un tope general (60 reservas y 300 consultas cada 10 minutos) para frenar ataques masivos. Al excederse, la paciente ve "Demasiados intentos". **Advertencia:** la identificación de la conexión usa los encabezados de Supabase (`cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`) y **no se verificó en un proyecto real**. Si no los recibiera, todas las pacientes compartirían un solo contador por conexión y, en un día muy concurrido, el tope por conexión podría bloquear a gente legítima; en ese caso, subir los números en `rate_check(...)` dentro de `schema.sql`. Solo cuentan los intentos que la base responde sin error; un intento de reserva que falla (horario ocupado, por ejemplo) no se contabiliza.
- **Descarga a Excel:** en *Panel de control > Resultados*, el botón "Descargar todas las citas (Excel)" baja un `.csv` con todas las citas (sin tope de filas). Úsenlo como respaldo semanal.
- **Plan gratuito de Supabase:** pausa los proyectos tras una semana sin actividad; con uso de miércoles a viernes no debería pasar. Conviene exportar respaldos cada cierto tiempo.
- **Recordatorios:** siguen siendo manuales con el botón de WhatsApp del panel. Si más adelante quieren automatizarlos, se puede conectar la API de WhatsApp o un envío de correo programado sin cambiar la base.
