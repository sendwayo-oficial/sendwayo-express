# SENDWAYO EXPRESS — estado integral del trabajo consolidado

**Fecha de consolidación:** 7 de noviembre de 2026  
**Proyecto:** `sendwayo-oficial/sendwayo-express`  
**Rama de trabajo:** `work/sendwayo-international-payments-session`  
**Cuenta GitHub de trabajo confirmada por el propietario:** `ideletteismorin@gmail.com`  
**Regla de publicación:** esta rama es de desarrollo. No publicar en GitHub Pages ni modificar `main` sin una autorización explícita posterior.

Este documento reúne los requisitos y las correcciones conversadas durante la jornada. Distingue el código presente en la rama, las reglas que se deben conservar y los puntos que todavía requieren una prueba real, credenciales o confirmación contractual. No es una declaración de que todo el sistema haya sido probado en producción.

---

## 1. Presentación de la plataforma: encabezado arriba, nunca identidad en un costado

La indicación de interfaz queda fijada así:

- La marca y el nombre **SENDWAYO EXPRESS** aparecen en la primera franja superior.
- Debajo, en una segunda franja de ancho completo, aparecen la cuenta activa, el rol (Administrador, Agente o Remitente), el nombre de la persona, su ID, su código, la fecha, la hora y el tiempo de sesión.
- La información de Administrador, nombre del negocio, ID y código no debe aparecer como una columna a la izquierda del módulo.
- El área de trabajo (por ejemplo, Recargas) debe ocupar el ancho completo disponible.
- La navegación se abre desde el botón superior como un panel superpuesto de ancho completo. Cerrada, no reserva espacio lateral ni desplaza el módulo.
- En formularios y comprobantes puede mantenerse la identificación pertinente a la operación, sin convertirla en una barra lateral permanente.

**Estado en esta rama:** se trasladó el menú fuera del contenedor flexible del área de trabajo, se reforzó el encabezado superior y se forzó el área de contenido a ancho completo. Se conserva una sola franja de identidad superior. Pendiente: verificación visual en navegador real, en escritorio y móvil.

## 2. Expediente por ID

Nombre exacto de la función y del menú: **Expediente por ID**.

Comportamiento fijado:

- Solo Administración puede abrir la función.
- El campo busca el **ID de la cuenta** de un remitente o agente.
- Puede reconocer el ID actual, el ID anterior y los alias históricos que sean verdaderamente alias de ID.
- No debe usar el correo, el teléfono, el nombre ni el código comercial como sustitutos del ID.
- No puede abrir el expediente de Administración.
- Si el ID no existe o está repetido, debe explicar el problema y no mostrar datos de otra persona.
- Consulta de solo lectura: no crea, modifica, borra ni acredita registros, balances o comisiones.
- Reúne, cuando estén cargados y vinculados por identificadores verificables: perfil y estado, balances DOP/HTG, comisiones DOP/HTG, movimientos, solicitudes y revisiones, beneficiarios y cuentas bancarias.
- Los detalles técnicos no deben revelar contraseñas, tokens, claves API, CVV, PIN ni secretos.
- Debe avisar que muestra los registros que Firebase haya sincronizado para esa sesión. No debe prometer un historial que no esté disponible o que carezca de identificadores de propietario.

**Estado en esta rama:** pantalla existente renombrada, búsqueda del formulario y de la función anterior limitada al ID, consulta de solicitudes y cuentas bancarias asociadas, control de coincidencias ambiguas y saneamiento de detalles técnicos. Pendiente: probarlo con IDs reales en una sesión administrativa y verificar qué registros de cada colección tienen un campo de propietario consistente.

## 3. IDs, códigos y directorio

- La regla de identificación de agentes para **nuevas cuentas** es el prefijo `AGE` seguido de cinco dígitos. La siguiente serie nueva comienza en `AGE400I1`, luego `AGE400I2` y continúa hasta `AGE400I9`; la I es la letra I, no el número 1.
- Los nuevos formularios de alta deben sugerir y validar ese formato para agentes.
- Los nuevos remitentes conservan la serie `REM00001`, `REM00002`, etc.
- Los cinco agentes que ya existen no se renumeran automáticamente. Sus IDs históricos se conservan hasta que Administración autorice un plan de migración y sus alias.
- Los códigos comerciales `AG-...` y `REM-...` son datos distintos del ID. No se deben confundir en búsquedas por ID.
- La población de referencia del sistema es 1 administrador, 5 agentes y 15 remitentes; no se deben inventar cuentas ni aumentar esos totales para pruebas.

**Estado en esta rama:** los dos formularios de altas nuevos empiezan en `AGE400I1`, evitan reutilizar IDs históricos/alias y la creación Firebase valida el patrón. Los IDs preexistentes no se han reescrito.

## 4. Acceso, sesión y protección

- Autenticación con Firebase Authentication, correo y contraseña.
- Persistencia del navegador: `SESSION`.
- La sesión debe durar mientras haya actividad y cerrarse por **40 minutos de inactividad**, no por 40 minutos absolutos.
- Al vencer, detener listeners, limpiar el estado privado, cerrar Firebase y pedir de nuevo usuario y contraseña.
- Una recarga dentro del límite no debe borrar artificialmente la hora de última actividad ni expulsar al usuario.
- Tras restaurar una sesión, primero validar Firebase, perfil, rol y activación de agente. Después mostrar la pantalla privada; directorio, beneficiarios, avisos y movimientos continúan sincronizándose en segundo plano.
- Los datos y permisos se validan por rol en Firebase. No se permite autoactivar una cuenta de agente ni elevar el rol desde el navegador.
- Los detalles privados y la información secreta son exclusivos de Administración. Los agentes no pueden ver datos privados de otros agentes.
- Registrar IP en el servidor/Worker cuando exista el registro de auditoría correspondiente; nunca confiar en una IP declarada por el navegador. La IP no es prueba de identidad.
- No guardar contraseñas, tokens ni secretos de proveedores en HTML público, GitHub o datos de lectura pública.

**Estado en esta rama:** persistencia `SESSION`, corrección de borrado de la marca de actividad en las rutinas heredadas y restauración más temprana de la vista. El límite de 40 minutos y el cierre real de Firebase siguen presentes. Pendiente: prueba real de 39:59/40:00, recarga de pestaña, logout manual y reautenticación con navegador.

## 5. Roles y autorizaciones

### Administración
- Control integral del sistema.
- Crear y activar remitentes/agentes.
- Aprobar, rechazar o marcar No Coincide en operaciones según las reglas.
- Administrar bancos, depósitos, balances y comisiones.
- Ver registros, conciliar, modificar o borrar las operaciones cuando la regla lo autoriza.
- Es el único rol que consulta Expediente por ID e informaciones secretas.

### Agentes
- Operan con fondos compartidos de Administración, no con una comisión/balance operativo personal.
- Pueden gestionar operaciones permitidas de otros agentes o remitentes.
- No pueden aprobar sus propias operaciones.
- No pueden aprobar depósitos.
- No pueden acreditar, desacreditar ni ajustar balances o comisiones.
- No pueden ver expedientes privados de otros agentes.

### Remitentes
- Ven sus propios datos y movimientos.
- No tienen controles de aprobación.
- No pueden aprobar operaciones.
- Una operación pendiente bloquea su edición/borrado; cuando se marca No Coincide puede corregir y reenviar conforme al flujo.
- No pueden ver información privada de otras cuentas.

## 6. Reglas financieras que deben permanecer sin cambios

- DOP (pesos dominicanos/RD$) y HTG (gourdes/GDES) son monedas separadas. No convertir automáticamente entre ellas.
- Envíos: comisión general de 8%.
- Recargas, paqueticos y facturas/servicios: comisión general de 5%.
- En operaciones de remitentes, la comisión se distribuye 50% remitente y 50% Administración.
- En operaciones del administrador o agente, la comisión corresponde 100% a Administración.
- La comisión de Administración no se suma automáticamente al balance administrativo. Solo se transfiere cuando se usa **Pago y retiro de comisiones**.
- Los depósitos pendientes no acreditan balances hasta aprobación administrativa.
- La acreditación de un depósito se debe proteger contra duplicados.
- Los débitos de operaciones pendientes se revierten al rechazar o eliminar de acuerdo con el estado; No Coincide permite explicación y reenvío.
- Una operación aprobada no se modifica ni elimina por agente/remitente; solo Administración puede actuar sobre una aprobada.
- La lista de operaciones conserva separación por módulo; el registro más reciente se identifica como 01 en la presentación ordenada del módulo.
- En rutas Haití→Haití, importes y tarifas se expresan en HTG. Una ruta entre países no debe inventar una tasa de cambio ni dividir HTG para mostrar DOP sin una regla aprobada y explícita.

**Estado en esta rama:** hay un catálogo local de países y controles de ruta internacional que guardan país, ISO y prefijo de origen/destino; la calculadora conserva separación de moneda y las pruebas estáticas impiden las antiguas conversiones HTG→DOP no autorizadas. Los saldos, comisiones y reglas/datos reales de Firebase no se tocaron en esta tarea.

## 7. Países, rutas y teléfonos internacionales

- El selector debe admitir países/territorios internacionales, no solo Haití, República Dominicana y Estados Unidos.
- En envíos y retiros debe existir país de origen y país de destino.
- Guardar país ISO, nombre y código telefónico por separado.
- República Dominicana debe permitir 809, 829 y 849; Haití +509; Estados Unidos +1.
- No asumir que un prefijo telefónico identifica sin ambigüedad un país cuando hay códigos compartidos.
- Mantener el catálogo integrado localmente para que la portada no espere una descarga externa.

**Estado en esta rama:** hay 250 filas del catálogo ISO alfa-2 integradas localmente y pruebas estáticas de 250 códigos únicos; las rutas guardan origen/destino. Pendiente: ensayar números reales y validación telefónica completa con reglas E.164/libphonenumber; catálogo ISO no equivale por sí solo a validar cada número.

## 8. Notificaciones y módulos

- Campana de notificaciones real; nada de números fijos o badges inventados.
- Al pulsar una notificación, llevar a la operación/módulo exactos.
- Al abrir o atender una notificación, dejar de mostrarla como no leída según el flujo registrado.
- Envíos, retiros, recargas, paqueticos, facturas, depósitos y otros módulos mantienen registros separados.
- Los botones de cada módulo deben estar habilitados y respetar roles.
- No duplicar la identidad de la cuenta en el panel lateral.

**Estado en esta rama:** listeners y notificaciones Firebase se mantienen; los badges visuales no críticos se actualizan menos veces y hay actualización por evento después de cambios de transacciones. Pendiente: recorrido real de notificación en varios dispositivos y lectura/atención.

## 9. Beneficiarios, recibos, tablas y reportes

- Beneficiarios deben poder agregarse, consultarse, modificarse y eliminarse por quien corresponda, con datos internacionales.
- Las tablas deben ofrecer búsqueda y exportación cuando el módulo la soporte (Excel/PDF/CSV), además de Ver, Modificar, Borrar y Comprobante según permisos.
- El comprobante debe conservar el diseño corporativo, logo y datos correctos; el requisito es compartir una imagen PNG, no solo texto, y presentar el monto recibido cuando corresponda.
- Conciliación bancaria/financiera individual y global debe considerar entradas, salidas, depósitos, bonos y comisiones; no mezclar monedas.

**Estado en esta rama:** la pantalla Expediente reutiliza beneficiarios/movimientos ya sincronizados; el catálogo de países y la ficha de beneficiarios se mantiene en el HTML. El código de comprobante incluye salida PNG. Pendiente: prueba de generación y compartición PNG en navegadores/dispositivos reales y revisión de cada exportación de módulo.

## 10. Pagos con tarjeta y dispersión MonCash/NatCash

Decisiones confirmadas:
- AZUL: todavía no hay afiliación ni credenciales de prueba/producción.
- Dispersión requerida: MonCash y NatCash.
- Proveedor contractual para desembolsos todavía no seleccionado.
- No registrar tarjetas completas, CVV ni PIN en SENDWAYO.
- No acreditar por una respuesta del navegador; el servidor debe verificar el pago con el proveedor y usar eventos firmados/idempotentes.

Flujo objetivo:
1. Orden con ID idempotente creada por servidor.
2. Pago alojado/tokenizado por proveedor.
3. Confirmación auténtica por webhook firmado o consulta servidor-a-servidor.
4. Libro mayor de doble entrada y conciliación de liquidaciones/reembolsos/contracargos.
5. Orden de dispersión MonCash o NatCash validada por fondos, titular, país, moneda, límites y proveedor.
6. Confirmación de desembolso por webhook o consulta servidor-a-servidor; reservas idempotentes y trazabilidad completa.

**Estado:** solo documentación de preparación en la rama. No hay checkout AZUL real, Stripe activo, ni desembolsos MonCash/NatCash. No se simula ningún pago. Antes de habilitar dinero real se necesitan afiliación AZUL, sandbox/certificación, proveedor de payout contratado, credenciales de entorno seguras y pruebas legales/operativas.

## 11. Optimización de velocidad

Cambios realizados en desarrollo:
- Firebase App se descarga primero y Auth/Database en paralelo.
- La traducción procesa subárboles insertados en vez de volver a recorrer toda la página.
- La paginación observa tablas/vistas nuevas y cuerpos sustituidos, no vuelve a escanear todas las tablas por cada cambio menor.
- Los observadores visuales se limitan a la sesión autenticada y a elementos relevantes.
- Los respaldos visuales y de almacenamiento se hacen con menor frecuencia; los listeners Firebase y la reconciliación financiera principal se conservan.
- La restauración de sesión muestra el panel al completar validación de identidad/rol y carga listas/movimientos detrás.

**Pendiente:** medir tiempo de carga real, interacción de login, navegación entre Recargas/Envíos/Retiros, fluidez en móvil y escritorio. No se declara resuelto el rendimiento hasta ejecutar estas pruebas con navegador.

## 12. Infraestructura, entorno y límites de seguridad

- Firebase proyecto `sendwayo-express`; RTDB existente y plan Spark.
- No cambiar a Blaze, no añadir tarjeta de pago y no habilitar costes recurrentes sin autorización.
- Worker conocido: `sendwayo-express-backend.ideletteismorin.workers.dev`. Los workers `still-sky-1d34` y `round-breeze-f715` no se deben tocar.
- No exponer secretos de Worker/proveedores en HTML o repositorio.
- No ejecutar cambios en RTDB, reglas, datos reales, balances o comisiones durante esta fase.
- La cuenta GitHub que debe utilizarse para el repositorio es `ideletteismorin@gmail.com`; no usar la conexión `sendwayoexpress@gmail.com` para cambios de este proyecto.

## 13. Verificación y estado de entrega

Última verificación estática realizada sobre el archivo recién descargado de la rama:
- 84 aserciones estáticas ejecutadas: **aprobadas**.
- 43 bloques JavaScript inline: **0 errores de sintaxis**.
- Comparar además la rama de desarrollo con `main` antes de entregar.
- No se ejecutaron pruebas de navegador reales ni pruebas con cuentas reales de Firebase en esta sesión.
- No se publicó ni se modificó `main`/GitHub Pages.
- No se escribieron saldos, comisiones, reglas o transacciones en Firebase.

**Siguiente barrera antes de publicar:** probar login/refresh/40 minutos de inactividad, IDs reales del expediente, creación de un agente nuevo `AGE400I1` en entorno controlado, encabezado y menú en móvil/escritorio, rendimiento medido, beneficiarios/recibos/avisos y flujos financieros sin mover dinero real. Solo después de aprobar esa batería y recibir autorización explícita se plantea la publicación.
