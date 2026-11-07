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
