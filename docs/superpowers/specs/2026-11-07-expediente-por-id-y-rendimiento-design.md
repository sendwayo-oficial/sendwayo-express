# SENDWAYO EXPRESS — Expediente por ID y fluidez de la interfaz

## Intención
Permitir que Administración consulte desde un único expediente la información relacionada con un remitente o agente usando su ID visible, y reducir el trabajo de JavaScript que ralentiza la portada, el acceso y las vistas privadas.

## Alcance funcional
- La opción del menú y el título de pantalla se llaman exactamente **Expediente por ID**.
- La consulta acepta el ID visible y los alias/códigos existentes de agentes y remitentes; no devuelve el expediente del administrador.
- Presenta perfil y estado, balances DOP/HTG y comisiones DOP/HTG, movimientos vinculados, solicitudes vinculadas, beneficiarios asociados y cuentas bancarias vinculadas cuando estén disponibles en los datos sincronizados.
- Los movimientos conservan categoría, fecha, ruta/detalle, beneficiario, importe, moneda y estado; los detalles técnicos se muestran sin credenciales ni secretos.
- La función es exclusivamente administrativa y de solo lectura: no crea, modifica ni elimina datos y no cambia balances o comisiones.
- El expediente indica claramente que refleja los registros que Firebase ha sincronizado para la sesión. No debe prometer auditoría histórica que no esté disponible en los datos cargados.

## Rendimiento
- Reducir escaneos completos de la página: la traducción procesa solo nodos añadidos y los observadores de tablas/controles actúan sobre nodos relevantes.
- Los observadores globales no deben ejecutar trabajo pesado mientras el usuario está en la portada pública o pantalla de acceso.
- Reducir temporizadores de respaldo de tareas visuales y almacenamiento; mantener el listener realtime de Firebase y la reconciliación financiera necesaria.
- Cargar Firebase App primero y Auth/Database en paralelo después, sin cambiar la autenticación ni la persistencia SESSION.
- No eliminar ni debilitar permisos por rol, bloqueo por inactividad de 40 minutos, notificaciones o sincronización.

## No objetivos
- No publicar en GitHub Pages ni modificar `main`.
- No escribir en Firebase ni tocar reglas, balances, comisiones, cuentas o transacciones reales.
- No integrar proveedores de pago en esta tarea.
- No mostrar contraseñas, tokens, claves API, CVV o PIN.

## Decisiones de implementación
- Reutilizar la pantalla de investigación ya presente en el HTML en lugar de crear una segunda pantalla.
- Reutilizar `SENDWAYO_REQUESTS`, `SENDWAYO_BANKS`, `BENEFICIARIOS_DB` y `TRANSACCIONES` que la sesión administrativa ya sincroniza.
- No realizar una lectura masiva nueva de la rama `audit`: su esquema y reglas no están verificados y podría hacer más lenta la entrada.
- Conservar temporizadores de seguridad/sincronización esenciales; hacer más lentos solo los respaldos visuales no críticos.
