# SENDWAYO EXPRESS V7 — estado integral consolidado

Fecha de revisión: 7 de noviembre de 2026  
Rama de trabajo: `work/sendwayo-international-payments-session`  
Cuenta GitHub de trabajo confirmada: `ideletteismorin@gmail.com`

## 1. Instrucción visual principal

La pantalla privada debe mostrar, siempre arriba y a todo el ancho:

- Marca y nombre comercial SENDWAYO EXPRESS.
- Nombre de la cuenta/usuario activo y su rol.
- ID y código visibles.
- Fecha, hora y duración de sesión, en filas completas debajo de la identidad.

El nombre, ID, código, marca y hora no deben quedar en una columna lateral ni alineados en una columna contigua al módulo. La identidad y el horario se apilan verticalmente en la cabecera, antes del área de trabajo. La navegación queda en un botón dentro de la cabecera; al pulsarlo abre un panel superpuesto. Cerrado el panel, la página —incluido Recargas— ocupa todo el ancho, sin una columna lateral reservada. La misma estructura se aplica a todas las vistas.

## 2. Trabajos de la mañana recuperados del historial

Los siguientes cambios ya aparecen en el historial del repositorio antes de esta revisión. Se conservan en la rama de desarrollo; esta lista identifica lo que hay que validar conjuntamente, no afirma que todas las funciones hayan pasado una prueba real de navegador.

| Trabajo recuperado | Evidencia en el historial |
|---|---|
| Normalización de IDs de Administración, agentes y remitentes; conservación de IDs/códigos antiguos como alias | [9b6c003](https://github.com/sendwayo-oficial/sendwayo-express/commit/9b6c003cd426d91f25ecd69adad97467fdc7aa64), [62c6fe8](https://github.com/sendwayo-oficial/sendwayo-express/commit/62c6fe8d5c6029cdc48be8e74fb620d68a498615), [7bfb2e9](https://github.com/sendwayo-oficial/sendwayo-express/commit/7bfb2e96f68fc3a217ede8f3483bca90c2f8941b) |
| Controles administrativos para crear, ver, editar, activar/inactivar, acreditar, desacreditar, consultar balances/comisiones y borrar cuentas | [8f030fe](https://github.com/sendwayo-oficial/sendwayo-express/commit/8f030fee62f163f8c4ea96530c7848e967c73fb7), [62c6fe8](https://github.com/sendwayo-oficial/sendwayo-express/commit/62c6fe8d5c6029cdc48be8e74fb620d68a498615) |
| Registro público como solicitud pendiente y creación de cuentas Firebase después de aprobación administrativa | [e99c734](https://github.com/sendwayo-oficial/sendwayo-express/commit/e99c73497b7ed583411688e420d15da287e55025), [32f0523](https://github.com/sendwayo-oficial/sendwayo-express/commit/32f052382db7cc4d845ab62874dc48bee555484d), [8453677](https://github.com/sendwayo-oficial/sendwayo-express/commit/8453677d140db9acaeceb2b6ba91064467ecbae4), [829cbd4](https://github.com/sendwayo-oficial/sendwayo-express/commit/829cbd4a8b9f282c7f652d8c31de3ca1721fe9f8) |
| Contraseña inicial temporal con obligación de cambiarla en el primer acceso; limpieza de avisos | [8f030fe](https://github.com/sendwayo-oficial/sendwayo-express/commit/8f030fee62f163f8c4ea96530c7848e967c73fb7), [32f0523](https://github.com/sendwayo-oficial/sendwayo-express/commit/32f052382db7cc4d845ab62874dc48bee555484d) |
| Investigación de cuentas y edición del perfil administrativo | [8168012](https://github.com/sendwayo-oficial/sendwayo-express/commit/8168012e67bf53a8f4e72ea8bec702730ce483cd), [53edf3b](https://github.com/sendwayo-oficial/sendwayo-express/commit/53edf3b5f96e9e2db949dd9e8954583d28182934) |
| Rutas internacionales, países de origen/destino, prefijos telefónicos, edición de beneficiarios y aliases de IDs históricos | [acb734b](https://github.com/sendwayo-oficial/sendwayo-express/commit/acb734b1fd40660e02bcbf35d09b867c8fed7e14), [d241d1b](https://github.com/sendwayo-oficial/sendwayo-express/commit/d241d1bba5a339737f5e8f7b9cda9c7a5b9c08de) |
| Reparación de exportación PDF y colocación correcta de scripts de inicialización | [de5c160](https://github.com/sendwayo-oficial/sendwayo-express/commit/de5c160868b38ee6190b5c6fac454c16da485af6), [0c1e42e](https://github.com/sendwayo-oficial/sendwayo-express/commit/0c1e42ee0ebb19a0479539e6b7bb1af89febb15d) |
| Recuperación de sesión Firebase y protección del primer clic de acceso | [650181d](https://github.com/sendwayo-oficial/sendwayo-express/commit/650181d32597bd03b6e83a417e90b9b72a52820e), [f57191a](https://github.com/sendwayo-oficial/sendwayo-express/commit/f57191a9af0f2db3ff9ec793d7caa19c8e154e6a) |

## 3. Reglas operativas que deben permanecer intactas

- 1 administrador, 5 agentes y 15 remitentes.
- Saldos y comisiones separados en DOP y HTG; nunca convertir automáticamente una moneda en la otra.
- Agentes trabajan con fondos de Administración; no deben obtener un balance operativo o comisión independiente.
- Los remitentes solo consultan y gestionan sus propios datos.
- Los agentes pueden responder operaciones pendientes de otras cuentas; no se autoaprueban ni aprueban depósitos.
- Depósitos: aprobación exclusiva del administrador y acreditación al destino elegido solamente después de confirmación.
- Envíos: comisión general del 8%; recargas, paqueticos y servicios: 5%; la comisión de remitente debe dividirse 50/50 con Administración según las reglas acordadas.
- La comisión administrativa no se suma automáticamente al balance del administrador; solo mediante el flujo explícito de pago/retiro de comisión.
- Pendientes retienen fondos; rechazados deben devolverlos; “No coincide” permite corregir y reenviar.
- Después de aprobado, solo Administración puede editar o borrar.
- Numeración de movimientos: 01 para el más reciente cuando se presente en el orden pedido por módulo.
- Notificaciones sincronizadas, sin contadores falsos; al abrir una notificación debe dirigir al registro correcto.
- Comprobante PNG con el importe recibido, no con el importe enviado; nunca un comprobante de una operación inexistente.

## 4. Estado del código en esta rama

### Presente en el HTML; requiere prueba funcional con cuentas reales

- Login Firebase por correo/contraseña y persistencia `SESSION`.
- Límite de 40 minutos de inactividad y cierre de listeners/sesión.
- Directorio administrativo y cambios de cuenta.
- Aprobación administrativa de solicitudes de registro, aprovisionamiento Firebase y cambio de contraseña inicial.
- Expediente por ID, restringido a ADMIN y a IDs/códigos visibles únicos de remitentes/agentes. Incluye perfil, balances, comisiones, movimientos, beneficiarios, solicitudes y cuentas bancarias que estén vinculados y sincronizados.
- Edición de beneficiarios en Firebase.
- Selector internacional de países, origen/destino y prefijos.
- Exportación PDF/CSV/Excel y generación/compartición de comprobante PNG.
- Módulos de depósitos, envíos, retiros, recargas, paqueticos, servicios, banco, comisiones y conciliación.
- Controles por rol en las rutas de aprobación, modificación y borrado.

### Catálogo internacional verificado estáticamente

El HTML incluye un catálogo local de 250 registros y 250 códigos ISO alfa-2 únicos. No necesita descargar el catálogo para abrir el formulario. República Dominicana ofrece 809/829/849; Haití y Estados Unidos también constan. La validez completa de cada número internacional todavía requiere pruebas telefónicas por país y normalización E.164.

### Cambios recientes en esta rama

- Cabecera única a todo el ancho con marca arriba, identidad de la cuenta activa, ID, código, fecha, hora y duración.
- Menú convertido a panel superpuesto desde un botón superior; sin columna lateral fija ocupando el contenido.
- Espacio principal al 100% de ancho para Recargas y las demás secciones.
- Traducción incremental, observadores acotados, menos temporizadores de respaldo y carga paralela de Firebase Auth/Database.
- Expediente por ID ampliado con solicitudes y bancos asociados.
- Se eliminó el respaldo ficticio que inventaba un comprobante para un ID que no existía.

## 5. Pagos con tarjeta y dispersión internacional

- AZUL: afiliación y credenciales todavía no entregadas. No se activa cobro real ni se simula una aprobación.
- Stripe: no habilitar hasta disponer de una entidad legal y cuenta bancaria en un país admitido.
- MonCash y NatCash: ambos rieles están solicitados, pero falta elegir/contratar un proveedor de dispersión autorizado y recibir especificación y credenciales de sandbox.
- La integración documentada separa orden, autorización del proveedor, webhook autenticado, libro mayor idempotente, liquidación y conciliación.
- Los secretos deben permanecer en el entorno seguro del servidor/Worker, nunca en el HTML, GitHub, Firebase público o mensajes.

## 6. Archivo V7 consolidado y pruebas

Archivo de entrega de esta rama: `SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html`. La copia se verificó contra el archivo fuente de la rama antes de esta revisión.

La verificación ejecutada en esta sesión es estática y se ejecutó directamente contra el archivo V7:
- `tests/sendwayo-top-header-layout.test.cjs`: 18 comprobaciones aprobadas.
- `tests/sendwayo-expediente-performance.test.cjs`: 40 comprobaciones aprobadas.
- `tests/sendwayo-countries.test.cjs`: 12 comprobaciones aprobadas.
- `tests/sendwayo-workspace-header.test.cjs`: 27 comprobaciones aprobadas.
- Los 43 bloques JavaScript embebidos se compilaron; 0 errores de sintaxis.

Todavía hace falta probar en navegador, con cuentas y datos de prueba controlados:
- escritorio y móvil; Recargas, envíos, retiros y demás vistas a ancho completo;
- apertura/cierre del menú superior y ausencia de elementos de identidad en el lateral;
- inicio de sesión, cambio de contraseña inicial, refresco, múltiples pestañas y bloqueo a 39:59/40:00;
- Expediente por ID con IDs reales, alias, duplicados y módulos sin datos;
- creación/revisión/rechazo/reenvío, reservas, devoluciones y comisiones por DOP/HTG;
- depósitos, notificaciones, conciliación y PNG de comprobantes;
- teléfonos internacionales y exportaciones.

**No se declara la plataforma lista para dinero real ni se afirma que los cobros/pagos externos estén conectados.** Las reglas y balances reales de Firebase no se tocaron durante esta revisión.

## 7. Seguridad y publicación

- Repositorio de trabajo: `sendwayo-oficial/sendwayo-express`.
- Cuenta de trabajo: `ideletteismorin@gmail.com`.
- Esta entrega permanece en `work/sendwayo-international-payments-session`.
- No se hizo merge a `main` ni publicación en GitHub Pages.
- No se alteraron saldos, comisiones, reglas ni registros de producción.


## 8. Ajuste visual final de la franja superior

El último ajuste apila verticalmente nombre/rol, ID, código, fecha, hora y duración. No hay una columna de identidad a la izquierda ni información de sesión a un lado del módulo. El test `sendwayo-workspace-header` exige esta distribución; la prueba visual de navegador debe completarse antes de publicar.
