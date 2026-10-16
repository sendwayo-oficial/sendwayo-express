# SENDWAYO EXPRESS — Especificación funcional de referencia

**Versión:** 1.0  
**Estado:** contrato funcional para la reconstrucción por etapas  
**Identidad:** mantener el nombre SENDWAYO EXPRESS, el logo oficial del repositorio y la identidad visual azul marino/naranja.  
**Regla de entrega:** cada etapa debe superar pruebas automáticas y pruebas funcionales antes de comenzar la siguiente. No publicar cambios de producción no comprobados.

## 1. Panel superior de balances

En los paneles que correspondan se muestran los seis indicadores, separados por moneda:

- Balance RD$
- Balance HTG
- Comisión RD$
- Comisión HTG
- Ganancia de Hoy en RD$
- Ganancia de Hoy en HTG

No mezclar DOP/RD$ con HTG/GDES ni efectuar conversiones automáticas. Los valores financieros provienen de Firebase/servidor, no del almacenamiento local del navegador. No mostrar indicadores que impliquen saldo o comisión pendiente ni usar denominaciones de capital.

## 2. Menú lateral responsive

Drawer flotante y desplegable para teléfono, tableta y escritorio. Encabezado con logo oficial y nombre comercial. Todas las opciones deben tener una vista real y no ser enlaces decorativos:

1. Tablero principal (Tableau de bord principal)
2. Tarifas locales Haití - Haití
3. Envíos - Envío / Retiro / Depósito
4. Beneficiarios
5. Expéditeur(s) (conteo dinámico de remitentes)
6. Agentes
7. Recargas
8. Paquetitos
9. Recepción, envío y distribución
10. Pago de facturas y servicios
11. Mi banco / Mi cuenta bancaria
12. Cuentas Bancarias Oficiales
13. Ajustes / créditos pendientes
14. Créditos pendientes
15. Solicitudes de bienvenida
16. Pago y retiro de comisiones
17. Conciliación Financiera
18. Reportes
19. Informes Semanal / 15 días / Mes
20. Informaciones secretas — solo Administración
21. Mi perfil ADMIN — solo Administración
22. Pago de transferencia

**Conteo inicial:** crear 1 administrador, 5 agentes y 10 remitentes de prueba. El conteo del menú refleja los remitentes activos realmente registrados; puede crecer a 15 o más a través de la gestión administrativa. Nunca crear cinco cuentas adicionales automáticamente para hacer coincidir una etiqueta fija.

## 3. Estándar para vistas y registros

Cada módulo debe implementar cuando corresponda:

- Botón **Agregar Nuevo** que abre una ventana modal real.
- Búsqueda reactiva por nombre, teléfono/documento, código o ID.
- Exportación de los datos visibles a XLSX, PDF y CSV con encabezados correctos, sin exponer información confidencial a roles no autorizados.
- Orden predeterminado: registros más recientes primero. El número visible se calcula después de ordenar: el elemento de la primera fila recibe 01, el siguiente 02, etc.; no alterar el ID permanente de la transacción.
- Acciones por registro: Ver, Modificar, Eliminar con confirmación y Comprobante cuando esté permitido.
- La modificación o eliminación de operaciones aprobadas requiere el procedimiento administrativo protegido y registro de auditoría.
- Mostrar estados y errores reales; no hacer pasar una operación local por una operación guardada en la nube.

## 4. Autorización por rol

### Administrador
- Acceso completo, cuentas bancarias oficiales, informaciones secretas, reportes y auditoría.
- Único rol que puede crear, modificar, activar, desactivar o autorizar agentes y remitentes.
- Único rol que puede ajustar o acreditar balances y comisiones.
- Puede aprobar, rechazar o marcar No coincide y ejecutar procedimientos protegidos sobre operaciones aprobadas.

### Agentes
- Pueden ver todas las transacciones de todos los remitentes y registrar operaciones permitidas de envío, depósito y retiro.
- Pueden aprobar, rechazar y marcar No coincide las solicitudes que les corresponda revisar.
- No pueden registrar/activar usuarios ni ajustar, acreditar o modificar balances o comisiones.
- No ven Informaciones secretas ni el panel exclusivo del administrador.

### Remitentes
- Ven únicamente sus cuentas, balances, comisiones e historial propios.
- Pueden iniciar sus operaciones permitidas de envío, depósito y retiro según las reglas de fondos y aprobación.
- No pueden aprobar transacciones ni gestionar otros usuarios.
- No pueden ajustar ni acreditar balances o comisiones.

La autorización debe aplicarse tanto en la interfaz como en Firebase/servidor. Ocultar un botón no se considera control de acceso.

## 5. Origen de los fondos y saldos

- Operación iniciada por un remitente: se carga o reserva contra el balance individual del remitente según el tipo de operación.
- Operación iniciada por agente o administrador: se carga contra el balance operativo general de la administración.
- La solicitud de depósito creada por un remitente queda Pendiente y solo acredita exactamente la moneda y el importe solicitado tras aprobación válida. No acreditar depósitos por duplicado.
- Una operación rechazada no se acredita. Las reservas se liberan o revierten una sola vez según el estado y el tipo de operación.
- Para los envíos del remitente, comprobar disponibilidad en la misma moneda; no sumar balances en monedas distintas.
- Registrar cambios financieros en el servidor con autor, marca de tiempo, referencia e idempotencia para impedir dobles movimientos.
- La administración recibe el 50% de la comisión y el remitente recibe el 50% correspondiente a sus propias operaciones. Los agentes no reciben comisión personal.
- Mantener las tarifas predefinidas del negocio: comisión general del 8%; recargas, paquetitos, facturas y servicios 5%; operaciones locales Haití→Haití sujetas a su tabla NatCash/MonCash, sin aplicarles automáticamente la comisión general. Los depósitos por sí solos no generan comisión.

## 6. Estados, revisión y comprobantes

Los controles de revisión, para administración y agentes, son:

- **Aprobado** — verde
- **Rechazado** — rojo
- **No coincide** — naranja/amarillo

Toda transición se valida en el servidor y evita repetir una liquidación ya realizada. No generar ni revelar ningún comprobante antes de una aprobación confirmada por el servidor. El comprobante aprobado contiene la información de operación autorizada, referencia, importe, moneda, fecha/hora, beneficiario, teléfono, emisor por código y autorizador por código. No incluye porcentajes internos de comisión ni datos confidenciales. Debe llevar el sello o logo oficial como marca de agua repetida nueve veces.

## 7. Cuentas, sincronización y recuperación

- Firebase es la fuente compartida de perfiles, operaciones, cuentas y estados.
- Los cambios aprobados deben reflejarse en los paneles correspondientes en tiempo real y permanecer tras recargar o iniciar sesión en otro dispositivo.
- Recuperación de contraseña mediante el flujo oficial de Firebase; nunca almacenar contraseñas en texto plano ni publicarlas en HTML, código o registros.
- Sin conexión o sin autorización: mostrar un error claro y no declarar éxito.
- Separar la reconstrucción de la versión oficial hasta que las pruebas de aceptación pasen. Nunca borrar ni sobreescribir datos de producción para preparar cuentas de prueba.

## 8. Puertas de aceptación por etapas

### Etapa 1 — Base visual y repositorio
Identidad corporativa, referencia al logo oficial, vista adaptable y publicación independiente. Aceptada por las comprobaciones automáticas existentes; la revisión visual del usuario se mantiene como comprobación manual adicional.

### Etapa 2 — Autenticación
Inicio y cierre de sesión reales, recuperación, persistencia segura, tiempo límite visible, autorización del perfil y error legible. Probar éxito y rechazo de credenciales, perfil sin autorización, recuperación, recarga y reingreso antes de seguir.

### Etapa 3 — Perfiles y permisos
Probar el administrador, cinco agentes y diez remitentes; probar denegación de funciones restringidas, conteo dinámico y sincronización.

### Etapa 4 — Operaciones financieras
Probar cada tipo de operación en DOP y HTG, balance suficiente/insuficiente, doble clic/reintento, rechazo, No coincide, reversión e idempotencia.

### Etapa 5 — Módulos, comprobantes e informes
Probar cada vista, búsqueda, alta, edición y borrado autorizado, las tres exportaciones, comprobante solo aprobado y marca de agua nueve veces.

### Etapa 6 — Revisión final y publicación
Pruebas completas de permisos en servidor/Firebase, seguridad de reglas, conciliación, persistencia multidispositivo y regresión. No promocionar a producción hasta completar y documentar las pruebas.

## 9. Regla para resolver divergencias

Si una etiqueta del menú indica un conteo distinto del número inicial solicitado, prevalece la cantidad de cuentas de prueba indicada en esta especificación y el contador visible se calcula dinámicamente. Si un requisito de interfaz contradice seguridad financiera o separación de roles, prevalece el control financiero seguro y se ajusta la interfaz.
