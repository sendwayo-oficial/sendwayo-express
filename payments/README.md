# Centro de pagos SENDWAYO EXPRESS — implementación para revisión

Estado: prototipo aislado en rama de revisión; no desplegado ni conectado a dinero real.

## Vía prioritaria para tarjeta
**CardNET** es el candidato local a evaluar para tarjetas de crédito y débito. Su sitio oficial describe Botón de Pago para web/app, redirección a pantalla segura, 3-D Secure y tokenización. La documentación técnica ofrece modalidades POST, SOAP y REST. SENDWAYO debe solicitar afiliación e informar expresamente que su actividad incluye servicios de remesas, cobros y pagos a terceros; la aceptación de tarjetas para ese giro debe quedar confirmada por escrito antes de continuar.

- Afiliación: https://www.cardnet.com.do/afiliate
- Botón de pago: https://www.cardnet.com.do/soluciones/online/boton-de-pago
- Documentación: https://developers.cardnet.com.do/guias/boton-de-pago/
- REST: https://developers.cardnet.com.do/guias/boton-de-pago/web-sin-pantalla-rest.html

AZUL queda descartado por decisión del propietario. Stripe queda pendiente y no debe ofrecerse como disponible desde una operación establecida solamente en República Dominicana. Paddle/Lemon Squeezy no se deben usar para disfrazar pagos de remesas como ventas de software.

## Transferencias bancarias
Se prepara un flujo de transferencia manual con cuenta receptora comercial validada por Administración. Popular, BHD y Banreservas son candidatos para la cuenta de liquidación; no se almacenan datos bancarios personales en el HTML. El comprobante del cliente no acredita el dinero. Administración confirma el crédito real en la banca/estado de cuenta y aprueba una sola vez.

## Contrato técnico requerido
1. Crear intentos de pago en servidor con referencia única e idempotente.
2. Redirigir al checkout alojado del adquirente; no capturar PAN/CVV/PIN en SENDWAYO.
3. Validar resultado consultando al proveedor desde el servidor y verificar autenticidad de webhooks según la especificación oficial entregada al comercio.
4. Comparar importe, moneda, referencia y comercio contra el intento original.
5. Aplicar acreditación en libro mayor una sola vez; no confiar en parámetros de retorno del navegador.
6. Registrar reembolso, contracargo, expiración, rechazo y conciliación.
7. Mantener las claves solo como secretos del Worker; jamás en HTML, Firebase público, repositorio o chat.

## Lo que falta antes de producción
- Afiliación CardNET y aprobación escrita de la actividad comercial concreta.
- Credenciales QA y especificación final entregadas por CardNET.
- Implementar el adaptador exacto contra el contrato del adquirente (sin inventar endpoints/campos).
- Configurar webhook secreto y verificación de firma conforme a la documentación de la cuenta.
- Pruebas QA de aprobada/rechazada/expirada/reembolso/duplicado/replay.
- Validación legal/regulatoria y conciliación.
- Aprobación del propietario antes de desplegar y activar.

## Archivos
- `preview/centro-pagos.html`: vista previa de interfaz para aprobación.
- `worker/payment-routes.example.js`: contrato fail-closed de rutas. No acepta pagos ni acredita fondos sin integración y secretos reales.

Este cambio no modifica saldos, comisiones, reglas Firebase, autenticación ni datos de clientes.
