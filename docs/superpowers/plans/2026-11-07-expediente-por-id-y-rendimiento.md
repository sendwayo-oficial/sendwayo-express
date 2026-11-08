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
- Expediente solo para ADMIN y solo remitentes/agentes como sujetos de consulta; buscar exclusivamente ID actual/anterior/alias de ID.
- New-agent creation uses the exact prefix/sequence `AGE400I1` through `AGE400I9`; the I is a letter, not a digit. Existing agent IDs remain unchanged.
- No exponer credenciales, tokens ni secretos en los detalles.

## Review Focus
- ID antiguo o alias histórico de ID: debe localizar la misma cuenta; códigos comerciales, correo y teléfono no son claves de búsqueda.
- ID inexistente o perfil no sincronizado: mostrar mensaje claro sin datos de otra persona.
- Cuenta sin solicitudes, beneficiarios o bancos: mostrar estados vacíos, sin fallar.
- Agent ID generation: new accounts start at `AGE400I1` and preserve existing profile IDs without automatic migration.
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
- Deliver: `SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html`
- Test: `tests/sendwayo-expediente-performance.test.cjs`

**Interfaces:**
- Consumes: already synchronized Firebase arrays `window.SENDWAYO_REQUESTS`, `window.SENDWAYO_BANKS`, `window.BENEFICIARIOS_DB`, `TRANSACCIONES`, and visible ID/código aliases.
- Produces: admin-only, read-only Expediente por ID; existing profile/balances/commissions/movement/beneficiary tables extended by a scoped enhancer that links requests and bank accounts using owner/creator identifiers.

- [x] **Step 1: Restrict lookup subjects** — resolve exact ID/aliases for AGENTE or REMITENTE only.
- [x] **Step 2: Add linked-data helpers** — `accountRequests(account,tokens)` and `bankRows(account,tokens)`.
- [x] **Step 3: Render complete read-only expediente** — profile, balances/commissions, movements, requests, beneficiaries and bank accounts; redact sensitive keys from JSON details.
- [x] **Step 4: Rename navigation and headings** — exact phrase `Expediente por ID`.
- [x] **Step 5: Run static regression checks** — all assertions pass.

### Task 3: Reduce repeated work on page load

**Files:**
- Modify: `SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html`
- Deliver: `SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html`
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


### Task 8: Consolidated V7 delivery and full static verification

**Files:**
- Deliver: `SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html`
- Test: `tests/sendwayo-top-header-layout.test.cjs`
- Test: `tests/sendwayo-workspace-header.test.cjs`
- Test: `tests/sendwayo-expediente-performance.test.cjs`
- Test: `tests/sendwayo-countries.test.cjs`
- Document: `docs/SENDWAYO-CONSOLIDADO-REQUISITOS-Y-ESTADO-2026-11-07.md`
- Document: `docs/ESTADO-INTEGRAL-SENDWAYO-V7.md`

- [x] Copy the complete updated source HTML into the agreed V7 delivery filename on the development branch.
- [x] Point every static test at the V7 delivery file rather than the old V118 filename.
- [x] Recover the morning work inventory and commit evidence in the integral V7 status document.
- [x] Consolidate all operating, financial, role, international-country, payment and release requirements in the single requirements/status document.
- [x] Run the four test scripts against the fetched V7 candidate: header layout 18 assertions; workspace header 23; expediente/performance 40; countries 12.
- [x] Compile all 43 inline JavaScript blocks: 0 syntax errors. A duplicated menu backdrop declaration was found, recorded as a failing regression assertion, corrected, and re-run successfully.
- [x] Compare development branch with main; development is ahead and not behind. No merge, Pages deploy or Firebase production mutation.
- [ ] Real-browser functional and visual test on desktop and mobile, including Firebase sign-in, route switching, menu open/close, 40-minute idle lock and actual measured page-load performance. This remains a release gate; no browser session was available to load the repo copy during this pass.

## Final review

- Self-review performed because no independent reviewer/subagent execution tool is available in this session.
- Critical known gaps: browser/device validation and full financial lifecycle tests have not been performed; card/acquiring and payout providers are not connected because onboarding/credentials are still missing.
- Do not publish or merge until the release gates above are satisfied and the owner authorizes publication.


## Additional current-turn implementation record

- The top header is fixed at full width with SENDWAYO EXPRESS branding in the first row and active profile/ID/code/clock in the second row. The navigation panel is moved to `document.body` as a full-width overlay so it does not allocate a permanent left column.
- Restored Firebase sessions now validate profile, role and agent mapping, show the workspace, then load the directory, beneficiaries, notifications and operations in the background. Refresh no longer deletes the last-activity timestamp.
- The exact new-agent series is `AGE400I1` to `AGE400I9`; letter I is preserved. Existing profile IDs are not renumbered. New remitter IDs remain `REM` plus five digits.
- The legacy Expediente renderer and its new overlay both search by ID current/previous/ID alias only; code, email and phone are excluded.
- Static suite currently includes header, session, ID-only and ID-sequence checks; real browser testing is still pending.
