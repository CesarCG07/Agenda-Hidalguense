# Guía de uso · Agenda Hidalguense (versión local)

## Instalación (una sola vez)
1. Instala **Node.js**, versión LTS (22.13 o superior), desde https://nodejs.org. Es gratis. No hay que instalar nada más.
2. Copia esta carpeta (`local`) a la computadora que se usará para la agenda, por ejemplo en Documentos.

## Abrir la agenda
- **Windows:** doble clic en `iniciar.bat`.
- **Mac:** doble clic en `iniciar.command`. La primera vez, si macOS lo bloquea: clic derecho > Abrir.
- Se abre una ventana negra (déjala abierta mientras se use la agenda) y el navegador en `http://localhost:3000`.
- Para cerrar la agenda, cierra la ventana negra.

Para practicar con datos de ejemplo sin tocar los reales: `iniciar-demo.bat` o `iniciar-demo.command`.

## Probar los dos lados: paciente y administrador
La agenda tiene dos vistas que trabajan juntas:
- **Panel del personal:** `http://localhost:3000` (con el PIN, si hay uno).
- **Vista de paciente:** `http://localhost:3000/paciente` (también se abre con el botón *Vista de paciente* del panel).

**Cómo verlas a la vez:** abre el panel en una ventana normal del navegador y la vista de paciente en una ventana de incógnito (o en otro navegador), para que no compartan nada. Usa `iniciar-demo` para tener datos de ejemplo.

**Guion de prueba (10 minutos):**
1. *Paciente:* en **Agendar cita**, reserva una mastografía y anota el folio.
2. *Administrador:* en el **Panel de control**, elige ese día. Aparece la paciente como *Por confirmar* (el panel se actualiza solo cada pocos segundos).
3. *Administrador:* toca **WhatsApp** junto a ella; queda como "Recordatorio enviado".
4. *Paciente:* en **Mi cita**, escribe el folio y los últimos 4 dígitos de su teléfono y toca **Confirmo que asistiré**.
5. *Administrador:* ve la cita como *Confirmada* sin haber hecho nada.
6. *Paciente:* cancela su cita.
7. *Administrador:* el lugar vuelve a aparecer libre.
8. *Paciente:* elige un día **lleno** y anótate en la **lista de espera**. *Administrador:* la ve en la lista de espera.
9. *Administrador:* cancela una cita de ese día; el lugar pasa solo a la persona en espera.
10. *Administrador:* al final, **Marcar asistencia** y revisar *Resultados* y la descarga a Excel.

En modo demo, la pantalla *Mi cita* muestra un folio y 4 dígitos de ejemplo para no tener que inventarlos.

**Probar la vista de paciente desde un celular** (misma red Wi‑Fi que la computadora):
1. En `config.json` cambia `"acceso"` a `"red-local"` y escribe un `"pin"` (por ejemplo `"4821"`). Cierra y vuelve a abrir la agenda.
2. Averigua la IP de la computadora. Windows: abre `cmd` y escribe `ipconfig`; busca "Dirección IPv4" (ejemplo 192.168.1.20). Mac: Ajustes > Wi‑Fi > Detalles.
3. En el celular abre `http://ESA-IP:3000/paciente`.
4. Si Windows pregunta por el Firewall, permite el acceso en **redes privadas**.
Este modo no se probó en una red real; si no conecta, suele ser el Firewall o que el celular esté en otra red (por ejemplo datos móviles o red de invitados).

## Uso diario
**Registrar una cita nueva** (cuando la paciente llama o escribe):
1. *Agendar cita*: elegir servicio, día y hora; capturar nombre, teléfono (10 dígitos) y edad.
2. Si el día está lleno, el mismo formulario la anota en la **lista de espera**.
3. Al terminar, el botón **Enviar confirmación por WhatsApp** abre el chat con el mensaje listo; solo falta tocar Enviar. Anotar el folio si la paciente lo pide.

**Cada día en el Panel de control:**
1. Elegir servicio y día.
2. **Recordatorios**: botón *Enviar* junto a cada paciente por confirmar (se recomienda 3 días y 1 día antes). Queda marcada como "Recordatorio enviado".
3. Cuando la paciente responda, en su cita tocar **Confirmar** o **Cancelar**. Si cancela y hay lista de espera, el lugar pasa solo a la siguiente persona y el panel lo avisa.
4. Las que no respondan el WhatsApp aparecen en **Llamar a pendientes**: *Confirmó*, *Canceló* o *No contestó* (queda anotado el intento).
5. Si el día anterior o el mismo día quedan citas sin confirmar, **Liberar sin confirmar** cancela todas las pendientes y ofrece esos lugares a la lista de espera.
6. El día de la cita, marcar **Asistió** o **No asistió**. Con eso el cuadro *Resultados* calcula la inasistencia.

**Agregar a alguien directamente** (por ejemplo, una paciente que llega sin cita): *Panel de control* > *+ Agregar paciente*.

## Respaldos (importante)
Todos los datos están en la carpeta `datos` (archivo `agenda.db`).
- **Cada semana**: con la agenda cerrada, copia la carpeta `datos` completa a una memoria USB o a otra computadora.
- **Además**: en el Panel, el botón *Descargar todas las citas (Excel)* guarda un archivo `.csv` que se abre en Excel. Sirve para consultar y analizar; no se vuelve a cargar a la agenda.
- **Para pasar a la versión web:** `exportar-para-web.bat` (o `.command` en Mac) genera `exportar-web.sql` con todas las citas y la lista de espera; no modifica la agenda. Instrucciones en `web/README.md`.
- Los respaldos contienen nombres y teléfonos: guárdalos en un lugar controlado.

## Ajustes (archivo `config.json`)
Se edita con el Bloc de notas. Después de cambiar algo, cierra y vuelve a abrir la agenda.

| Campo | Qué hace |
|---|---|
| `puerto` | Número de acceso. Cámbialo solo si el 3000 está ocupado. |
| `acceso` | `"solo-esta-computadora"` (recomendado) o `"red-local"` para abrirla desde otras computadoras de la oficina. |
| `pin` | Código para entrar. **Obligatorio si `acceso` es `"red-local"`.** Ejemplo: `"pin": "4821"`. Elige uno que no sea obvio. |
| `portal_pacientes` | `true` activa la vista de paciente (`/paciente`); `false` la apaga y solo queda el panel. |
| `dias_atencion` | Días de la semana con servicio: 0 domingo, 1 lunes … 3 miércoles, 4 jueves, 5 viernes. |
| `dias_anticipacion_max` | Con cuántos días de anticipación se pueden agendar citas. |
| `servicios` | Cada servicio: `nombre`, `cupos` por día, `minutos` entre citas e `inicio` (hora de la primera). **Las cifras de densitometría y orientación médica son de ejemplo: ajústalas.** |

Al usar `"red-local"`, las otras computadoras abren `http://IP-DE-LA-COMPUTADORA:3000` (la IP la da el área de sistemas o se consulta en la configuración de red). Este modo no se probó en una red real.

## Problemas frecuentes
- **Windows bloquea `iniciar.bat`** (aviso de SmartScreen, de Smart App Control o similar, porque el archivo viene de un `.zip` descargado): no desactives la protección. Abre la carpeta `local`, haz clic en la barra de direcciones, escribe `cmd` y Enter, y ahí escribe `node server.js --demo` (o `node server.js` para datos reales). También puedes desbloquear el zip antes de extraerlo: clic derecho en el `.zip` > Propiedades > Desbloquear.
- **"Falta instalar Node.js"**: instálalo desde nodejs.org y vuelve a abrir.
- **"El puerto ya está en uso"**: ya hay una agenda abierta; ciérrala o cambia `puerto`.
- **La página no carga**: revisa que la ventana negra siga abierta.
- **Los botones de WhatsApp no abren el chat**: el enlace usa WhatsApp Web o la aplicación de escritorio. Conviene tener la sesión de la Fundación abierta en esa computadora.
- **Empezar de cero** (por ejemplo, tras el piloto): cierra la agenda y cambia el nombre de la carpeta `datos`.
- **Las fuentes se ven distintas sin internet**: es normal; la agenda funciona igual.

## Seguridad en pocas palabras
- Con `"solo-esta-computadora"` nadie más puede abrirla, ni siquiera en la misma red.
- Con `"red-local"` se exige el PIN para el panel y se bloquea un minuto tras 5 intentos fallidos. La vista de paciente queda abierta para la red, con límite de intentos por dispositivo para evitar que alguien adivine folios o llene los cupos. El PIN no es un cifrado: úsalo solo dentro de una red de oficina de confianza, no en internet.
- No se guardan datos clínicos.
