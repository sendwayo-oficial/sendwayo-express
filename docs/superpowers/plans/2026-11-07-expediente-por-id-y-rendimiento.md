# Expediente por ID y fluidez de la interfaz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar el «Expediente por ID», la navegación y la identidad en una sola cabecera superior a todo el ancho, y reducir trabajo repetitivo en la portada y la interfaz.

**Architecture:** Reutilizar el HTML V7 y sus datos Firebase ya sincronizados. Extender la consulta de solo lectura para incluir solicitudes y cuentas bancarias asociadas. Ubicar la marca y la identidad de sesión en una barra superior única; convertir el menú en un panel superpuesto que no reserve ancho. Los observadores visuales trabajan incrementalmente o solo después de autenticar.

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
- Produces: private admin navigation label `Expediente por ID`; existing read-only profile, financial summary, movement and beneficiary tables, extended by a scoped enhancer for requests and linked bank accounts.

- [x] **Step 1: Restrict lookup subjects** — resolve exact ID/aliases for AGENTE or REMITENTE only.
- [x] **Step 2: Add linked-data helpers** — `accountRequests(account,tokens)` and `bankRows(account,tokens)`.
- [x] **Step 3: Render complete read-only expediente** — profile, balances/commissions, movements, requests, beneficiaries and bank accounts; redact sensitive keys from JSON details.
- [x] **Step 4: Rename navigation and headings** — exact phrase `Expediente por ID`.
- [x] **Step 5: Run static regression checks** — all assertions pass.

### Task 3: Reduce repeated work on page load

**Files:**
- Modify: `SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html`
- Test: `tests/sendwayo-expediente-performance.test.cjs`

- [x] **Step 1: Make translation incremental** — translate only newly inserted element subtrees.
- [x] **Step 2: Scope observers** — avoid table/UI/toolbar/nav scans on public landing; scan only added table/view subtrees.
- [x] **Step 3: Reduce noncritical polling** — 2.5s storage fallback to 15s; 4s daily panel fallback to 30s; 5s badge fallback to 15s; keep Firebase realtime listeners and 5s financial reconciliation.
- [x] **Step 4: Parallelize Firebase compat SDK downloads after app SDK** — Auth and Database scripts load concurrently.
- [x] **Step 5: Run static regression checks and inspect final diff.**

### Task 4: Verification and handoff

- [x] Fetch the updated branch file and confirm all expected source changes.
- [x] Execute the test assertions against the fetched branch source in the verification harness; all assertions passed. The standalone Node command was not run in a local checkout.
- [x] Compare `main` with the development branch; the branch is ahead and not behind. `main` and production were not changed.
- [x] Record that real browser/device testing is still required before publication; do not claim the page is fully performance-tested without it.


## Verification record

- All static assertions in `tests/sendwayo-expediente-performance.test.cjs` were executed against the freshly fetched branch HTML and passed.
- All inline JavaScript blocks in the HTML were compiled with `new Function`; 0 syntax errors.
- No browser/Playwright tool is connected in this session, so sign-in, ID lookup with real Firebase records, desktop/mobile rendering and measured load time remain unverified.
- Final review: self-review (no subagent tool available). Production publication intentionally deferred.


### Task 5: Full-width top header and overlay navigation

**Files:**
- Modify: `SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html`
- Test: `tests/sendwayo-expediente-performance.test.cjs`

- [x] Write layout assertions first and confirm RED.
- [x] Put SENDWAYO EXPRESS, active account name/role, visible ID, code, date/time and session duration in one full-width top region.
- [x] Move the hamburger/menu trigger into the top brand row.
- [x] Convert the left navigation into an off-canvas overlay; it does not reserve a persistent page column.
- [x] Hide duplicate business/account identity from the navigation panel.
- [x] Run all static assertions and parse inline scripts.

### Task 6: Receipt integrity

**Files:**
- Modify: `SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html`
- Test: `tests/sendwayo-expediente-performance.test.cjs`

- [x] Add RED assertions prohibiting a fabricated receipt when the transaction ID is absent.
- [x] Remove the fallback sample transaction and require a real matching transaction before displaying a receipt.
- [x] Keep PNG sharing on the existing `sendwayoShareReceipt` flow.
- [x] Re-run all checks.

### Task 7: Consolidate the morning work and correct the inventory

- [x] Review the morning commit history for ID/code management, user management, Firebase registration approvals, international routes/beneficiaries, investigation and PDF export fixes.
- [x] Add `docs/ESTADO-INTEGRAL-SENDWAYO-V7.md` as the single inventory of carried-forward requirements, code evidence, external blockers and testing needed.
- [x] Correct the old payments plan: the bundled country catalogue is 250 ISO alfa-2 entries, not 43; phone validation by country remains to be tested.
- [x] Keep external payments blocked pending AZUL affiliation/credentials and a contracted MonCash/NatCash disbursement provider.

## Additional verification record

- Current regression test assertions include the top-only layout and receipt integrity; all were executed against freshly fetched branch content.
- Current HTML includes 250 unique country/territory ISO alpha-2 records in local data.
- A legacy receipt fallback had generated a fictitious approved transaction when an ID was missing; it was removed. An unknown transaction ID now returns an error instead of showing a fabricated receipt.
- Remaining: real browser tests and full financial lifecycle tests. These are release gates, not presumed results.
