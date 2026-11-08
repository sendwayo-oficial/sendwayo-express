# SENDWAYO EXPRESS — pagos y dispersión internacional (rama de desarrollo)

Estado: **modo de preparación / sin credenciales / sin movimientos reales**.

Esta rama no debe desplegarse a producción ni modificar el sitio público, Firebase RTDB, saldos, comisiones o datos de clientes.

## Decisiones confirmadas por el propietario
- AZUL: afiliación inexistente por ahora.
- Credenciales AZUL: ninguna (ni pruebas ni producción).
- Dispersión: se requieren ambos destinos, MonCash y NatCash.
- El proveedor de dispersión aún no está seleccionado ni contratado.
- No se deben pedir ni guardar números completos de tarjeta, CVV o PIN.
- No se debe acreditar saldo por una respuesta del navegador: solo por verificación servidor-a-servidor y evento confirmado del proveedor.

## Alcance que se prepara

### 1. Cobro con tarjeta / AZUL
Flujo objetivo:
1. El usuario autenticado crea una orden con importe, moneda, finalidad y referencia idempotente.
2. El servidor valida rol, importe, moneda y propiedad de la orden.
3. Cuando exista afiliación AZUL, el servidor crea la sesión de pago usando la integración oficial aprobada. Preferir página de pago alojada/tokenización del adquirente; SENDWAYO no captura PAN/CVV.
4. El usuario completa el pago en el proveedor.
5. El servidor valida la notificación firmada y/o consulta el estado directamente al proveedor.
6. Solo después de confirmación auténtica, una transacción idempotente registra el pago y genera el evento de crédito pendiente para el libro mayor SENDWAYO.
7. Un proceso de conciliación compara órdenes, pagos, liquidaciones, reembolsos y contracargos.

**Bloqueo actual:** no se habilita checkout real hasta tener afiliación, credenciales de pruebas, documentación técnica del comercio y aprobación de certificación AZUL. No se simula un pago exitoso.

### 2. Dispersión MonCash + NatCash
El producto deberá permitir ambos destinos, pero cada riel requiere un proveedor contractual con API de desembolso, credenciales, firma de webhooks, límites, tarifas, tiempos de liquidación y proceso de reverso.
Flujo objetivo:
1. Admin crea una orden de dispersión; se valida identidad, beneficiario, país, moneda, límites y disponibilidad de fondos.
2. Se reserva el importe en un libro mayor de doble entrada; no se debita definitivamente antes de la respuesta del proveedor.
3. El adaptador del proveedor envía el pago con una clave idempotente.
4. Se valida el estado por webhook firmado o consulta servidor-a-servidor.
5. Se confirma o libera la reserva según el resultado final.
6. Se conserva el identificador del proveedor y la trazabilidad de cada cambio.

**Bloqueo actual:** no se envían pagos reales a MonCash ni NatCash. Falta seleccionar y contratar un proveedor autorizado para ambos rieles y recibir sus especificaciones y credenciales de sandbox.

### 3. Países y teléfonos
- Mantener catálogo ISO 3166-1 y prefijos E.164 para todos los países/territorios admitidos.
- El HTML de esta rama ya contiene un catálogo local sin descarga de 250 códigos ISO alfa-2 únicos, con respaldo utilizable sin conexión. Verificación estática: 250 filas y 250 códigos únicos.
- La República Dominicana tiene selección explícita de prefijos 809/829/849; Haití +509 y Estados Unidos +1 están incluidos. Aún falta validar con pruebas reales de entrada y normalización telefónica por cada territorio; la lista de países no equivale por sí sola a una validación completa de libphonenumber/E.164.
- Guardar país ISO y teléfono normalizado E.164 por separado; no inferir país solo por el prefijo cuando el usuario lo haya seleccionado expresamente.

### 4. Seguridad, sesión e IP
- El límite solicitado es 40 minutos de inactividad, no 40 minutos de sesión absoluta.
- Al vencer: detener listeners, invalidar el estado local, cerrar/invalidar la sesión Firebase de la aplicación y exigir contraseña nuevamente. No basta con ocultar vistas o borrar el estado de usuario del navegador.
- Registrar IP observada por el servidor, hora UTC, UID, evento, resultado, user-agent y request-id. La IP no es prueba de identidad; no confiar en una IP enviada por el navegador.
- Aplicar límites por usuario/IP, validación de origen, controles por rol y alertas por intentos repetidos.
- No registrar contraseñas, tokens, PAN, CVV, PIN ni secretos.
- Los secretos de proveedores se guardarán únicamente como secretos del entorno del Worker; nunca en HTML, GitHub, Firebase público ni mensajes de chat.

## Contrato mínimo de API (propuesto; no activo)

| Ruta | Propósito | Estado sin credenciales |
|---|---|---|
| GET /status | Estado del servicio y capacidades no sensibles | Puede responder |
| POST /api/payments/intents | Crear orden de cobro | Rechazar con PROVIDER_NOT_CONFIGURED |
| POST /api/webhooks/azul | Recibir evento AZUL firmado | Rechazar si no hay verificador/secret configurado |
| POST /api/payouts | Solicitar dispersión MonCash/NatCash | Rechazar con PAYOUT_PROVIDER_NOT_CONFIGURED |
| POST /api/webhooks/payouts | Recibir resultado de dispersión | Rechazar si no hay proveedor/verificador configurado |

Respuestas de bloqueo deben ser explícitas y no crear transacciones financieras, movimientos de balance ni comisiones.

## Criterios obligatorios antes de probar con dinero
- Credenciales de sandbox entregadas directamente en el panel seguro del proveedor/Worker.
- Firma webhook verificada con pruebas de firma válida, inválida y replay.
- Idempotencia probada ante reintentos y eventos duplicados.
- Importe y moneda cotejados contra la orden original.
- Pruebas de pago aprobado, rechazado, expirado, reembolso y contracargo.
- Pruebas de dispersión aprobada, pendiente, rechazada, duplicada y reversada.
- Conciliación de libro mayor y saldos con doble entrada.
- Pruebas de permisos ADMIN/AGENTE/REMITENTE.
- Pruebas de sesión inactiva de 39:59 y 40:00, recarga, pestañas múltiples y reautenticación.
- Pruebas de catálogo completo sin conexión.
- Revisión de seguridad y aprobación explícita antes de cualquier despliegue.

## Datos que no deben solicitarse en este chat
No compartir aquí API keys, secretos, contraseñas, tokens, números de tarjetas, CVV ni credenciales bancarias. Cuando llegue el momento, se configurarán directamente como secretos en el entorno seguro correspondiente.

## Estado de entrega
Este documento registra decisiones y contratos de integración para guiar el desarrollo aislado. **No afirma que AZUL, MonCash o NatCash estén conectados ni que exista capacidad de procesar pagos reales.** La rama de desarrollo permanece separada de main y del sitio publicado.

## Revisión del catálogo (7 de noviembre de 2026)

- Confirmado en el HTML de desarrollo: 250 países/territorios, 250 ISO alfa-2 distintos.
- El catálogo se carga directamente desde `fallbackCountriesData`; no depende de una llamada de red para estar disponible.
- `prefixes()` entrega 809, 829 y 849 al seleccionar República Dominicana. Las reglas por país, prefijos compartidos y validación de números deben pasar pruebas de integración antes de aceptar teléfonos como aptos para transacción.


---

## 10. Reglas definitivas del flujo de cobro, banco y entrega (8 de noviembre de 2026)

### A. Cobro con tarjeta: AZUL y CardNET

- El cliente selecciona el servicio, importe y moneda; SENDWAYO crea una orden pendiente en servidor con una referencia idempotente.
- El cliente sale a una página/checkout seguro del adquirente (o componente/tokenización aprobado). No se escriben ni almacenan PAN completo, CVV, PIN ni fecha de vencimiento en SENDWAYO, GitHub o Firebase.
- **Momento del cargo:** el cliente confirma en el checkout; AZUL/CardNET envía la solicitud de autorización/venta al emisor. Solo una aprobación auténtica del adquirente cambia la orden a pago confirmado. La hora de visualización/contabilización definitiva en el estado de cuenta del tarjetahabiente depende del emisor de la tarjeta.
- **Destino del dinero:** el pago de tarjeta llega primero a la cuenta de liquidación del comercio SENDWAYO que se registra en el contrato/afiliación con AZUL o CardNET. Después el adquirente liquida esos fondos a la cuenta bancaria comercial que el comercio haya designado. No se debe direccionar automáticamente un cargo de tarjeta al MonCash/NatCash del beneficiario.
- El plazo exacto del abono bancario, comisiones, retenciones y contracargos se configura con el adquirente y el banco; no se codifica un plazo supuesto.
- Tras la confirmación servidor-a-servidor, el libro mayor registra el ingreso una sola vez. La orden de entrega se inicia con fondos confirmados/reservados; se cierra solo al confirmar el pago al beneficiario.

AZUL ofrece Página de Pagos y Webservices; su documentación indica afiliación, entrega de credenciales de prueba, certificación técnica y posteriormente acceso a producción: https://dev.azul.com.do/Pages/developer/pages/lib/index.aspx. Su página de pago redirige al cliente al sitio de AZUL para introducir la tarjeta y devuelve el resultado al comercio; el retorno del navegador por sí solo no sustituye la validación del servidor.

CardNET ofrece Botón de Pago con integraciones POST, SOAP y REST: https://developers.cardnet.com.do/guias/boton-de-pago/. La guía REST documenta el entorno QA, los datos de afiliación y el uso de idempotencia; las credenciales de producción se solicitan al ejecutivo de cuenta: https://developers.cardnet.com.do/guias/boton-de-pago/web-sin-pantalla-rest.html.

### B. Transferencia bancaria desde la cuenta del cliente

- El cliente puede usar la aplicación/portal de **cualquier banco que permita transferencias** para enviar dinero a una cuenta comercial SENDWAYO previamente verificada y designada para recibir fondos.
- SENDWAYO muestra únicamente el banco/cuenta comercial validada por Administración; los datos bancarios no se inventan ni se sustituyen por una cuenta personal no verificada.
- La solicitud queda **PENDIENTE DE VERIFICACIÓN**. El comprobante subido no equivale a dinero recibido. Administración verifica el crédito en el estado de cuenta o portal bancario y aprueba el ingreso; solo después se contabiliza.
- Una transferencia bancaria tradicional sale de una cuenta bancaria. Si el pagador quiere financiarla con tarjeta de crédito, debe utilizar el checkout de tarjeta del adquirente o un servicio bancario que admita expresamente transferencias financiadas con tarjeta; no se promete que cualquier banco permita ese uso de la tarjeta.
- Para pagos salientes a otras cuentas bancarias, Administración puede iniciar una transferencia desde la banca en línea de la cuenta de tesorería SENDWAYO y registrar su referencia/comprobante. Sin API o convenio de pagos bancarios, queda en estado PENDIENTE hasta comprobar el abono del beneficiario.

### C. Dispersión a MonCash, NatCash y cuentas bancarias

- **MonCash:** MonCash Business publica integración API, cuenta de comerciante, sandbox y servicios de desembolsos empresariales. SENDWAYO debe completar alta y pruebas antes de solicitar el paso a producción: https://moncashdfs.com/business.
- **NatCash:** se incorpora como destino de negocio, pero antes de activar automatización se debe verificar un convenio directo con Natcom o seleccionar y contratar un agregador que demuestre autorización, trazabilidad, tarifas, soporte y condiciones de reverso. No hay credenciales NatCash en el repositorio.
- Un agregador como Tranzak publica API para MonCash y NatCash con confirmación mediante webhook: https://docs.tranzak.co/ y https://tranzak.co/api-gateway-haiti. Es un proveedor independiente, no documentación oficial de Natcom; requiere evaluación contractual, jurídica, de liquidación y de seguridad antes de seleccionarlo.
- **Bancos:** un envío a cualquier banco se hace por transferencia manual validada o por un API/convenio bancario concreto. No existe una API universal que transfiera automáticamente a todos los bancos.
- Cada payout tiene su propio estado, referencia del proveedor/banco, moneda, beneficiario verificado y clave idempotente. Se reserva una sola vez y solo se confirma cuando el proveedor/banco reporta finalización; los fallos liberan o devuelven la reserva.

### D. Stripe y elegibilidad geográfica

La lista oficial de disponibilidad de Stripe no incluye República Dominicana entre los países donde actualmente se puede abrir una cuenta de pagos: https://stripe.com/global. Una empresa incorporada en un país admitido debe cumplir los requisitos legales, fiscales, de domicilio, teléfono y cuenta bancaria de ese país: https://support.stripe.com/questions/requirements-to-open-a-stripe-account-in-another-country. Por tanto, Stripe no se debe habilitar como si SENDWAYO estuviera afiliado desde República Dominicana; solo se evaluaría si la empresa cuenta legítimamente con entidad y cuenta bancaria en un país admitido.

### E. Estados y reglas del libro mayor

`CREATED` → `PENDING_PAYMENT` → `PAYMENT_CONFIRMED` → `PAYOUT_PENDING` → `DELIVERED`; resultados alternos `PAYMENT_FAILED`, `PAYOUT_FAILED`, `REVERSED`, `REFUNDED` o `CHARGEBACK`. No se mezcla la liquidación del adquirente con la entrega al beneficiario. No se usa el retorno del navegador como prueba de pago, no se acredita por captura de pantalla, no se convierte DOP/HTG automáticamente y no se procesa dos veces un mismo evento.

### F. Estado de activación al 8 de noviembre

| Vía | Estado |
|---|---|
| AZUL | Diseño y documentación identificados; afiliación/credenciales no entregadas; no cobra. |
| CardNET | Documentación y modalidades técnicas identificadas; afiliación/credenciales no entregadas; no cobra. |
| Transferencia bancaria entrante | Flujo manual definido; requiere cuenta comercial de recepción verificada y conciliación bancaria. |
| Transferencia bancaria saliente | Flujo manual administrativo definido; automatización requiere API/convenio por banco. |
| MonCash | API/business programme oficial y sandbox documentados; SENDWAYO aún no tiene afiliación/credenciales. |
| NatCash | Destino previsto; falta proveedor contratado y credenciales verificadas. |
| Stripe | No habilitar para una empresa registrada solamente en República Dominicana mientras el país no aparezca admitido en Stripe Global. |

El módulo de interfaz incluido en la V7 de desarrollo explica el recorrido y muestra los estados pendientes, pero **no cobra ni envía dinero**. No se activa ninguna vía hasta recibir las credenciales directamente en el entorno seguro de cada proveedor y pasar las pruebas de sandbox, webhook, idempotencia, reversos y conciliación.


---

## 11. Cuentas bancarias de liquidación y pagos por WhatsApp (8 de noviembre de 2026)

- El centro de pagos de V7 lee las cuentas bancarias existentes desde la ruta Firebase `sendwayo_express_v2/accounts`; no incorpora ni inventa números de cuenta.
- Administración dispone de cuatro asignaciones: liquidación AZUL, liquidación CardNET, recepción de transferencias entrantes y cuenta de tesorería para transferencias salientes. Las asignaciones guardan solo los IDs de las cuentas y metadatos de auditoría en `sendwayo_express_v2/settings/paymentSettlement`.
- La interfaz no preselecciona arbitrariamente una de las tres cuentas. Debe elegirse la cuenta que esté a nombre del comercio y que el adquirente acepte en el contrato. Una escritura denegada por las reglas de Firebase se muestra como error y no se anuncia como guardada.
- Los remitentes solo ven la cuenta de recepción seleccionada para transferencias entrantes. Administración puede ver y elegir las cuentas de liquidación; los agentes no pueden cambiar esta configuración.
- CardNET publica Botón de Pago, tokenización, 3-D Secure y cobros por WhatsApp. La operación por WhatsApp es un enlace/cobro del adquirente; después de que CardNET liquide en la cuenta comercial elegida, la dispersión a MonCash/NatCash es una segunda operación.
- AZUL ofrece Página de Pagos y Webservices. La afiliación exige documentación del comercio y comprobante bancario; en su proceso técnico entrega credenciales de prueba, certifica el intercambio y luego facilita credenciales de producción.
- Las cuentas no se asignan como afiliadas por código: la aplicación guarda la preferencia de tesorería, pero solo AZUL/CardNET determinan si aceptan la cuenta y el titular tras revisar los documentos y contrato.

Fuentes oficiales de afiliación y documentación:
- AZUL afiliación: https://www.azul.com.do/Pages/es/hazte-cliente.aspx
- AZUL documentación e-commerce: https://dev.azul.com.do/Pages/developer/pages/lib/index.aspx
- CardNET afiliación: https://www.cardnet.com.do/afiliate/personal
- CardNET botón de pago: https://www.cardnet.com.do/soluciones/online/boton-de-pago
- CardNET tarifario (incluye Cobros por WhatsApp): https://www.cardnet.com.do/tarifario
- MonCash Business: https://moncashdfs.com/business

## 12. Paginación uniforme de transacciones

- Todas las tablas de transacciones incluidas en las vistas admitidas se muestran en páginas de 10 registros.
- La numeración de fila se reinicia en cada página: 01 a 10; la página siguiente comienza de nuevo en 01.
- Cada listado presenta los controles Anterior y Posterior/Siguiente, deshabilitados al llegar al principio o al final.
- El filtro de búsqueda se aplica antes de calcular el número de páginas; al cambiar la búsqueda vuelve a la primera página.
- Las vistas Envíos, Recargas y Paqueticos usan su paginador propio; las demás tablas transaccionales usan el paginador general.

**Límite de activación:** la asignación bancaria en SENDWAYO no sustituye el alta contractual, la revisión de documentos, las credenciales sandbox/producción ni la certificación de AZUL/CardNET. Tampoco habilita transferencias automáticas a MonCash/NatCash sin la API y el convenio correspondientes.


### Nota de afiliación empresarial y cuentas bancarias

- Para CardNET empresarial, la página oficial solicita Registro Mercantil actualizado, última asamblea, estatutos, cédula del gerente/apoderado y estado de cuenta o cheque de la cuenta donde se recibirán los depósitos. Para persona física, solicita cédula, estado de cuenta y contrato de alquiler o título del local.
- El módulo usa un enlace de afiliación general y el enlace empresarial; no envía formularios ni documentos privados al adquirente desde SENDWAYO. El propietario completa la solicitud de afiliación directamente en el portal oficial.
- La lista de cuentas bancarias se refresca desde Firebase al cargar el directorio bancario. Cuando la lista llega, el módulo actualiza el contador y los selectores. Si Firebase no permite guardar la asignación de tesorería, el módulo informa el error y no afirma que se haya cambiado.
