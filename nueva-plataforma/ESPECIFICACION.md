# SENDWAYO EXPRESS — Nueva plataforma

## Estado
Fundación aislada en la rama `new-platform-foundation-2026-10-16`. No cambia `main`, GitHub Pages ni la plataforma publicada.

## Reglas obligatorias
- Roles separados: 1 administrador, 5 agentes y 10 remitentes de prueba.
- Firebase Authentication y Realtime Database compartidos entre dispositivos; nunca usar localStorage como fuente de balances.
- DOP/RD$ y HTG/GDES separados; no conversión automática.
- Depósitos: pendientes hasta aprobación; acreditar una sola vez al remitente y en la moneda seleccionada.
- Envíos: validar balance por moneda; reservar/descontar al solicitar; NO COINCIDE permite corregir; rechazo revierte exactamente una vez; aprobados protegidos y auditados.
- Comisiones: general 8%; recargas/paqueticos/facturas/servicios 5%; NatCash/MonCash Haití→Haití usa tarifa local; depósitos no generan comisión. Operaciones del remitente dividen comisión 50/50 remitente/administración; operaciones con fondos administrativos generan 100% para administración.
- Permisos: agentes no pueden modificar balances/comisiones ni consultar información secreta.
- Comprobante solo tras aprobación, con beneficiario y teléfono, monto/moneda, fecha/hora, referencia, emitido por y autorizado por; sin comisión interna ni datos confidenciales.
- Directorio compartido para sugerir nombres/teléfonos y evitar duplicados; notificaciones en tiempo real; exportación CSV/Excel/PDF; historial y auditoría.
- No publicar contraseñas ni credenciales administrativas en HTML, JavaScript público o Git.
- No migrar ni modificar datos reales hasta tener copia/plan de migración y pruebas verificables.

## Secuencia de construcción
1. Identificar y validar la configuración web del proyecto Firebase correcto y sus reglas.
2. Implementar autenticación real y enlazar perfiles por UID de Firebase Auth; corregir la inconsistencia histórica de UID del administrador sin alterar cuentas.
3. Implementar reglas de seguridad y operaciones financieras idempotentes en servidor/Cloud Functions solo si el plan actual lo permite; no asumir que Functions están disponibles en Spark.
4. Implementar vistas por rol, operaciones, notificaciones, directorio y comprobantes.
5. Pruebas automatizadas con datos sintéticos, validación de permisos y doble aprobación/reintentos.
6. Desplegar una URL de prueba separada, comprobar inicio de sesión y persistencia y, solo con aprobación, preparar migración/publicación.

## Bloqueo de despliegue conocido
La cuenta GitHub conectada para `sendwayoexpress@gmail.com` ha respondido suspendida. La conexión alternativa puede leer el repositorio, pero todavía debe comprobarse si tiene permiso de escritura y despliegue. No afirmar que una URL está lista hasta probarla en navegador y con Firebase.
