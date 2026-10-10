# SENDWAYO EXPRESS — Fusión Punto A + Punto B (V31.1)

## Estado
**Rama de revisión; NO publicada en producción.** No se modificó `main`, el sitio público actual ni los balances reales.

- **Punto A / autenticación y backend objetivo:** Firebase `sendwayo-express-app-101`.
- **Punto B / repositorio de revisión:** `sendwayo-oficial/sendwayo-express`.
- **Rama de trabajo:** `fusion-point-a-b-20261010`.
- **Revisión:** https://github.com/sendwayo-oficial/sendwayo-express/pull/17

## Correcciones aplicadas en la rama
- `index.html`: conserva la interfaz de Punto A como base; mantiene el comprobante y el autocompletado de Punto B.
- El inicio de sesión usa Firebase Authentication y el perfil/rol de Firebase, no contraseñas locales ni roles enviados por el navegador.
- La pantalla administrativa combina perfiles activos con cuentas por UID; deduplica identidades por correo y conserva los saldos como campos distintos `balanceDOP` y `balanceHTG`. Nunca suma balances; los agentes siempre se muestran sin balance ni comisión personal.
- La lista de operaciones y las notificaciones se alimentan de listeners Firestore. Se quitó el efecto que podía reemplazar notificaciones de Firestore por una lista de `localStorage`.
- Se deshabilitó la navegación a las antiguas colas de ajuste y banca del Punto B que cambiaban datos financieros sólo en `localStorage`. Los ajustes de balance/comisión deben pasar por el callable seguro de Punto A y los depósitos/envíos por el flujo de operaciones del servidor.
- Ajustes: el backend normaliza identificadores de administración, admite establecer/acreditar/descontar montos sin saldo negativo, utiliza clave de idempotencia y genera registro de auditoría y libro contable. El comprobante no expone motivo interno ni valores antes/después.
- Tarifas de dominio centralizadas: rutas internacionales identificadas al 10%; recargas/paqueticos/servicios/facturas al 5%; ruta nacional RD→RD al 8%; Haití→Haití usa la tarifa fija por tramos. Las rutas entre monedas deben incluir importe recibido explícito; no se inventan tipos de cambio.
- El campo de importe recibido se muestra para las rutas transfronterizas que lo necesitan, con moneda de destino indicada en la interfaz.

## Validaciones ejecutadas
- [Validación del candidato: PASS](https://github.com/sendwayo-oficial/sendwayo-express/actions/runs/38053705122).
- [Validación de integridad: PASS](https://github.com/sendwayo-oficial/sendwayo-express/actions/runs/38053705143).
- [Integridad de interfaz: PASS](https://github.com/sendwayo-oficial/sendwayo-express/actions/runs/38053705128).
- [Validación de backend: PASS](https://github.com/sendwayo-oficial/sendwayo-express/actions/runs/38053705130).
- JavaScript inline: **20 bloques, sin errores de sintaxis**.
- Pruebas de dominio: **16/16 aprobadas**.
- Contrato cliente/servidor: **24 llamadas callable del frontend corresponden a 24 exports del backend**.
- Configuración JSON del backend apunta a `sendwayo-express-app-101`; reglas de Firestore niegan escrituras financieras directas desde el cliente.

Estas pruebas son estáticas y de lógica de dominio. **No son una prueba end-to-end con Firebase Authentication, Firestore o Cloud Functions en producción.**

## Bloqueos antes de desplegar
1. Aún no se pudo comprobar el proyecto Firebase vivo desde esta sesión: el plugin/conexión administrativa de Firebase no está conectado.
2. Falta validar con Firebase Emulator Suite y luego con cuentas autorizadas: inicio de sesión de administrador/remitente/agente; notificación operación→administrador; aprobación/rechazo/No Coincide; depósito y ajuste idempotentes; comprobante solo después de aprobación; actualización de saldos y notificaciones entre sesiones/dispositivos.
3. El repositorio raíz de Punto B conserva el proyecto Firebase antiguo `sendwayo-express`. No se debe reutilizar su `.firebaserc` ni desplegar desde la raíz. El backend de esta fusión está aislado en `backend/.firebaserc` y `backend/firebase.json`, que apuntan a Punto A.
4. La integración de cuentas históricas debe hacerse con el asistente de importación y un archivo de exportación válido de Punto B. Punto A tiene prioridad; sólo se completan campos vacíos de identidades inequívocas. No se importan balances ambiguos ni se crean balances de agentes.

## Regla de seguridad
No fusionar con `main` ni desplegar en Firebase Hosting hasta que se complete la prueba de integración. No se han cambiado credenciales y no se han trasladado ni puesto a cero balances reales.
