# SENDWAYO EXPRESS — backend candidato V31.1

**Destino:** Firebase `sendwayo-express-app-101`. **Estado:** no desplegado.

Incluye funciones callable para autenticación/perfiles, registro pendiente, operaciones, aprobaciones/rechazos/No Coincide, reenvío y borrado idempotente de rechazadas, ajustes y retiros de comisión con auditoría, cuentas bancarias, seguimiento de paquetes, conciliación, beneficiarios, importación deduplicada de cuentas A/B y aprobación explícita de saldos propuestos.

## Verificación local actual

- `node --check functions/index.js`: correcto.
- `node --check functions/domain.js`: correcto.
- `node --test functions/test/domain.test.js`: **14/14 correctas**.
- Frontend `../index.html`: **25 bloques inline, 0 errores de sintaxis**.
- Contrato frontend/backend: **21 funciones invocadas por el cliente y 21 exports callable coincidentes**.

Esto no equivale a una prueba integral contra Firebase. No se han validado cuentas Auth reales, reglas, índices, Storage, listeners multi-sesión ni despliegue; no se hicieron cambios en balances reales.

## Antes del despliegue

1. Confirmar Firestore, Authentication y Cloud Functions habilitados en el proyecto destino.
2. Revisar las reglas e índices actuales y ejecutar Firebase Emulator Suite.
3. Probar login y permisos de admin/remitente/agente, transacciones, ajustes en ambas monedas, notificaciones y comprobantes con varias sesiones.
4. Autorizar el dominio donde se publique el frontend. El sitio GitHub Pages y el dominio `web.app` no se consideran autorizados hasta verificarlos.
5. No cargar balances automáticamente: revisar propuestas y conflictos; el backend impide aplicar migraciones sobre cuentas con movimientos/saldos existentes.
6. Solo después de pasar la auditoría, desplegar functions/rules/indexes y frontend como una sola versión coordinada.

No se incluyen credenciales privadas ni contraseñas.