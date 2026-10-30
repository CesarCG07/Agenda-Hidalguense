# Agenda Hidalguense · Prototipo (MVP)

Prototipo para ordenar las citas de mastografía y otros servicios de la Fundación Hidalguense A.C.: cupos reales por día, recordatorios por WhatsApp, lista de espera que se reasigna sola, llamadas a pendientes y resultados de asistencia.

Se desarrolló como proyecto socioformador. La idea de esta entrega es que la Fundación **lo pruebe sin costo y sin crear cuentas**, y que decida con calma si le sirve, cómo seguir y si algún día vale la pena pagar por algo.

## Qué hay en esta carpeta

| Carpeta | Qué es | Para qué sirve |
|---|---|---|
| `local/` | **El MVP.** Funciona en una sola computadora, sin internet y sin cuentas. Guarda todo en un archivo. | Probarlo ya. Ver guía en `local/GUIA-DE-USO.md`. |
| `web/` | Versión en internet (Supabase + hosting estático gratuito) donde **las pacientes confirman y cancelan solas**. | El siguiente paso, si el piloto convence. Ver `web/README.md`. |

## Probarlo en 5 minutos
1. Instalar Node.js (versión LTS) desde nodejs.org. Es gratis.
2. Abrir la carpeta `local/` y hacer doble clic en `iniciar-demo.bat` (Windows) o `iniciar-demo.command` (Mac).
3. Se abre el navegador con datos de ejemplo. Recorrer: **Agendar cita**, **Panel de control**, botón **WhatsApp**, **Llamar a pendientes**, **Lista de espera**.
4. Prueba también la vista de la paciente en `http://localhost:3000/paciente` (o con el botón *Vista de paciente* del panel). Hay un guion de prueba de los dos roles en `local/GUIA-DE-USO.md`.
5. Para usarlo con datos reales: `iniciar.bat` o `iniciar.command` (sin "demo"). Los datos reales y los de ejemplo se guardan en archivos distintos y no se mezclan.

## Qué resuelve y qué no (en la versión local)

**Resuelve**
- Que un día nunca pase de su cupo (10 mastografías) ni se agende dos veces el mismo horario.
- Que quien lleva el registro vea de un vistazo quién está confirmada, quién falta por confirmar y quién no llegó.
- Mandar recordatorios en menos tiempo: un botón abre WhatsApp con el mensaje ya escrito para cada paciente.
- Recuperar lugares: lo que se cancela pasa solo a la lista de espera.
- Saber cuánto falta la gente (porcentaje de inasistencia) y cuántos lugares se recuperaron.
- Sacar todas las citas a Excel con un botón.
- **Probar los dos lados a la vez:** la vista de la paciente (`/paciente`: agendar, confirmar y cancelar con su folio) y el panel del personal, conectados. Lo que hace una se ve en el otro.

**No resuelve todavía**
- Que las pacientes lleguen a la agenda **desde su casa**. La vista de paciente existe en la versión local, pero solo se alcanza desde la computadora o la red de la oficina. Para que la usen desde su celular en cualquier lugar hace falta la versión `web/`.
- Que los recordatorios salgan solos. Siguen siendo un clic por paciente.
- Acceso desde otros lugares: los datos viven en la computadora donde corre.

## Cómo evaluarlo (propuesta de piloto de 3 a 4 semanas)
Para decidir con datos y no con impresiones:
1. **Antes de empezar**, anotar: cuántas citas hay por semana, cuántas pacientes faltan sin avisar (aunque sea un cálculo aproximado) y cuánto tiempo al día se va en agendar y confirmar.
2. **Durante el piloto**, usar la agenda para todas las citas nuevas y enviar los recordatorios desde el panel (3 días y 1 día antes).
3. **Al final**, comparar con la tarjeta **Resultados** del panel (inasistencia, cupos recuperados) y preguntar al personal qué le estorbó y qué le ayudó.

## Opciones para seguir

La decisión es de la Fundación y depende de cuánto le sirva. Estas son las rutas, de menos a más compromiso.

### Opción A · Seguir local en una computadora (costo: $0)
- **Conviene si:** el equipo es pequeño, una persona concentra el registro y les basta con ordenar y recordar.
- **Qué implica:** una computadora designada, un respaldo semanal y que el programa esté abierto en horario de trabajo.
- **Límite:** las pacientes solo pueden usar su vista desde esa computadora; no pueden agendar desde su casa.

### Opción B · Local en varias computadoras de la oficina (costo: $0)
- **Conviene si:** más de una persona necesita ver la agenda al mismo tiempo dentro de la misma oficina.
- **Qué implica:** en `local/config.json` cambiar `"acceso"` a `"red-local"` y definir un `"pin"`. Quien abre el programa en una computadora comparte la agenda con las demás de la misma red (por la dirección IP de esa computadora). El PIN protege el panel del personal; la vista de paciente queda abierta para quien esté en esa red (se puede apagar con `"portal_pacientes": false`). También sirve para probar la vista de paciente desde un celular conectado al mismo Wi‑Fi.
- **Precaución:** usar una red de oficina de confianza; no conviene abrirla en la red de Wi‑Fi para el público.
- **Límite:** sigue siendo una sola computadora principal; si está apagada, nadie accede. Este modo no se probó en una red real.

### Opción C · Versión web con autogestión (costo estimado: $0 con los planes gratuitos)
- **Conviene si:** quieren que las pacientes agenden, confirmen y cancelen desde su celular y que el cupo se libere sin que nadie intervenga.
- **Qué implica:** crear cuentas gratuitas (base de datos y hosting) y seguir `web/README.md`, aproximadamente 30 minutos con alguien de apoyo técnico. Hace falta un aviso de privacidad publicado.
- **Riesgos a conocer:** la base de datos gratuita se pausa si pasa una semana sin uso; los planes gratuitos pueden cambiar de condiciones. Recomendado mantener respaldos en Excel (el panel web tiene botón de descarga). Si ya hubo piloto local, los datos se pueden llevar a la web con `local/exportar-para-web.bat` (ver `web/README.md`). La versión web limita los intentos para evitar que alguien adivine folios o llene los cupos con reservas falsas.
- **Cuentas:** abrirlas con un correo de la Fundación, no personal, para que no dependan de una sola persona.

### Opción D · Pagos opcionales, cuando el uso los justifique
Nada de esto es necesario para empezar. Se vuelve razonable cuando el tiempo del personal cuesta más que la herramienta.

| Qué | Para qué | Costo de referencia | Cuándo considerarlo |
|---|---|---|---|
| **API de WhatsApp Business** | Que los recordatorios salgan solos y las respuestas "confirmo/cancelo" se registren sin intervención | Meta cobra por mensaje de recordatorio; según [Mercately](https://blog.mercately.com/nuevos-precios-whatsapp-api-octubre-2026/), ~$0.0085 USD en México. Con 120 a 200 citas al mes serían unos $3 a $6 USD. A eso se suma el cobro del proveedor intermediario, que suele ser la parte más cara. | Cuando enviar recordatorios a mano les quite más tiempo del que pueden dar. Pedir cotización a 2 o 3 proveedores. |
| **Vercel Pro** | Solo si eligen alojar la versión web en Vercel con uso institucional | $20 USD al mes por cada persona que publica cambios ([documentación de Vercel](https://vercel.com/docs/plans/pro-plan)) | El plan gratuito de Vercel es solo para uso no comercial y puede no aplicar; hay alternativas gratuitas. Ver `web/README.md`. |
| **Plan de pago de la base de datos** | Que no se pause por inactividad y tener respaldos automáticos | No verificado. Consultar en la página de precios del proveedor. | Si la agenda pasa a ser indispensable para la operación diaria. |
| **Dominio propio** | Una dirección tipo `citas.fundacion.org.mx` | Varía según el proveedor. | Cuando la versión web ya esté en uso y quieran una dirección fácil de recordar. |

**Regla sugerida:** no pagar nada hasta que el piloto muestre que la herramienta reduce inasistencias y que el límite que molesta es ese servicio en concreto. Y activar los topes de gasto del proveedor antes de agregar una tarjeta.

## Señales para pasar de una opción a otra

- **De A a C:** el personal pasa tiempo atendiendo cancelaciones por teléfono o WhatsApp, o la inasistencia sigue alta aun con recordatorios.
- **De C a pagar WhatsApp API:** ya hay autogestión funcionando y aun así enviar los recordatorios a mano es una carga diaria.
- **Volver a A:** si dejan de usarlo, las citas ya están en un Excel exportable; no queda nada atado.

## Privacidad y datos personales
- Se guardan nombre, teléfono y edad. **No se registran datos clínicos**, y conviene mantenerlo así.
- La Fundación debe contar con su **aviso de privacidad** (LFPDPPP) y mostrarlo a las pacientes; la casilla del formulario solo lo resume.
- Definir quién tiene acceso al programa y a los respaldos. Los archivos de respaldo contienen nombres y teléfonos: guardarlos en un lugar controlado.
- En la versión local, nada sale de la computadora salvo los enlaces de WhatsApp que el personal abre.

## Preguntas que la Fundación debe responder
1. ¿Cuáles son los cupos reales por día de densitometría y de otros servicios? (En `config.json` hay cifras de ejemplo.)
2. ¿Atienden todos los miércoles a viernes, o hay jornadas especiales? ¿Hay días sin servicio?
3. ¿Qué número de WhatsApp usarán y quién lo atiende?
4. ¿Cuántas pacientes faltan hoy sin avisar? (La línea base para medir mejora.)
5. ¿Quién será la persona responsable del sistema y de los respaldos?

## Qué se verificó y qué deben comprobar ustedes

**Ya se verificó (versión local)**
- Agendar, evitar que dos personas tomen el mismo horario, lista de espera y reasignación automática cuando alguien cancela.
- Liberar citas sin confirmar, marcar asistencia y no asistencia, y descargar todo a Excel.
- Probar las dos caras a la vez: la paciente agenda, confirma o cancela, y el panel de la persona de registro lo refleja sin intervención.
- El PIN del panel y la protección contra adivinar folios.
- Se abrió y funcionó en una computadora con Windows. Windows puede bloquear el archivo `.bat` la primera vez; la guía `local/GUIA-DE-USO.md` explica cómo resolverlo.

**Lo que deben comprobar ustedes antes de usarlo con pacientes reales**
- Abrirlo en la computadora que realmente va a usar la persona de registro (y en Mac, si aplica).
- Hacer una semana de prueba con datos de ejemplo antes de capturar pacientes reales.
- Si quieren que varias computadoras de la oficina lo usen a la vez, probar ese modo en su red; no se ha probado en una red real.
- Publicar el aviso de privacidad antes de recopilar nombres y teléfonos.

**La versión web (`web/`) está construida, pero no se ha probado con un servicio real**
- Se probó con una base de datos equivalente en una computadora de desarrollo, y el sitio compila. Todavía no se ha montado en una cuenta real de Supabase.
- Por eso, antes de abrirla al público, alguien con apoyo técnico debe hacer una prueba completa: agendar, cancelar, descargar a Excel y confirmar que el límite de intentos no bloquee a pacientes legítimas (ver `web/README.md`).
- Si ya hubo un piloto local, sus datos se pueden llevar a la web. Esa importación se probó y no duplica información al repetirse.
