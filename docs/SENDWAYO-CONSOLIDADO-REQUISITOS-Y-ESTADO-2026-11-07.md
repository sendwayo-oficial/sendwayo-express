# SENDWAYO EXPRESS — Requisitos integrales y estado de trabajo

**Fecha de consolidación:** 7 de noviembre de 2026  
**Repositorio:** `sendwayo-oficial/sendwayo-express`  
**Cuenta GitHub de trabajo:** `ideletteismorin@gmail.com`  
**Rama:** `work/sendwayo-international-payments-session`  
**Versión de producto objetivo:** V7. Archivo consolidado de entrega: `SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html`. La página pública conserva su URL actual hasta una publicación autorizada.

Este documento reúne las decisiones y requisitos tratados durante el trabajo del 7 de noviembre. No significa que todas las integraciones estén habilitadas: distingue lo que ya está reflejado en la rama, lo que necesita prueba real y lo que depende de contratos, afiliaciones o credenciales externas.

## 1. Regla visual obligatoria para todas las páginas

- El nombre comercial **SENDWAYO EXPRESS**, el rol/cuenta activa, el nombre de la persona, el ID, el código, la fecha, la hora y el tiempo de sesión van en la parte superior.
- No debe existir una columna lateral permanente con el nombre del administrador, datos del negocio, ID, código u hora.
- El área del módulo activo ocupa el ancho disponible completo. Al abrir Recargas solo se ve Recargas; al abrir Envíos solo se ve Envíos; no se mezclan paneles ni páginas.
- La navegación se abre como un panel superpuesto desde el botón de menú superior. Cerrado, no reserva ancho ni deja contenido pegado al lado.
- La cabecera superior debe ser igual en escritorio, tableta y teléfono; los botones de notificación y salida deben funcionar.
- No deben coexistir controladores de cabecera o menú que se contradigan.

## 2. Acceso, cuentas y seguridad

- Estructura acordada: 1 administrador, 5 agentes y 15 remitentes.
- Cuenta GitHub correcta para el desarrollo: `ideletteismorin@gmail.com`. No usar la cuenta alternativa `sendwayoexpress@gmail.com`.
- Administración tiene control total de cuentas, movimientos y módulos.
- Los agentes pueden procesar solicitudes permitidas de otras cuentas, pero no autoaprobarse, aprobar depósitos ni acreditar/desacreditar/ajustar balances o comisiones.
- Los agentes no pueden consultar datos privados de otros agentes.
- Los remitentes solo consultan y administran sus propios datos; no tienen controles de aprobación.
- Una cuenta nueva utiliza una contraseña inicial y debe exigir cambio de contraseña en el primer acceso.
- Mantener Firebase Authentication por correo/contraseña y persistencia de sesión de navegador. No cerrar sesión al recargar.
- El límite acordado es **40 minutos de inactividad**. Después se bloquea la sesión y se exige volver a autenticarse.
- El proyecto Firebase debe permanecer en el plan Spark; no activar Blaze ni introducir tarjeta de pago.
- No colocar secretos, contraseñas, tokens, claves API, PIN ni datos de tarjetas en HTML, GitHub o datos públicos de Firebase.

## 3. Finanzas y reglas de operación

- Mantener balances y comisiones separados para DOP/RD$ y HTG/GDES. Nunca convertir una moneda en la otra automáticamente.
- Tarifas acordadas: envíos 8%; recargas, paqueticos y facturas/servicios 5%.
- En una operación de remitente, la comisión se divide 50% remitente y 50% Administración. Las operaciones de agente/administrador se contabilizan como comisión de Administración conforme a las reglas del módulo.
- La comisión de Administración no incrementa por sí sola el balance disponible; solo se transfiere mediante el flujo autorizado de pago/retiro de comisión.
- Depósitos: solo Administración aprueba. El balance del remitente se acredita al aprobarse, una sola vez, con protección contra duplicados.
- Operaciones pendientes descuentan el importe correspondiente al registrarse; rechazadas o eliminadas deben devolverlo según la regla contable. “No Coincide” necesita motivo y permitir la corrección/resubmisión.
- Mientras una operación está pendiente, el remitente no puede modificarla ni borrarla. Una vez aprobada, solo Administración puede hacer cambios autorizados.
- La conciliación debe separar registros individuales y globales e incluir entradas, salidas, depósitos, bonos, comisiones y pagos/retiros.

## 4. Módulos, registros y herramientas

- Cada tipo de operación permanece en su módulo independiente: Envíos, Retiros, Depósitos, Recargas, Paqueticos, Facturas/Servicios, Paquetes y demás módulos habilitados.
- Las tablas deben disponer de agregar nuevo, buscador, exportación Excel/PDF/CSV, numeración, fecha/hora y acciones permitidas por rol.
- La numeración visual de la operación más reciente comienza en 01 según el orden de presentación solicitado.
- Administración necesita ver, modificar y borrar los registros autorizados; agentes y remitentes no reciben permisos administrativos.
- Beneficiarios deben poder agregarse, consultarse y modificarse; cada uno debe conservar país, prefijo telefónico y teléfono internacional.
- La consulta **Expediente por ID** es exclusiva de Administración y solo permite buscar ID/códigos de remitentes y agentes. Es de solo lectura y debe reunir perfil, balances y comisiones, movimientos, solicitudes, beneficiarios y cuentas bancarias que estén vinculados y disponibles para la sesión.

## 5. Países y rutas internacionales

- No limitar los servicios a Haití, República Dominicana y Estados Unidos.
- Incluir países/territorios, banderas, código ISO y prefijos telefónicos; permitir rutas país de origen → país de destino en envíos y retiros.
- Diferenciar el país del beneficiario del prefijo telefónico; no fusionar países que comparten código de llamada.
- El catálogo local del HTML debe funcionar sin depender de una descarga en cada inicio.
- No inferir ni convertir automáticamente moneda a partir del país: la moneda de cada operación debe indicarse y conservarse.

## 6. Comprobantes y notificaciones

- El comprobante mantiene el diseño corporativo y se comparte como imagen PNG, no como texto plano.
- El comprobante debe indicar importe enviado, importe recibido, moneda, fecha/hora, ruta y estado correctos; no debe inventar transacciones si no existe el ID.
- Las notificaciones deben sincronizarse, llevar al módulo y registro exactos, y desaparecer al atenderse/abrirse conforme al flujo definido.
- No mostrar contadores falsos ni mezclar notificaciones de diferentes módulos.

## 7. Pagos con tarjeta y dispersión internacional

- Flujo objetivo: cliente paga con tarjeta → el servidor confirma el pago con el proveedor → se ejecuta el servicio → se confirma la entrega.
- Evaluar AZUL o CardNET para tarjetas locales; Stripe solo después de confirmar que la entidad y el país de la cuenta cumplen sus requisitos.
- La dispersión debe contemplar MonCash y NatCash, además de cuentas bancarias y proveedores autorizados en otros países.
- La API/Worker debe guardar secretos solo en variables seguras del servidor. Verificar webhooks firmados, evitar doble procesamiento con idempotencia y conciliar pagos, liquidaciones y dispersiones.
- No simular cargos ni dispersiones. Las pruebas de dinero real quedan bloqueadas hasta que existan contratos, afiliación, credenciales de prueba y autorización del propietario.

## 8. Aplicación y despliegue

- Primero se valida la aplicación web en navegadores de escritorio y móvil. PWA/instalación y Play Store se consideran una etapa posterior.
- Mantener el URL público existente sin cambios mientras se desarrolla.
- Las modificaciones actuales van únicamente en la rama de desarrollo. No publicar, fusionar a `main`, alterar reglas de Firebase ni tocar balances o comisiones reales sin autorización expresa.

## 9. Estado comprobado en la rama de desarrollo

| Área | Estado observado |
|---|---|
| Cabecera superior y ancho completo | Una única barra superior con marca, identidad, ID/código, fecha/hora, duración, campanita y Salir; menú superpuesto cerrado por defecto; contenido al 100% de ancho. Verificaciones estáticas aprobadas. Prueba visual real pendiente. |
| Navegación | Panel superpuesto, no una columna reservada; fondo de cierre incluido; prueba de escritorio/móvil pendiente. |
| Expediente por ID | Implementado como consulta administrativa de solo lectura para remitentes/agentes; incluye movimientos, solicitudes, beneficiarios, bancos y balances; rechaza ID duplicado o inexistente. |
| Sesión Firebase | El código conserva persistencia de sesión y contiene límite de inactividad de 40 minutos; falta prueba real de refresco/expiración. |
| Catálogo internacional | 250 entradas ISO/country-territory están integradas en el HTML para uso local; faltan validaciones de prefijos específicos y recorrido de formularios por país. |
| Balances DOP/HTG | Campos separados presentes en el código; falta prueba de cálculos y conciliación con casos reales controlados. |
| Comprobante PNG | Existe flujo de generación/compartir PNG; falta verificación en dispositivos y navegador real. |
| Pagos AZUL/CardNET/Stripe | Arquitectura documentada; no son integraciones activas. |
| MonCash/NatCash | Ambas vías están en el diseño; falta proveedor contratado, credenciales y pruebas de dispersión. |
| PWA/Play Store | Etapa posterior, no publicada. |

## 10. Pruebas obligatorias antes de publicar

1. Inicio de sesión por correo, ID y código para cada rol.
2. Recarga de página y continuidad de sesión; prueba a 39 minutos y al cumplirse 40 minutos de inactividad.
3. Verificar cabecera y contenido a ancho completo en escritorio, tableta y teléfono; confirmar que el menú cerrado no deja columna lateral.
4. Abrir todos los módulos y comprobar que solo aparece el módulo seleccionado.
5. Probar los permisos de administrador, agente y remitente.
6. Probar envíos, retiros, depósitos, recargas, paqueticos, servicios, comisiones y balances DOP/HTG con casos controlados.
7. Probar beneficiarios, países, prefijos, origen/destino y todos los formularios.
8. Probar notificaciones en más de un dispositivo, búsqueda/exportación y comprobantes PNG.
9. Probar expediente por ID con cuentas autorizadas, ID equivocado y ID duplicado.
10. Revisar logs y conciliación sin modificar saldos reales.

**Criterio de entrega:** un solo paquete V7 revisado, con pruebas documentadas, sin parches sueltos. Ningún despliegue público se considera hecho hasta que el propietario autorice publicar y la prueba visual/funcional esté completada.


## 11. Consolidación V7 en la rama de desarrollo

- Se creó el archivo de entrega **`SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html`** copiando el HTML completo revisado. Su contenido fue comparado con el archivo fuente de la rama y ambos tienen el mismo SHA de contenido.
- Se corrigió una redeclaración de la variable de fondo del menú que provocaba un error de sintaxis; se agregó una comprobación específica que primero falló y luego pasó.
- Pruebas estáticas de distribución superior: **18 comprobaciones aprobadas**.
- Pruebas estáticas de expediente/performance: **40 comprobaciones aprobadas**.
- JavaScript embebido: **43 bloques compilados; 0 errores de sintaxis**.
- Estos resultados son pruebas estáticas sobre el archivo de entrega. No son una medición de velocidad ni una prueba visual/funcional en navegador real.
- Archivo V7 y documentación permanecen en la rama de desarrollo. GitHub Pages, `main` y los datos de producción no se actualizaron.
