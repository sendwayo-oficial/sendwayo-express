# SENDWAYO EXPRESS — Worker de pagos y dispersión V7

Este Worker es un servicio separado del HTML de GitHub Pages. No sustituye el Worker de autenticación que hoy responde en `/api/verify`; se publica inicialmente como `sendwayo-express-payments-v7` para no sobrescribir ese servicio.

## Qué contiene

- Verificación de Firebase ID tokens y lectura de perfiles SENDWAYO.
- Stripe Checkout para tarjetas internacionales; el estado pagado se fija únicamente con un webhook firmado.
- CardNET Botón de Pago (sesión REST + formulario POST alojado + consulta de sesión desde el servidor). DOP usa `CurrencyCode=214`; USD usa `840`.
- Tranzak para cobros MonCash/NatCash en HTG, con webhook HMAC.
- Dispersión Tranzak a billeteras prefondeadas MonCash/NatCash, en dos pasos authorize/send; el resultado final llega por webhook.
- Órdenes manuales a bancos/comercios cuando todavía no existe un adaptador institucional contratado.
- Esquema canónico Firebase en `sendwayo_express_v2/transactions/{transactionId}`.

## Importante para el dinero real

1. No se confirma un pago al regresar al navegador. Stripe, Tranzak y CardNET se consultan o verifican desde el servidor.
2. No se convierte dinero automáticamente. La moneda y el importe de origen y de entrega deben enviarse explícitamente.
3. Tranzak MonCash/NatCash exige HTG para evitar que el proveedor convierta una orden USD sin que SENDWAYO haya aceptado una tasa.
4. El payout MonCash/NatCash usa una billetera de pagos prefondeada y debe estar habilitado en la cuenta comercial Tranzak.
5. Los payouts a bancos/comercios se quedan en `manual_pending` hasta que el administrador registre referencia y evidencia. El Worker no afirma que se hizo una transferencia bancaria.
6. Un error de red durante el envío de un payout se marca `outcome_unknown`. No se reintenta automáticamente, para evitar pagar dos veces.
7. Las tarjetas se capturan en las páginas alojadas por los proveedores. SENDWAYO no recoge PAN, CVV ni fechas de expiración.

## Configuración local

Requisitos: Node.js 20+ y Wrangler actual.

```bash
npm install
cp .dev.vars.example .dev.vars
npm test
npm run check
npx wrangler dev
```

El fichero `.dev.vars` es local y no debe subirse.

## Secretos Cloudflare

Crear cada secreto desde el directorio de este Worker; no colocarlos en `wrangler.toml`, HTML ni GitHub:

```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put TRANZAK_API_KEY
npx wrangler secret put TRANZAK_WEBHOOK_SECRET
npx wrangler secret put TRANZAK_PAYOUT_WEBHOOK_SECRET
```

CardNET necesita credenciales y datos asignados al comercio por CardNET:

```bash
npx wrangler secret put CARDNET_MERCHANT_NUMBER
npx wrangler secret put CARDNET_MERCHANT_TERMINAL
npx wrangler secret put CARDNET_MERCHANT_NAME
npx wrangler secret put CARDNET_MERCHANT_TYPE
```

El endpoint de CardNET y el merchant number/terminal de producción deben ser los entregados en la certificación del comercio. El archivo de configuración usa solamente el endpoint QA. No usar los datos de ejemplo públicos de CardNET como cuenta real.

## Endpoints

- `GET /health`
- `POST /api/verify` — conserva el contrato de validación Firebase utilizado por la aplicación.
- `POST /api/payments/checkout` — crea una transacción canónica y la sesión de pago; requiere `Authorization: Bearer <Firebase ID token>` y `Idempotency-Key`.
- `POST /api/payments/cardnet/confirm` — consulta CardNET desde servidor después del retorno.
- `POST /api/webhooks/stripe`
- `POST /api/webhooks/tranzak`
- `POST /api/webhooks/tranzak-payout`
- `POST /api/transactions/review` — aprobación/rechazo/No coincide con permisos de rol.
- `GET /api/transactions/{id}`
- `POST /api/payouts/dispatch` — solo administración y transacción aprobada.
- `POST /api/payouts/manual/complete` — solo administración; exige referencia y evidencia.

## Estructura canónica

`sendwayo_express_v2/transactions/{id}` conserva `transactionId`, `userId`, `senderInfo`, `recipientInfo`, `paymentDetails`, `payoutDetails`, `status` y `timestamps`. También registra `createdByAuthUid`, `ownerUserId`, `countryFrom`, `countryTo` y `sinConversionAutomatica`.

## Despliegue inicial aislado

No se debe desplegar con el nombre actual del Worker de autenticación. Este proyecto crea un Worker nuevo. Después de pruebas Sandbox, configurar los secretos, los URLs de webhook de los proveedores y hacer `npx wrangler deploy`. El URL quedará como:

`https://sendwayo-express-payments-v7.<tu-subdominio>.workers.dev`

Antes de producción, agregar ese dominio a `ALLOWED_ORIGINS`/configuración de la app, completar certificación CardNET y validar los webhooks con pagos de prueba. No se puede activar cobro/dispersión real sin las credenciales, aprobación comercial y fondos prefondeados de cada proveedor.
