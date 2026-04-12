import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  nameVi: text("name_vi"),
  nameTh: text("name_th"),
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
  nameVi: text("name_vi"),
  nameTh: text("name_th"),
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
  paymentStatus: text("payment_status").notNull().default("pending"),
  dueDate: text("due_date"),
  category: text("category"),
  description: text("description"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const files = pgTable("files", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const bankEntries = pgTable("bank_entries", {
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

export const cashEntries = pgTable("cash_entries", {
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

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  position: text("position"),
  contractType: text("contract_type"),
  startDate: text("start_date"),
  phone: text("phone"),
  email: text("email"),
  salary: real("salary"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payroll = pgTable("payroll", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  month: text("month").notNull(),
  grossSalary: real("gross_salary").notNull(),
  netSalary: real("net_salary").notNull(),
  socialCharges: real("social_charges"),
  bonuses: real("bonuses"),
  deductions: real("deductions"),
  status: text("status").notNull().default("draft"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const absences = pgTable("absences", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  type: text("type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
