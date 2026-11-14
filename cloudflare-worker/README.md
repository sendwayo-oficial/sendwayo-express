# SENDWAYO EXPRESS — liquidación automática RD → HT

Servicio financiero aislado para liquidar envíos desde República Dominicana hacia Haití mediante NatCash o MonCash. No reemplaza el Worker que ya existe; usa el nombre independiente sendwayo-express-financial-api.

## Cálculo acordado

| Concepto | Importe |
| --- | ---: |
| Monto enviado | RD$2,000.00 |
| Comisión DOP (8%) | RD$160.00 |
| Neto DOP | RD$1,840.00 |
| Conversión ×2.10 | G$3,864.00 |
| Comisión Administración HTG (3%) | G$115.92 |
| Débito del balance HTG de Administración (97%) | G$3,748.08 |

Al aprobarse el envío original se guarda simultáneamente:
- La operación original en estado Aprobado y su importe recibido en HTG.
- Una segunda operación interna HT → HT NatCash/MonCash, ya Aprobada.
- El crédito de comisión HTG de Administración, el débito neto del balance HTG, un asiento de ledger y auditoría.

El remitente no carga ni ve la operación interna. Administración y agentes la reciben desde la colección interna autorizada. El DOP balance de Administración no se altera.

## Seguridad

- El navegador transmite solo el ID de la transacción. El Worker vuelve a leer y calcular montos y comisiones desde Firebase.
- El token de Firebase Authentication se valida en Identity Toolkit.
- La identidad de Administración se contrasta con el UID del perfil admin en Firebase; los agentes se validan mediante agentAuth y su perfil activo.
- Los agentes no pueden aprobar su propia operación ni una operación creada por Administración.
- Una actualización condicional ETag/If-Match protege toda la escritura financiera en el nodo del proyecto. Los conflictos concurrentes se reintentan; una operación ya liquidada es idempotente.
- El reverso es exclusivo de Administración. Además de restaurar el débito neto HTG y descontar la comisión HTG generada, devuelve el importe DOP retenido al remitente (marcando la reserva como revertida) o a la cartera DOP de Administración si el envío fue financiado por fondos administrativos. Se bloquea sin cambios parciales si la comisión HTG ya fue retirada o si no existe la reserva original que debe devolverse.
- No hay contraseñas ni claves privadas dentro del repositorio.

## Preparación de Cloudflare

Variables del Worker:
- FIREBASE_PROJECT_ID = sendwayo-express
- FIREBASE_DATABASE_URL = https://sendwayo-express-default-rtdb.firebaseio.com
- ALLOWED_ORIGINS = https://sendwayo-oficial.github.io
- FIREBASE_WEB_API_KEY = clave web del proyecto Firebase.

Secreto de Cloudflare:
- FIREBASE_SERVICE_ACCOUNT_JSON = JSON completo de una cuenta de servicio del proyecto Firebase con permisos de acceso a Realtime Database.

El JSON de la cuenta de servicio debe guardarse únicamente como secreto del Worker. Nunca se coloca en GitHub, HTML, mensajes ni capturas.

Desde esta carpeta, después de instalar Wrangler e iniciar sesión en Cloudflare:

    wrangler secret put FIREBASE_WEB_API_KEY
    wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
    wrangler deploy

El Worker nuevo tiene el nombre sendwayo-express-financial-api. No altera automáticamente sendwayo-express-backend. No se debe habilitar la liquidación desde V7 hasta que el Worker y sus secretos estén configurados y /status y /api/verify se hayan verificado.

## Endpoints

- GET /status: comprobación de disponibilidad.
- POST /api/verify: valida el token de Firebase.
- POST /api/settle-rd-ht: recibe {"transactionId":"ID_DEL_ENVIO"}.
- POST /api/reverse-rd-ht: recibe {"transactionId":"ID_DEL_ENVIO"} y solo admite Administración.

## Pruebas locales

    node --check src/index.mjs
    node --test tests/*.test.mjs

La rama es de desarrollo. No liquida operaciones reales hasta desplegar el Worker y activar el endpoint en V7.
