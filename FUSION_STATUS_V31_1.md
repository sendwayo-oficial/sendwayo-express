# SENDWAYO EXPRESS — Fusión Punto A + Punto B (V31.1)

## Estado
**Rama de revisión, NO publicada en producción.** El sitio público de Punto B y los balances remotos permanecen sin cambios. No se han creado, reiniciado ni transferido balances.

- **Punto A / backend objetivo:** Firebase project `sendwayo-express-app-101`.
- **Punto B / repositorio fuente:** `sendwayo-oficial/sendwayo-express`.
- **Rama de trabajo:** `fusion-point-a-b-20261010`.

## Contenido incorporado en esta rama
- `index.html`: candidato de interfaz basado en el diseño de Punto A; incorpora el comprobante y las sugerencias del Punto B, campos separados RD$/DOP y HTG/GDES, sin módulo Capital, y el asistente de conciliación de cuentas A/B.
- `backend/functions/`: funciones de servidor, reglas e índices de Firestore en `backend/`, configurados para Punto A.
- Fusión de perfiles: Punto A tiene prioridad; Punto B completa solo campos vacíos para identidades compatibles; nunca se suman balances; conflictos de correo, rol o moneda quedan para revisión manual; los agentes no tienen balance ni comisión personal.
- Idempotencia en operaciones y movimientos sensibles; liquidación financiera realizada en el backend propuesto, no por el navegador.

## Validaciones ejecutadas
- [CI del candidato frontend: PASS](https://github.com/sendwayo-oficial/sendwayo-express/actions/runs/38051564794).
- [CI del backend: PASS](https://github.com/sendwayo-oficial/sendwayo-express/actions/runs/38051564668).
- Sintaxis de Cloud Functions y reglas/JSON objetivo: correcto.
- Contrato frontend/backend: **21 llamadas callable del cliente coinciden con 21 exports del backend**.
- Pruebas de dominio: **14/14 aprobadas**; cubren roles, balances, monedas, tasas, comisiones, límites de agente, duplicados y conciliación A/B.

Estas verificaciones son estáticas y de lógica de dominio. No equivalen a una prueba de inicio de sesión ni a una prueba integral con Firebase en línea.

## Bloqueos antes de publicar
1. No hay una conexión administrativa de Firebase disponible en esta sesión para inspeccionar o desplegar sobre el proyecto real.
2. Falta validar en el proyecto A que Firebase Authentication, Firestore y las Cloud Functions estén habilitados y en las regiones esperadas.
3. Falta probar con Firebase Emulator Suite y luego con cuentas autorizadas: inicio de sesión de los tres roles, operación → notificación al administrador, aprobación/rechazo/No Coincide, ajuste de balances RD$/HTG, depósito idempotente, comprobante solo tras aprobación y sincronización entre sesiones.
4. El repositorio de Punto B mantiene en su raíz el proyecto Firebase antiguo `sendwayo-express`. Su `.firebaserc`, reglas RTDB y workflow de publicación de reglas no deben reutilizarse para Punto A. Para el candidato, el objetivo nuevo está aislado en `backend/.firebaserc` y `backend/firebase.json`; cualquier despliegue debe realizarse desde `backend/` y solo tras la integración de pruebas.
5. La cuenta administrativa existente debe comprobarse; este trabajo no crea ni cambia contraseñas.

## Seguridad de la publicación
No fusionar la rama con `main` ni desplegar en Firebase Hosting hasta que las pruebas de integración pasen. El workflow de GitHub Pages publica desde `main`; esta rama de revisión no ha activado esa publicación.
