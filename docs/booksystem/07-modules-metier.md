# Chapitre 07 — Modules métier

> **Résumé.** myBeez est conçu autour de modules métier toggleables par tenant
> via `tenants.modulesEnabled`. Sur 11 modules planifiés, 5 sont
> production-ready au 2026-05-08 : Checklist, Suppliers, Purchases (avec OCR
> + auto-match), Expenses, Files (en cours sur `feat/files-and-trash`).
> 6 restent à livrer dans les sprints 3-7. Pattern de référence : `purchases.ts`
> (route) + `PurchasesSection.tsx` (UI).

---

## 7.1 Vue d'ensemble

### 7.1.1 État au 2026-05-08

| # | Module | Schéma DB | API | UI | État |
|---|---|---|---|---|---|
| 1 | Checklist quotidienne | ✅ | ✅ | ✅ | **Production-ready** |
| 2 | Suppliers (Fournisseurs) | ✅ | ✅ | ✅ | **Production-ready** (PR #2) |
| 3 | Purchases (Achats) + OCR | ✅ | ✅ | ✅ | **Production-ready** (PRs #64/#65/#67) |
| 4 | Expenses (Dépenses générales) | ✅ | ✅ | ✅ | **Production-ready** (PR #66) |
| 5 | Files (Fichiers + corbeille TTL) | ✅ | 🟡 | 🟡 | **En cours** (`feat/files-and-trash`) |
| 6 | BankEntries | ✅ | ❌ | ❌ | Schémé, planifié Sprint 2 reliquat |
| 7 | CashEntries | ✅ | ❌ | ❌ | Schémé, planifié Sprint 2 reliquat (redesign en moyens-paiement génériques) |
| 8 | Employees | ✅ | ❌ | ❌ | Schémé, planifié Sprint 3 |
| 9 | Payroll | ✅ | ❌ | ❌ | Schémé, planifié Sprint 4 |
| 10 | Absences | ✅ | ❌ | ❌ | Schémé, planifié Sprint 4 |
| 11 | Analytics | ✅ | ❌ | ❌ | Schémé, planifié Sprint 6 |

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

## 7.6 Module Files (Fichiers) — en cours

Branche : `feat/files-and-trash`. PR #71 attendue.

### 7.6.1 Schéma

```ts
files(
  id, tenantId,
  fileName, originalName, mimeType, fileSize,
  category, fileType (default "file"),
  supplier, description, fileDate,
  storagePath, emailedTo[],
  createdAt
)

files_trash(
  id, tenantId, originalFileId,
  fileName, originalName, mimeType, fileSize,
  category, fileType, supplier, description, fileDate,
  storagePath, emailedTo[],
  deletedAt, expiresAt, originalCreatedAt
)
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

### 7.6.6 Hors scope V1

Reportés en V2 (cf. PR audit) :
- Send-email (envoyer un fichier par email).
- Parse-preview (OCR PDF/image pour extraire metadata).
- Side-effects automatiques vers expenses/purchases/payroll.

### 7.6.7 Statut au 2026-05-08

- ✅ Schéma `files` + `files_trash` mergé dans `feat/files-and-trash`.
- ✅ Routes API codées.
- ✅ Services storage + naming + trash.
- ⏳ UI (Section + dialog upload + table trash + actions restore/purge).
- ⏳ Tests d'intégration (multipart upload, trash expiry simulée).
- ⏳ Test manuel R2 (cred runtime).
- ⏳ Merge sur main.

---

## 7.7 Modules planifiés (Sprints 3-7)

### 7.7.1 Sprint 3 — Employees

`employees` schema déjà présent. À porter depuis ulysseclaude `hrRoutes.ts`,
adapté multi-tenant + RBAC + vertical-agnostic. Skip reparse PDF V1.

### 7.7.2 Sprint 4 — Payroll + Absences

`payroll` + `absences` schemas présents. Suit Employees.

### 7.7.3 Sprint 5 — déjà couvert par Files (anticipé en parallèle de Sprint 1-2)

### 7.7.4 Sprint 6 — Analytics

`analytics` schema présent. Porter depuis `ulysseclaude/suppliersAnalyticsRoutes.ts`,
**dégénériser TVA + catégories restaurant**. Périodes (jour/semaine/mois/année),
cumul par module (purchases + expenses), top suppliers, payment status mix.

### 7.7.5 Sprint 7 — History cross-module

Vue unifiée des dernières 1000 actions (achats, dépenses, fichiers, employees,
audit log). Filtres par module + période + user.

### 7.7.6 BankEntries / CashEntries

Schemas présents mais **redesign nécessaire** : ulysseclaude a un modèle
restaurant-spécifique (caisse/banque flat). myBeez doit modéliser des
**moyens de paiement génériques** (CB, espèces, virement, prélèvement, chèque)
avec lien vers purchases/expenses. NE PAS copier le modèle ulysseclaude tel
quel.

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
