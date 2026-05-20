# Chapitre 07 — Modules métier

> **Résumé.** myBeez est conçu autour de modules métier toggleables par tenant
> via `tenants.modulesEnabled`. **Les 12 modules planifiés sont livrés
> production-ready au 2026-05-12** (backend + UI). Pattern de référence :
> `purchases.ts` (route) + `PurchasesSection.tsx` (UI).
>
> **Module 13 — REV (cashback)** en cours d'absorption depuis `Projet-REV`
> (cf. [ADR 2026-05-20](./adr/2026-05-20-rev-absorption.md)). Sprint 1
> `feat/rev-schema` 2026-05-20 = **16 tables `rev_*` livrées** (schema only,
> cf. §5.1.5). API + UI Management + app cashback consommateur attendus
> Sprints 2-4.

---

## 7.1 Vue d'ensemble

### 7.1.1 État au 2026-05-09

| # | Module | Schéma DB | API | UI | État |
|---|---|---|---|---|---|
| 1 | Checklist quotidienne | ✅ | ✅ | ✅ | **Production-ready** |
| 2 | Suppliers (Fournisseurs) | ✅ | ✅ | ✅ | **Production-ready** (PR #2) |
| 3 | Purchases (Achats) + OCR | ✅ | ✅ | ✅ | **Production-ready** (PRs #64/#65/#67) |
| 4 | Expenses (Dépenses générales) | ✅ | ✅ | ✅ | **Production-ready** (PR #66) |
| 5 | Files (Fichiers + corbeille TTL + send-email-bulk V2) | ✅ | ✅ | ✅ | **Production-ready** (PR #71 backend + PR #78 UI + PR #79 hook V2) |
| 6 | Employees | ✅ | ✅ | ✅ | **Production-ready** (PR #72 backend + PR #76 UI) |
| 7 | Payroll | ✅ | ✅ | ✅ | **Production-ready** (PR #72 backend + PR #76 UI). Reste hooks `import-pdf` + `reparse-all` (Sprint 4 V2). |
| 8 | Absences | ✅ | ✅ | ✅ | **Production-ready** (PR #72 backend + PR #76 UI) |
| 9 | BankAccounts + BankEntries | ✅ | ✅ | ✅ | **Production-ready** (PR #83 backend + PR #90 UI) |
| 10 | CashEntries | ✅ | ✅ | ✅ | **Production-ready** (PR #83 backend + PR #90 UI) |
| 11 | Analytics | (compute) | ✅ | ✅ | **Production-ready** (PR #85 backend + PR #91 UI) |
| 12 | History cross-module | (audit_log compute) | ✅ | ✅ | **Production-ready** (PR #88 backend + PR #92 UI) |
| 13 | REV (cashback) | ✅ schema | ⏳ | ⏳ | **Schema livré** (Sprint 1, 16 tables `rev_*`, ADR 2026-05-20). API + UI Sprints 2-4. |

### 7.1.2 Pattern de livraison

Stratégie validée 2026-05-08 : **adaptation depuis ulysseclaude** (qui a du
tissu prod réel sur la plupart de ces modules), avec 4 garde-fous :

1. **Multi-tenant** : ajouter `tenantId integer notnull` + filtre Drizzle
   `where(eq(table.tenantId, tid))` à chaque requête.
2. **Auth nominative + RBAC** : pas de `isOwner || role === "approved"` flat.
   Matrice `READ_ROLES` / `WRITE_ROLES` par module.
3. **Vertical-agnostic** : pas de TVA hardcodée à 10%, pas de catégories
   restaurant. Paramètre via `business_templates.taxRules` +
   `tenants.modulesEnabled` + `tenants.vocabulary`.
4. **Migrations** : `db:push` source-of-truth, pas de tables créées par code
   runtime.

---

## 7.2 Module Checklist

### 7.2.1 Schéma

`shared/schema/checklist.ts` :
- `categories(id, tenantId, name, sheet, zone, sortOrder, createdAt)`
- `items(id, tenantId, categoryId, name, sortOrder, isActive, createdAt)`
- `checks(id, tenantId, itemId, checkDate, isChecked, checkedAt, note)`
- `futureItems(id, tenantId, itemId, targetDate, createdAt)`
- `comments(id, tenantId, author, message, createdAt)`
- `emailLogs(id, tenantId, sentAt, emailDate, itemCount, itemsList, success, error)`

### 7.2.2 Routes

`server/routes/checklist.ts`. Cf. [chapitre 03.2.7](./03-backend.md#327-checklistts--checklist-quotidienne).

### 7.2.3 UI

`client/src/pages/TenantChecklist.tsx` + composants internes (drag&drop tri,
toggle item, comments).

### 7.2.4 Realtime

Émet `checklist_updated` via SSE après chaque mutation (toggle, reset, items,
categories, comments). Cf. [03.5](./03-backend.md#35-realtime--sse).

### 7.2.5 Limitation connue

`GET /history` calcule `byDate[date].total = allItems.length` avec les items
**actifs aujourd'hui**, pas à la date X — biaise les pourcentages historiques
si la liste évolue. Tracé dette dans [09-roadmap-et-synthese.md](./09-roadmap-et-synthese.md).

---

## 7.3 Module Suppliers

### 7.3.1 Schéma

`suppliers(id, tenantId, name, shortName, siret, tvaNumber, accountNumber,
address, city, postalCode, phone, email, website, contactName, category,
paymentTerms, defaultPaymentMethod, bankIban, notes, isActive, createdAt)`.

### 7.3.2 Routes

`server/routes/management/suppliers.ts`. Pattern de référence pour les autres
modules CRUD.

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| GET | `/api/management/:slug/suppliers[?includeInactive=true]` | READ | Tri par nom asc |
| GET | `/api/management/:slug/suppliers/:id` | READ | |
| POST | `/api/management/:slug/suppliers` | owner/admin/manager | Zod strict |
| PATCH | `/api/management/:slug/suppliers/:id` | idem | |
| DELETE | `/api/management/:slug/suppliers/:id` | idem | Soft delete `isActive=false` |

### 7.3.3 UI

`client/src/components/management/sections/SuppliersSection.tsx` : table +
filtres + dialog création/édition.

---

## 7.4 Module Purchases (Achats)

PR #64 (module end-to-end) + PR #65 (OCR pre-fill) + PR #67 (PDF support +
auto-match supplier).

### 7.4.1 Schéma

```ts
purchases(
  id, tenantId, supplierId, supplierName,
  invoiceNumber, invoiceDate,
  totalHt, totalTtc, tvaRate (default 20), tvaAmount,
  paymentMethod, paymentStatus (default "pending"), paidDate, dueDate,
  category, description, notes,
  isActive (default true), createdAt
)
```

`paymentStatus` enum applicatif : `pending | paid | late | cancelled` (pas de
DB enum pour rester additif).

### 7.4.2 Routes

`server/routes/management/purchases.ts`.

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| GET | `/api/management/:slug/purchases` | READ | Filtres `from`, `to`, `supplierId`, `status`, `includeInactive` |
| GET | `/api/management/:slug/purchases/stats` | READ | Total HT/TTC, count par status, top suppliers |
| GET | `/api/management/:slug/purchases/:id` | READ | |
| POST | `/api/management/:slug/purchases` | WRITE | Enrichit `supplierName` depuis `suppliers` si `supplierId` fourni |
| PATCH | `/api/management/:slug/purchases/:id` | WRITE | |
| DELETE | `/api/management/:slug/purchases/:id` | WRITE | Soft-delete |
| POST | `/api/management/:slug/purchases/parse-invoice` | WRITE | OCR + auto-match |

### 7.4.3 OCR / parse-invoice

Cf. [chapitre 03.7](./03-backend.md#37-ocr--parsing-factures).

Flow :
1. Upload image (JPEG/PNG/WebP) ou PDF, base64.
2. Vision API (OpenAI gpt-4o-mini) extrait les champs.
3. `matchSupplierByName()` propose un `supplierId`.
4. Frontend pré-remplit le formulaire.
5. User ajuste, confirme → POST classique.

### 7.4.4 UI

`client/src/components/management/sections/PurchasesSection.tsx` :
- Table avec filtres (date range, supplier, status).
- Stats cards (total, en attente, payé, en retard).
- Dialog création/édition.
- Bouton « Importer une facture » → upload + OCR + pré-remplissage.

### 7.4.5 Soft-delete

`DELETE` flippe `isActive = false`. La row reste en DB pour traçabilité comptable
+ audit. Un `PATCH isActive: true` la réactive.

### 7.4.6 Snapshot `supplierName`

Si `supplierId` fourni, le serveur copie `suppliers.name` dans `supplierName`
au moment de la création/édition. La trace texte reste lisible même si le
fournisseur est archivé/renommé plus tard. Pattern adapté de
`ulysseclaude/financialRoutes.ts`.

---

## 7.5 Module Expenses (Dépenses générales)

PR #66.

### 7.5.1 Schéma

```ts
generalExpenses(
  id, tenantId,
  category, description, amount, date,
  paymentMethod,
  isRecurring, recurringFrequency,
  notes, supplierId (optional), taxAmount, dueDate, invoiceNumber, period,
  paymentStatus (default "pending"), paidDate,
  isActive (default true)
)
```

`paymentStatus` aligné sur `purchases.paymentStatus` pour pouvoir agréger les
deux dans la trésorerie côté analytics.

### 7.5.2 Différences avec Purchases

| Aspect | Purchases | Expenses |
|---|---|---|
| Cas d'usage | Facture fournisseur (alimentaire, matières) | Charge fixe (URSSAF, EDF, assurance, péages) |
| `supplierId` | Souvent renseigné | Optionnel (beaucoup de charges sans fournisseur formel) |
| `isRecurring` | ❌ | ✅ avec `recurringFrequency` (monthly/quarterly/yearly) + `period` (YYYY-MM ou YYYY) |
| Date | `invoiceDate` (date facture) | `date` (date d'engagement) |
| `dueDate` | Optionnel | Important (échéance) |

### 7.5.3 Routes

`server/routes/management/expenses.ts`.

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| GET | `/api/management/:slug/expenses` | READ | Filtres `from`, `to`, `supplierId`, `status`, `recurringOnly`, `includeInactive` |
| GET | `/api/management/:slug/expenses/stats` | READ | |
| GET | `/api/management/:slug/expenses/:id` | READ | |
| POST | `/api/management/:slug/expenses` | WRITE | |
| PATCH | `/api/management/:slug/expenses/:id` | WRITE | |
| DELETE | `/api/management/:slug/expenses/:id` | WRITE | Soft-delete |

### 7.5.4 UI

`client/src/components/management/sections/ExpensesSection.tsx`. Pattern
miroir de PurchasesSection. Recyclage 80% des composants `sharedUI/`.

---

## 7.6 Module Files (Fichiers)

PR #71 (backend) + PR #78 (UI section + corbeille — recovery du commit
orphelin `16b44d1` d'une session parallèle) + PR #79 (hook V2 send-email-bulk).

### 7.6.1 Schéma

```ts
files(
  id, tenantId,
  fileName, originalName, mimeType, fileSize,
  category, fileType (default "file"),
  supplier, description, fileDate,
  storagePath, emailedTo[],
  employeeId,           // FK logique vers employees.id (PR #72) — Documents RH
  createdAt
)
// Index: tenant_id, employee_id

files_trash(
  id, tenantId, originalFileId,
  fileName, originalName, mimeType, fileSize,
  category, fileType, supplier, description, fileDate,
  storagePath, emailedTo[],
  deletedAt, expiresAt, originalCreatedAt
)
// Index: tenant_id, expires_at
```

### 7.6.2 Modélisation corbeille

Plutôt que d'ajouter `deletedAt` sur `files`, une **table miroir** `files_trash`
isole les rows supprimées. Avantages :
- Hot-path (`SELECT FROM files WHERE tenant_id = ?`) reste sans filtre
  `deleted_at IS NULL`.
- Trash list query reste cheap (`files_trash` est petite et balayée par
  `expires_at`).

### 7.6.3 TTL

7 jours par défaut (`TRASH_TTL_MS` dans `services/files/trashService.ts`).
Au-delà → purge auto (cron tick interne, démarré par `scheduleTrashPurge()`
au boot).

### 7.6.4 Routes

`server/routes/management/files.ts`.

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| GET | `/api/management/:slug/files` | READ | Filtres `category`, `search` (ilike sur originalName/description/supplier) |
| POST | `/api/management/:slug/files` | WRITE | Multipart, max 50 MB, multer memory storage |
| GET | `/api/management/:slug/files/:id/download` | READ | Stream binary depuis R2 |
| DELETE | `/api/management/:slug/files/:id` | WRITE | Soft → `files_trash`, expire à +7j |
| GET | `/api/management/:slug/files/trash` | READ | Liste des rows trash actives |
| POST | `/api/management/:slug/files/trash/:id/restore` | WRITE | Restore si non-expiré (410 si expiré) |
| DELETE | `/api/management/:slug/files/trash/:id` | WRITE | Hard-delete (R2 + DB) |

### 7.6.5 Storage R2

Services :
- `services/files/naming.ts` : `sanitiseFileName()`, `buildStoredName()`,
  `buildStorageKey()`. Format clé : `tenants/{tenantId}/files/{uuid}-{slug}.{ext}`.
- `services/files/storage.ts` : `uploadFileToStorage(buffer, key, mimeType)`,
  `downloadFileFromStorage(key)`, `deleteFileFromStorage(key)`. Wrapper sur le
  client S3 vers R2 (réutilise `scripts/_lib/r2.ts`).

### 7.6.6 V2 livré + reste

✅ V2 **send-email-bulk** (PR #79) : `POST /api/management/:slug/files/send-email-bulk`
   `{to, fileIds[], subject?, message?}` → Resend N pièces jointes (cap 25 MB
   total) + append `to` dans `files.emailedTo[]` via `array_append` SQL +
   audit log `files.emailed`. Couvre aussi le single-file via `fileIds: [N]`
   (pas de route dédiée `/:id/send-email` ajoutée pour garder la surface
   d'API minimale). Plomberie réutilisable :
   - `mailService.sendDocumentBundle(...)` + builder pur `buildDocumentBundleEmail(...)`
   - `mailService.SendArgs.attachments?: {filename, content: Buffer}[]`
   - `storage.downloadFileBufferFromStorage(key)` (collecte un stream R2 en buffer).

⏳ Reste V2 / V3 :
- Parse-preview (OCR PDF/image pour extraire metadata).
- Side-effects automatiques vers expenses/purchases/payroll.

### 7.6.7 Statut au 2026-05-09

- ✅ Schéma `files` + `files_trash` (PR #71).
- ✅ Routes API CRUD V1 (7 endpoints upload / list / download / soft-delete /
  trash / restore / hard-delete).
- ✅ Hook V2 `send-email-bulk` (PR #79).
- ✅ Services storage + naming + trash + buffer download.
- ✅ UI section + corbeille (PR #78 — recovery du commit orphelin `16b44d1`
  d'une session parallèle).
- ✅ Tests purs naming + trashService (21 tests).
- ⏳ Hooks restants : `parse-preview`, side-effects auto vers
  expenses/purchases (PR follow-up).

---

## 7.7 Module RH — Employees + Payroll + Absences

PR #72 backend + PR #76 UI (Sprint 4 V2). Page Gestion RH : liste employés
(stats header + table + filtres période + recherche) + détail employé
collapsible (sections Documents RH / Absences & Congés / Fiches de Paie).

### 7.7.1 Schémas

```ts
employees(
  id, tenantId, firstName, lastName, position,
  contractType (default "CDI"),
  startDate, endDate, phone, email,
  socialSecurityNumber,    // matching PDF bulletin
  salary, hourlyRate, weeklyHours (default 35),
  notes, isActive, createdAt
)
// Index: tenant_id

payroll(
  id, tenantId, employeeId,
  month,                   // YYYY-MM
  grossSalary, netSalary, socialCharges,
  employerCharges, totalEmployerCost,
  bonuses, overtime, deductions,
  status (default "draft"), isPaid, paidDate, paidAt,
  pdfFileId,               // FK files.id archive bulletin
  notes, createdAt
)
// Index: tenant_id, employee_id, UNIQUE(tenant_id, employee_id, month)

absences(
  id, tenantId, employeeId,
  type,                    // conge | maladie | retard | absence | formation
  startDate, endDate, duration,
  reason, notes,
  status (default "pending"), isApproved (default false),
  createdAt
)
// Index: tenant_id, employee_id
```

### 7.7.2 Routes

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| GET | `/api/management/:slug/employees/summary` | READ | Stats dashboard RH (effectif, masse salariale, alertes, totaux période) |
| GET | `/api/management/:slug/employees` | READ | `?activeOnly=true` |
| GET / POST / PATCH / DELETE | `/api/management/:slug/employees/:id` | RBAC matrice | DELETE = soft `isActive=false` |
| GET | `/api/management/:slug/payroll` | READ | `?period=YYYY-MM&employeeId=N` |
| POST / PATCH / DELETE | `/api/management/:slug/payroll/:id` | WRITE | POST 409 si duplicate `(employee, month)` |
| GET | `/api/management/:slug/absences` | READ | `?employeeId=N&from=&to=` |
| POST / PATCH / DELETE | `/api/management/:slug/absences/:id` | WRITE | `type` enum validé |

### 7.7.3 Helpers purs

**`server/services/hr/employeeMatching.ts`** — `matchEmployee(parsed, candidates)` 3-tiers :
1. SSN exact (whitespace normalisé)
2. Nom complet exact + permutation (les bulletins inversent parfois first/last)
3. Fuzzy (substring, min 3 chars pour éviter "Le"/"De" qui matchent tout)

Normalisation NFD + strip diacritics : "Lefevre" matche "Lefèvre" (OCR drop
souvent les accents). Sera consommé par le V2 `import-PDF`.

**`server/services/hr/payrollSummary.ts`** — `computePayrollSummary(emps, payrolls, absences, employerChargeRate?)` :
agrégats du dashboard RH (effectif actif, masse salariale, totaux brut/net/charges,
estimation charges patronales avec flag `hasEstimatedEmployerCharges`, ratio
social, moyenne brut, alertes pending absences). Estimation default 13% des
charges patronales si la PDF n'a pas extrait, paramétrable via
`tenant.taxRules.employerChargeRate`.

### 7.7.4 V2 livré + reste

✅ UI page RH (consommatrice de `/summary` + listes) — PR #76.
✅ `send-email-bulk` fiches : utilise directement le hook files V2
   `POST /files/send-email-bulk` avec `fileIds: [pdfFileId, ...]` (PR #79).
✅ Hooks payroll OCR (PR #81) :
- `POST /api/management/:slug/payroll/import-pdf` body
  `{ pdfBase64, originalName, mimeType, autoCreateEmployee? }` — sync,
  Vision API (image via OpenAI/Gemini/Grok, PDF via Gemini natif),
  consomme `matchEmployee()` 3-tiers, upload R2 + insert `files`
  (category=rh, fileType=bulletin_paie) + insert `payroll` en
  transaction. Pré-check duplicate `(employee, month)` → 409 explicite.
  Auto-create employee opt-in (default false). Réponse 201 avec
  `{ payroll, file, employeeId, createdEmployee, parsed: { fields,
  provider, matchTier }, warnings }`.
- `POST /api/management/:slug/payroll/reparse-all` body
  `{ autoCreateEmployee?, employeeId? }` — itère les `files`
  `category=rh + fileType=bulletin_paie` non liés à un payroll, cap 50
  par run, télécharge le buffer R2, parse, match, insert payroll +
  backfill `files.employeeId`. Réponse `{ scanned, created, errored,
  errors[], remaining: 'more'|'none' }`.

Choix de design :
- **Pas de `pdf-parse`** : Vision API gère uniformément photo / PDF
  scanné / PDF natif. `pdf-parse` n'aurait fonctionné que sur PDF
  numérique propre.
- **Sync** (pas de job queue) : volumétrie cible < 10 bulletins/mois
  par tenant. Si le run timeout en prod, on passe à un job plus tard.
  Le batch-cap 50 sur `reparse-all` borne la durée.
- **Conflit `(employee, month)`** = 409 explicite, l'utilisateur
  tranche (delete + re-import). Pas d'écrasement implicite.
- **Helpers purs** dans `services/payroll/payrollImport.ts`
  (`payslipImportEligibility`, `buildPayrollValues`,
  `buildEmployeeValues`, `summarizeImportWarnings`) : testables sans
  DB ni provider IA.

⏳ Reste V2 hors-scope payroll OCR :
- Auto-création employee depuis `POST /payroll` (création manuelle
  d'une fiche sans passer par l'OCR). Le helper `buildEmployeeValues`
  est réutilisable.
- UI : bouton « Importer un bulletin PDF » côté `EmployeesSection`
  qui appelle `/import-pdf` + bouton « Re-traiter les bulletins
  archivés » qui appelle `/reparse-all`.

---

## 7.8 Modules planifiés (Sprints 5-7)

### 7.8.1 Sprint 5 — Bank / Cash (PR #83 backend + PR #90 UI — bouclé)

**Livré (PR #83)** :

3 nouvelles tables dans `shared/schema/finance.ts` (séparées du `checklist.ts` qui regroupe les modules antérieurs) :

- `bank_accounts(name, bankName, iban, openingBalance, notes, isActive)` — un compte bancaire suivi par tenant. Multi-comptes supportés (Compte Pro CIC + Livret + Compte Perso). Soft-delete.
- `bank_entries_v2(bankAccountId, entryDate, label, amount [SIGNÉ], balance, category, reference, isReconciled, purchaseId?, expenseId?, payrollId?, notes)` — opérations bancaires. Amount **signé** (négatif=débit) pour matcher les exports CSV bancaires et permettre `SUM(amount)` direct. FK logiques optionnelles vers `purchases`/`generalExpenses`/`payroll` pour rapprochement.
- `cash_entries_v2(entryDate, kind ['in'|'out'], amount [POSITIF], label, category, reference, notes)` — saisie manuelle des espèces. Générique : pas de colonnes resto-spécifiques (cb/ticketResto/deliveroo). Si un vertical a besoin d'OCR ticket Z, ce sera une table dédiée plus tard.

**Routes livrées** (cf. [03.2.9](./03-backend.md#329-management--modules-métier)) :

- `/bank-accounts` CRUD + detail avec `currentBalance` calculé
- `/bank-entries` CRUD + `/stats` (credits/debits/net/reconciledRate) + `/unreconciled`
- `/cash-entries` CRUD + `/stats` (in/out/net)

**Helpers purs** dans `services/finance/financeSummary.ts` :
`computeBankAccountBalance`, `computeBankStats`, `computeCashStats`. Round-to-cent. Tests dans `services/finance/__tests__/`.

**Choix de design** :

- **2 tables séparées (bank vs cash)** plutôt qu'un `payments` unifié : suguval ulysseclaude tourne avec cette séparation en prod et c'est sain. Bank = transactions tracées par tiers, signées, rapprochables ; cash = saisies manuelles d'espèces hors banque.
- **`bank_accounts` table dédiée** (vs suguval qui avait juste `bankName text`) — un client multi-comptes a une UX propre.
- **Cash générique** — pas de colonnes restaurant hardcodées. Z-ticket parser resto = future feature vertical-spécifique.
- **Hard-delete** sur les entries (vs soft sur purchases/suppliers) — une opération erronée doit disparaître ; l'audit_log garde la trace.
- **SQL `_v2`** sur les nouvelles tables : les anciennes `bank_entries` / `cash_entries` (vides en prod, jamais consommées) ont été dropées via script SQL manuel le 2026-05-19 (PR #96, `scripts/migrations/2026-05-19-drop-legacy.sql`). Les déclarations `legacyBankEntries`/`legacyCashEntries` côté TS ont été retirées dans la même PR.

✅ **UI livrée (PR #90)** : `BankSection.tsx` (tabs Comptes/Opérations) + `CashSection.tsx` côté `client/src/components/management/sections/`. Stats cards header (solde par compte, encaissements / décaissements période + reconciledRate sur opérations). Filtres date / account / category / reconciled / kind. CRUD complet.

**Hors scope V1** (Phase 2) :
- Bouton « Rapprocher » sur une bank entry → matching auto/manuel avec un purchase/expense de période proche (UI side actuellement, FK logique en place).
- Import CSV de relevés bancaires (cf. ulysseclaude `bankStatementParser.ts` + `bankStatementImportService.ts` — code de qualité, à porter quand le besoin sera concret).
- OCR de ticket Z resto.
- Table `loans` (emprunts/crédits — utile pour amortissements analytics).

### 7.8.2 Sprint 6 — Analytics (PR #85 backend + PR #91 UI — bouclé)

**Livré (PR #85)** :

3 endpoints `/api/management/:slug/analytics/*` + helpers purs
`services/analytics/analyticsSummary.ts` :

- `GET /analytics/dashboard?from=&to=&topSuppliersLimit=` (default = mois courant)
  - **purchases** : totalTtc, totalHt, count, byStatus, topSuppliers (topN)
  - **expenses** : total, count, byStatus
  - **payroll** : gross, net, employerCost (totalEmployerCost si présent, sinon gross+employerCharges)
  - **bank** : credits, debits (absolu), netDelta (signé)
  - **cash** : totalIn, totalOut, net

- `GET /analytics/monthly?from=YYYY-MM&to=YYYY-MM&months=N` (default = 12 derniers mois inclusif)
  - série mensuelle continue (mois sans data = 0) : purchases, expenses, payrollEmployerCost, bankCredits/Debits, cashIn/Out

- `GET /analytics/tva?from=&to=`
  - **deductible** : sum tvaAmount (purchases) + taxAmount (expenses)
  - **collected** : `null` + `collectedReason` — pas de table revenue générique chez myBeez en V1, ajouter Phase 2

**Helpers purs** consommables aussi par d'autres modules :
- `monthsInRange(from, to)` — liste YYYY-MM inclusive
- `bucketMonth(value)` — tronque YYYY-MM-DD → YYYY-MM, valide la sémantique mois
- `sumField(rows, getter)` — somme défensive (skip NaN/Infinity/null)
- `bucketSumByMonth(rows, getDate, getAmount)` — bucket-then-sum
- `topByGroup(rows, groupBy, sumBy, limit)` — top N stable (sort total desc, key asc en tie)
- `countByGroup(rows, groupBy)` — récap categorique (status mix)

**Choix de design vs ulysseclaude `suppliersAnalyticsRoutes.ts`** :

- **Vertical-agnostic** : pas de hardcode resto (`alimentaire`/`boissons`/`emballages`), pas de TVA 10% en dur, pas de food cost % / ratios resto-spécifiques.
- **Pas de "CA"** : ulysseclaude calcule le CA depuis `suguCashRegister.totalRevenue` (clôture Z resto). myBeez n'a pas de table revenue générique en V1, donc :
  - pas d'endpoint `/analytics/ratios` (food cost %, payroll %, marge brute)
  - pas d'endpoint `/analytics/tresorerie` (projection 3 mois)
  - TVA collectée = `null` documenté, pas un `0` trompeur
- **Compute on-demand** plutôt que cache snapshot : volumes attendus < 12 mois × few thousand rows ⇒ <100ms. Table `analytics` reste libre pour Phase 2 si signal perf concret.

✅ **UI livrée (PR #91)** : `AnalyticsSection.tsx` (sélecteur période presets + custom, 5 StatCards purchases/expenses/payroll/banque/caisse, top fournisseurs bar list, payment status mix, série mensuelle 12 mois en barres CSS — pas de lib charts externe, TVA déductible + disclaimer collectée=null).

**Hors scope V1** (Phase 2) :
- Module Revenue générique pour débloquer la TVA collectée + ratios CA-based (food cost %, marge brute, masse salariale %).
- CSV export expert-comptable (port pattern ulysseclaude `/analytics/export-comptable` si demandé).

### 7.8.3 Sprint 7 — History cross-module (PR #88 backend + PR #92 UI — bouclé, 12/12 modules atteint)

**Livré (PR #88)** :

Endpoint `GET /api/management/:slug/history` qui retourne un flux unifié
des rows `audit_log` du tenant, décorées pour la UI :

- **Source** : 100% `audit_log`. Tous les modules existants écrivent déjà
  via `recordAudit({event, metadata, ...})` — donc **pas de nouvelle
  table, pas de duplication**. Le `history` est juste une vue
  spécialisée sur le log d'audit déjà en place.

- **Filtres** :
  - `module=purchases|expenses|files|payroll|...` → `event LIKE 'module.%'`
  - `action=created|updated|...` → match middle segment via SQL `LIKE`
  - `from=YYYY-MM-DD&to=YYYY-MM-DD` → range `created_at` (bornes inclusives, début/fin de jour UTC)
  - `userId=N` → filtre par acteur
  - `limit` 1..200 (default 50), `offset` 0..100k

- **Réponse** :
  ```json
  {
    "items": [{
      "id", "createdAt", "event",
      "module": "purchases", "action": "created", "outcome": null,
      "label": "Achat créé",                 // décoré FR via MODULE_LABELS + ACTION_LABELS
      "userId", "tenantId", "metadata",
      "ipAddress", "userAgent",
      "entityType": "purchase", "entityId": 42   // pour deep-link UI (null si module sans entity)
    }],
    "total", "limit", "offset", "hasMore"
  }
  ```

- **Helpers purs** dans `services/history/historyDecorator.ts`
  (`parseEvent`, `buildLabel`, `extractEntityRef`, `decorateRow`,
  `MODULE_LABELS`, `ACTION_LABELS`, `FILTERABLE_MODULES`). 22 tests
  unitaires (decorator + label + entity ref + fallback gracieux sur
  events legacy malformés).

- **Cardinalité / coût** : `count(*)` pour `total` peut devenir coûteux
  sur un audit_log de plusieurs millions. V1 vit avec, bascule cursor-
  based si signal perf concret (l'index `audit_log_tenant_id_idx`
  + `audit_log_created_at_idx` couvrent déjà 95% des cas).

**Choix de design** :

- **Pas de nouvelle table `history`** : audit_log est déjà la source de
  vérité de tous les writes sensibles, dupliquer serait du gâchis et
  ouvrirait un risque de drift entre les deux.
- **Décoration côté serveur** plutôt que côté UI : le mapping
  `event → label FR` est connaissance back (les conventions
  `domain.action.outcome` sont propres à `recordAudit`). Évite que
  la UI reimplemente cette logique, et permet de la tester sans front.
- **Fallback gracieux** sur les events malformés ou inconnus : la
  history endpoint ne doit jamais 500 sur un event legacy bizarre,
  même si la décoration tombe à `module=unknown, label=<raw event>`.
- **`entityType + entityId` extracts** : permet à la UI de générer un
  deep-link `/management/purchases/42` sans connaître la structure des
  metadata par module. Whitelist explicite par module — un mauvais
  mapping serait pire qu'un manquant.

✅ **UI livrée (PR #92)** : `HistorySection.tsx` (table + filtres module / action / date range / userId + pagination offset 50/page). Ligne expandable (metadata JSON inline). Deep-link vers la section management de l'entité touchée (purchase / expense / payroll / …). `TenantHistory.tsx` devient un simple wrapper TenantAppShell. **Boucle officiellement les 12/12 modules production-ready.**

**Hors scope V1** (Phase 2) :
- Si volume audit_log > qq millions de rows → cursor-based pagination (`?cursor=...&limit=...` au lieu de `?offset=...`).
- Si signal d'usage → export CSV pour expert-comptable.

---

## 7.8 Modules ulysseclaude à NE PAS porter

- `HubriseOrders` (POS resto pur, hors scope myBeez)
- `suguAnalytics-AI` / `suguLearning` / `suguProactive` (couches IA spécifiques)
- `ChecklistTab` (myBeez a sa propre checklist plus simple)

---

## 7.9 Patterns réutilisables (or pur d'ulysseclaude)

À consulter quand on attaque un nouveau module :

| Source ulysseclaude | Réutiliser quoi |
|---|---|
| `client/src/pages/suguval/AchatsTab.tsx` (~700 lignes) | Filtres + tri + pagination + bulk + CSV + preview en un fichier |
| `client/src/pages/suguval/shared.tsx` | Design system local (Card, StatCard, FormModal, PeriodFilter, etc.) — **déjà porté** dans `client/src/components/management/sharedUI/` |
| `server/api/v2/suguManagement/index.ts` | 7 sous-routers modulaires (financialRoutes, hrRoutes, etc.) — myBeez clone ce découpage dans `server/routes/management/*` |
| `shared/schema/sugu.ts` | Catalogue de champs métier validés (SIRET, TVA, IBAN, payment terms, soft-delete) |

---

## 7.10 Anti-modèles à éviter

- **Fallback raw SQL** après échec Drizzle (cache schema-mismatch).
- **Tables créées par code runtime** (`CREATE TABLE IF NOT EXISTS` dans le
  service) — régression migrations.
- **Auth flat** sans tenant scope (`isOwner || role === "approved"`).
- **TVA / catégories restaurant hardcodées** (purger via
  `business_templates.taxRules` + per-tenant overrides).
- **Snapshot par valeur sans soft-delete** (perd la trace si suppression).

---

*Suite du livre → [08-ops-et-deploiement.md](./08-ops-et-deploiement.md)*
