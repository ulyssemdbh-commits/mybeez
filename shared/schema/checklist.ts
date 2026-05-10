import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  sheet: text("sheet").notNull().default("Feuil1"),
  zone: integer("zone"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  categoryId: integer("category_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const checks = pgTable("checks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  itemId: integer("item_id").notNull(),
  checkDate: text("check_date").notNull(),
  isChecked: boolean("is_checked").notNull().default(false),
  checkedAt: timestamp("checked_at"),
  note: text("note"),
});

export const futureItems = pgTable("future_items", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  itemId: integer("item_id").notNull(),
  targetDate: text("target_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  emailDate: text("email_date").notNull(),
  itemCount: integer("item_count").notNull(),
  itemsList: text("items_list").notNull(),
  success: boolean("success").notNull().default(true),
  error: text("error"),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  author: text("author").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  siret: text("siret"),
  tvaNumber: text("tva_number"),
  accountNumber: text("account_number"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  contactName: text("contact_name"),
  category: text("category").default("autre"),
  paymentTerms: text("payment_terms"),
  defaultPaymentMethod: text("default_payment_method"),
  bankIban: text("bank_iban"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name"),
  invoiceNumber: text("invoice_number"),
  invoiceDate: text("invoice_date").notNull(),
  totalHt: real("total_ht"),
  totalTtc: real("total_ttc").notNull(),
  tvaRate: real("tva_rate").default(20),
  tvaAmount: real("tva_amount"),
  paymentMethod: text("payment_method"),
  /**
   * Status enum applicatif : "pending" | "paid" | "late" | "cancelled".
   * Pas de DB enum pour rester additif (extension future sans migration).
   */
  paymentStatus: text("payment_status").notNull().default("pending"),
  /** Date effective de paiement (renseignée à la transition vers "paid"). */
  paidDate: text("paid_date"),
  dueDate: text("due_date"),
  category: text("category"),
  description: text("description"),
  notes: text("notes"),
  /** Soft-delete : DELETE flippe à false, la row reste pour traçabilité. */
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const generalExpenses = pgTable("general_expenses", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  date: text("date").notNull(),
  paymentMethod: text("payment_method"),
  isRecurring: boolean("is_recurring").default(false),
  recurringFrequency: text("recurring_frequency"),
  notes: text("notes"),
  /** Optional supplier link (URSSAF, EDF, assurance…). Pas obligatoire car
   *  beaucoup de dépenses sont sans fournisseur formel (péages, frais bancaires). */
  supplierId: integer("supplier_id"),
  /** Montant TVA si applicable (loyer commercial, certains contrats services). */
  taxAmount: real("tax_amount"),
  /** Échéance prévue (différente de la date d'engagement de la dépense). */
  dueDate: text("due_date"),
  /** N° pièce / facture si présent (ex. avis URSSAF, quittance loyer). */
  invoiceNumber: text("invoice_number"),
  /** Période couverte (YYYY-MM pour mensuel, YYYY pour annuel). */
  period: text("period"),
  /**
   * Status enum applicatif : "pending" | "paid" | "late" | "cancelled".
   * Aligné sur purchases.paymentStatus pour pouvoir agréger les deux
   * dans la trésorerie côté analytics.
   */
  paymentStatus: text("payment_status").notNull().default("pending"),
  /** Date effective de paiement. */
  paidDate: text("paid_date"),
  /** Soft-delete : DELETE flippe à false, la row reste pour traçabilité. */
  isActive: boolean("is_active").notNull().default(true),
});

export const files = pgTable(
  "files",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    fileName: text("file_name").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    category: text("category").notNull(),
    fileType: text("file_type").notNull().default("file"),
    supplier: text("supplier"),
    description: text("description"),
    fileDate: text("file_date"),
    storagePath: text("storage_path").notNull(),
    emailedTo: text("emailed_to").array(),
    /**
     * Optional FK to `employees.id`. Set when this file is linked to an
     * employee (e.g. payslip, contract, ID copy). Drives the "Documents
     * Ressources Humaines" section. Nullable. PR #72.
     */
    employeeId: integer("employee_id"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("files_tenant_id_idx").on(table.tenantId),
    employeeIdx: index("files_employee_id_idx").on(table.employeeId),
  }),
);

/**
 * Soft-delete trash mirror for `files`. Rows live here until `expiresAt`
 * (default 7 days), at which point a scheduled purge deletes them from
 * R2 and from this table. Restore moves a row back to `files` if not yet
 * expired. PR #71.
 *
 * Modelled as a separate table (rather than a `deletedAt` column on
 * `files`) so the hot-path queries on `files` don't need a `WHERE
 * deleted_at IS NULL` filter, and the trash list query stays cheap.
 */
export const filesTrash = pgTable(
  "files_trash",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** ID the row had in `files` before deletion (free for forensics, not enforced FK). */
    originalFileId: integer("original_file_id").notNull(),
    fileName: text("file_name").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    category: text("category").notNull(),
    fileType: text("file_type").notNull().default("file"),
    supplier: text("supplier"),
    description: text("description"),
    fileDate: text("file_date"),
    storagePath: text("storage_path").notNull(),
    emailedTo: text("emailed_to").array(),
    /** Set when the user moved the file to trash. */
    deletedAt: timestamp("deleted_at").notNull().defaultNow(),
    /** Hard-delete cutoff. Once `now() > expiresAt`, purge wipes the row + R2 object. */
    expiresAt: timestamp("expires_at").notNull(),
    /** Date the file was originally uploaded (preserved across move-to-trash). */
    originalCreatedAt: timestamp("original_created_at"),
  },
  (table) => ({
    tenantIdx: index("files_trash_tenant_id_idx").on(table.tenantId),
    expiresIdx: index("files_trash_expires_at_idx").on(table.expiresAt),
  }),
);

/**
 * @deprecated PR #83 — replaced by `bankEntries` (SQL `bank_entries_v2`) in
 * `shared/schema/finance.ts`. Kept declared so `drizzle-kit push` doesn't
 * mark the still-present (empty) SQL table for destructive drop. The SQL
 * `bank_entries` table will be dropped via a separate hand-written
 * migration once we're ready to run a destructive deploy.
 */
export const legacyBankEntries = pgTable("bank_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  type: text("type").notNull().default("expense"),
  category: text("category"),
  reference: text("reference"),
  isReconciled: boolean("is_reconciled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * @deprecated PR #83 — replaced by `cashEntries` (SQL `cash_entries_v2`)
 * in `shared/schema/finance.ts`. Same drop-deferred policy as
 * `legacyBankEntries`.
 */
export const legacyCashEntries = pgTable("cash_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  description: text("description"),
  category: text("category"),
  paymentMethod: text("payment_method"),
  reference: text("reference"),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Employees — staff roster scoped per tenant. PR #72 enriched the
 * pre-existing table with HR-specific fields (SSN for payslip-PDF
 * matching, weekly hours, hourly rate, end date, free notes).
 */
export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    position: text("position"),
    contractType: text("contract_type").notNull().default("CDI"),
    startDate: text("start_date"),
    /** End of contract (resignation, end of CDD, etc.). */
    endDate: text("end_date"),
    phone: text("phone"),
    email: text("email"),
    /** Sécurité sociale — used to match incoming payslip PDFs. Nullable. */
    socialSecurityNumber: text("social_security_number"),
    salary: real("salary"),
    /** Hourly rate for hour-based contracts (extra/CDD horaire). */
    hourlyRate: real("hourly_rate"),
    /** Contracted weekly hours. Default 35 = full-time France. */
    weeklyHours: real("weekly_hours").default(35),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("employees_tenant_id_idx").on(table.tenantId),
  }),
);

/**
 * Payroll — one row per (employee, month). PR #72 added the columns
 * needed to surface employer-side cost on the RH dashboard:
 * `employerCharges`, `totalEmployerCost`, `bonus`, `overtime`,
 * `isPaid`, `paidDate`, plus a typed `pdfFileId` FK to the archived
 * payslip in `files`.
 */
export const payroll = pgTable(
  "payroll",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    employeeId: integer("employee_id").notNull(),
    /** Period covered, format `YYYY-MM`. */
    month: text("month").notNull(),
    grossSalary: real("gross_salary").notNull(),
    netSalary: real("net_salary").notNull(),
    socialCharges: real("social_charges"),
    /** Charges patronales. If null, the UI estimates as gross × tenant.taxRules.employerChargeRate. */
    employerCharges: real("employer_charges"),
    /** gross + employerCharges; nullable when not extracted yet. */
    totalEmployerCost: real("total_employer_cost"),
    bonuses: real("bonuses"),
    /** Overtime amount, distinct from bonuses. */
    overtime: real("overtime"),
    deductions: real("deductions"),
    /** Free-form status — kept for back-compat. New flow uses `isPaid` + `paidDate`. */
    status: text("status").notNull().default("draft"),
    isPaid: boolean("is_paid").notNull().default(false),
    /** ISO date of payment. */
    paidDate: text("paid_date"),
    paidAt: timestamp("paid_at"),
    /** Links to `files.id` archive of the original payslip PDF. */
    pdfFileId: integer("pdf_file_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("payroll_tenant_id_idx").on(table.tenantId),
    employeeIdx: index("payroll_employee_id_idx").on(table.employeeId),
    /** Block accidental duplicate fiches for the same (employee, month) within a tenant. */
    uniqEmpMonth: uniqueIndex("payroll_employee_month_unique").on(
      table.tenantId,
      table.employeeId,
      table.month,
    ),
  }),
);

/**
 * Absences / congés — PR #72 added `duration` (days) and `isApproved`
 * boolean which is what the RH dashboard uses for the "Alertes" counter.
 * `status` text kept for compat but the canonical approval signal is
 * `isApproved`.
 */
export const absences = pgTable(
  "absences",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    employeeId: integer("employee_id").notNull(),
    /** `conge | maladie | retard | absence | formation` (free-form, validated app-side). */
    type: text("type").notNull(),
    startDate: text("start_date").notNull(),
    /** Nullable for single-day events ("retard"). */
    endDate: text("end_date"),
    /** Length in days. Front computes if not provided. */
    duration: real("duration"),
    reason: text("reason"),
    notes: text("notes"),
    /** Free-form status — back-compat. */
    status: text("status").notNull().default("pending"),
    /** Canonical approval flag; `pendingAbsences` count = !isApproved. */
    isApproved: boolean("is_approved").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("absences_tenant_id_idx").on(table.tenantId),
    employeeIdx: index("absences_employee_id_idx").on(table.employeeId),
  }),
);

export const analytics = pgTable("analytics", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  date: text("date").notNull(),
  metric: text("metric").notNull(),
  value: real("value").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertItemSchema = createInsertSchema(items).omit({ id: true, createdAt: true });
export const insertCheckSchema = createInsertSchema(checks).omit({ id: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
export const insertPurchaseSchema = createInsertSchema(purchases).omit({ id: true, createdAt: true });
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true });

export type Category = typeof categories.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Check = typeof checks.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Employee = typeof employees.$inferSelect;
