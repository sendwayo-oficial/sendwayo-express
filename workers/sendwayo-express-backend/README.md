# SENDWAYO EXPRESS — Cloudflare Worker de pagos y dispersión

Este Worker amplía el servicio existente de verificación de identidad y añade un registro normalizado en
\`sendwayo_express_v2/transactions\`, pagos alojados por Stripe Checkout o CardNET, y órdenes de dispersión.

## Estado real de esta entrega

- El código del Worker está preparado; no está desplegado por este repositorio.
- El flujo Stripe requiere una cuenta comercial Stripe habilitada en un país admitido y secretos válidos. La República Dominicana no figura actualmente entre los países donde Stripe permite abrir una cuenta comercial.
- CardNET usa el flujo de sesión alojada: el navegador solo recibe el identificador de sesión; no recibe el token privado ni el secreto de sesión. Se necesita afiliación, Merchant Number, Terminal, adquirente y certificación. CardNET indica que los datos de QA y producción son diferentes.
- AZUL queda visible como pasarela pendiente, pero responde 501 hasta incorporar las credenciales y el contrato técnico del canal que AZUL habilite para SENDWAYO. No se simula una autorización.
- MonCash, NatCash, bancos y comercios se registran en el motor de dispersión. La entrega a un agente autorizado requiere confirmación del agente; bancos/comercios quedan pendientes de configurar un adaptador/API contratado. No se marca como completado sin referencia real.

## Endpoints

- \`GET /api/health\`: estado de configuración, sin revelar secretos.
- \`POST /api/verify\`: verifica el token Firebase Authentication y el perfil activo; mantiene el contrato usado por el login V7.
- \`POST /api/payments/create\`: crea una transacción y una sesión alojada en Stripe o CardNET.
- \`POST /api/webhooks/stripe\`: valida la firma HMAC de Stripe con el cuerpo HTTP original.
- \`GET /api/cardnet/return?transaction=...\`: consulta el resultado en CardNET usando la sesión y clave guardadas en servidor.
- \`GET /api/transactions\`: Administración ve todas; cada usuario ve las propias.
- \`GET /api/payouts/queue\`: Administración ve la cola; un agente solo ve las órdenes asignadas a su UID.
- \`POST /api/payouts/dispatch\`: solo Administración puede crear/asignar una orden después del pago confirmado.
- \`POST /api/payouts/confirm\`: el agente asignado o Administración confirma con referencia externa; entonces pasa a \`completed\`.

## Secrets de Cloudflare

Cree estos Secrets en el Worker, nunca como valores del HTML ni en Git:

### Firebase
- \`FIREBASE_WEB_API_KEY\`: clave web pública del proyecto (la verificación Identity Toolkit la necesita).
- \`FIREBASE_CLIENT_EMAIL\`: correo de una cuenta de servicio autorizada a la RTDB.
- \`FIREBASE_PRIVATE_KEY\`: clave privada PEM de la cuenta de servicio.
- \`FIREBASE_DATABASE_URL\`: URL RTDB, por ejemplo \`https://sendwayo-express-default-rtdb.firebaseio.com\`.

La cuenta de servicio debe tener permiso administrativo sobre Firebase Realtime Database. No guarde el JSON de cuenta de servicio en GitHub.

### Stripe (solo si la empresa tiene cuenta Stripe válida)
- \`STRIPE_SECRET_KEY\`
- \`STRIPE_WEBHOOK_SECRET\`
- \`STRIPE_ACCOUNT_COUNTRY\`: país legal de registro de la empresa en Stripe; no el país del cliente.

Crear el webhook en Stripe Dashboard con URL \`https://sendwayo-express-backend.ideletteismorin.workers.dev/api/webhooks/stripe\`. Suscribir al menos \`checkout.session.completed\`, \`checkout.session.async_payment_failed\` y \`payment_intent.payment_failed\`.

### CardNET
- \`CARDNET_MERCHANT_NUMBER\`
- \`CARDNET_MERCHANT_TERMINAL\`
- \`CARDNET_ACQUIRER_CODE\`
- \`CARDNET_MERCHANT_TYPE\`
- \`CARDNET_MERCHANT_NAME\`
- Opcionales: \`CARDNET_TAX\`, \`CARDNET_AVS\`.

Los parámetros deben ser los emitidos por CardNET para el entorno de certificación y después para producción. El código no contiene credenciales ni datos de tarjetas.

## Despliegue

Desde esta carpeta, configure primero los Secrets en el Worker Cloudflare existente y luego ejecute:

\`\`\`bash
npx wrangler deploy
\`\`\`

No use variables \`vars\` para secretos. Los campos públicos de \`wrangler.toml\` no contienen credenciales.

## Modelo Firebase central

Ruta: \`sendwayo_express_v2/transactions/{transactionId}\`.

Contiene \`senderInfo\`, \`recipientInfo\`, \`paymentDetails\`, \`payoutDetails\`, \`route\`, \`status\`, y \`timestamps\`. Se conservan importes y monedas por separado; no hay conversiones automáticas.

Los estados distinguen:
- \`pending_payment\`
- \`paid_pending_payout\`
- \`payment_failed\`
- \`payment_setup_failed\`
- \`completed\`

Un pago confirmado por tarjeta no significa que el efectivo haya sido entregado. La transacción solo llega a \`completed\` después de la confirmación del agente o de un proveedor bancario/comercial conectado.
