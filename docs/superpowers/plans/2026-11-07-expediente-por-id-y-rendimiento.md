# Expediente por ID y fluidez de la interfaz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la pantalla de investigación existente en «Expediente por ID» y reducir trabajo repetitivo en la portada y la interfaz.

**Architecture:** Reutilizar el HTML V7 y sus datos Firebase ya sincronizados. Extender la consulta de solo lectura para incluir solicitudes y cuentas bancarias asociadas, y hacer que los observadores visuales trabajen incrementalmente o solo después de autenticar.

**Tech Stack:** HTML, CSS, JavaScript, Firebase compat SDK, Node.js assert para verificaciones estáticas.

**Spec:** `docs/superpowers/specs/2026-11-07-expediente-por-id-y-rendimiento-design.md`

## Global Constraints
- Trabajar solo en `work/sendwayo-international-payments-session`.
- No tocar `main`, GitHub Pages, Firebase RTDB, reglas, balances, comisiones ni datos reales.
- Mantener Firebase Auth con persistencia `SESSION` y cierre por 40 minutos de inactividad.
- Expediente solo para ADMIN y solo remitentes/agentes como sujetos de consulta.
- No exponer credenciales, tokens ni secretos en los detalles.

## Review Focus
- ID antiguo o código alias: debe localizar la misma cuenta.
- ID inexistente o perfil no sincronizado: mostrar mensaje claro sin datos de otra persona.
- Cuenta sin solicitudes, beneficiarios o bancos: mostrar estados vacíos, sin fallar.
- Solicitud creada por UID o ID visible: vincularla al expediente correcto.
- Portada sin autenticar: observadores deben evitar escaneos y renderizados costosos.

---

### Task 1: Regression checks for expediente and performance

**Files:**
- Create: `tests/sendwayo-expediente-performance.test.cjs`
- Test: `tests/sendwayo-expediente-performance.test.cjs`

- [x] **Step 1: Write the failing checks** — assert exact label, request/bank association helpers, role restriction, incremental translation and reduced fallback intervals.
- [x] **Step 2: Confirm RED** — source inspection before implementation returned failures for all seven new behaviors.

### Task 2: Upgrade the existing ID investigation screen

**Files:**
- Modify: `SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html`
- Test: `tests/sendwayo-expediente-performance.test.cjs`

**Interfaces:**
- Consumes: `window.SENDWAYO_REQUESTS`, `window.SENDWAYO_BANKS`, `window.BENEFICIARIOS_DB`, `TRANSACCIONES`, account identity aliases.
- Produces: private admin navigation label `Expediente por ID`; read-only profile, financial summary, linked movement, request, beneficiary and bank tables.

- [ ] **Step 1: Restrict lookup subjects** — resolve exact ID/aliases for AGENTE or REMITENTE only.
- [ ] **Step 2: Add linked-data helpers** — `accountRequests(account,tokens)` and `bankRows(account,tokens)`.
- [ ] **Step 3: Render complete read-only expediente** — profile, balances/commissions, movements, requests, beneficiaries and bank accounts; redact sensitive keys from JSON details.
- [ ] **Step 4: Rename navigation and headings** — exact phrase `Expediente por ID`.
- [ ] **Step 5: Run static regression checks** — all assertions pass.

### Task 3: Reduce repeated work on page load

**Files:**
- Modify: `SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html`
- Test: `tests/sendwayo-expediente-performance.test.cjs`

- [ ] **Step 1: Make translation incremental** — translate only newly inserted element subtrees.
- [ ] **Step 2: Scope observers** — avoid table/UI/toolbar/nav scans on public landing; scan only added table/view subtrees.
- [ ] **Step 3: Reduce noncritical polling** — 2.5s storage fallback to 15s; 4s daily panel fallback to 30s; 5s badge fallback to 15s; keep Firebase realtime listeners and 5s financial reconciliation.
- [ ] **Step 4: Parallelize Firebase compat SDK downloads after app SDK** — Auth and Database scripts load concurrently.
- [ ] **Step 5: Run static regression checks and inspect final diff.**

### Task 4: Verification and handoff

- [ ] Fetch the updated branch file and confirm all expected source changes.
- [ ] Run the static test script against the updated source where execution is available.
- [ ] Confirm branch-only changes and that `main`/production were not modified.
- [ ] Report that browser/device testing is still required before publication; do not claim the page is fully performance-tested without it.
