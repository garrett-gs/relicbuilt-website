// ── Projects / Custom Work ──────────────────────────────────

export interface ProposalHighlight {
  title: string;
  body: string;
  included?: boolean;
}

export interface ProposalScope {
  body: string;
  included?: boolean;
}

export interface ProposalCostItem {
  description: string;
  cost: number;
}

export interface ProposalCostSection {
  items: ProposalCostItem[];
  show_total?: boolean;
  deposit_amount?: number;
  included?: boolean;
}

// ── Project Checklist ────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  type?: string;
}

export interface ChecklistGroup {
  id: string;
  label: string;
  items: ChecklistItem[];
}

export interface ChecklistStep {
  id: string;
  label: string;
  completed: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  groups: ChecklistGroup[];
  steps: ChecklistStep[];
}

export interface ProjectChecklist {
  sections: ChecklistSection[];
}

// ── Custom Work ──────────────────────────────────────────────

export interface CustomWork {
  id: string;
  project_name: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  customer_id?: string;
  company_id?: string;
  company_name?: string;
  project_description?: string;
  budget_range?: string;
  timeline?: string;
  status: "new" | "in_review" | "quoted" | "in_progress" | "complete";
  internal_notes?: string;
  quoted_amount: number;
  actual_cost: number;
  materials: Material[];
  labor_log: LaborEntry[];
  start_date?: string;
  due_date?: string;
  image_url?: string;
  inspiration_images: string[];
  folder_url?: string;
  proposal_highlights?: ProposalHighlight[];
  proposal_scope?: ProposalScope;
  proposal_cost_section?: ProposalCostSection;
  proposal_images?: string[];
  proposal_images_included?: boolean;
  proposal_token?: string;
  proposal_status?: "draft" | "sent" | "approved";
  proposal_approved_at?: string;
  portal_enabled: boolean;
  portal_token?: string;
  portal_stage: PortalStage;
  checklist?: ProjectChecklist;
  created_at: string;
  updated_at: string;
}

export type PortalStage =
  | "consultation"
  | "design"
  | "approval"
  | "fabrication"
  | "finishing"
  | "delivery";

export interface Material {
  description: string;
  vendor: string;
  cost: number;
  receipt_id?: string;
}

export interface LaborEntry {
  date: string;
  description?: string;
  hours: number;
  rate: number;
  cost: number;
}

// ── Receipts ─────────────────────────────────────────────────

export interface ReceiptLineItem {
  description: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface Receipt {
  id: string;
  image_url?: string;
  vendor?: string;
  receipt_date?: string;
  total?: number;
  line_items: ReceiptLineItem[];
  project_id?: string;
  project_name?: string;
  notes?: string;
  created_at: string;
}

// ── Tasks ───────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
  assignee?: string;
  due_date?: string;
  comments: TaskComment[];
  custom_work_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  text: string;
  author?: string;
  created_at: string;
}

// ── Customers ───────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  type: "Individual" | "Business" | "Contact";
  title?: string;
  address?: string;
  website?: string;
  industry?: string;
  status: "active" | "inactive";
  notes: CustomerNote[];
  company_id?: string;
  company_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerNote {
  text: string;
  created_at: string;
}

// ── Companies ───────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  address?: string;
  industry?: string;
  phone?: string;
  website?: string;
  portal_token?: string;
  portal_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

// ── Estimates ───────────────────────────────────────────────

export interface EstimateLineItem {
  item_number: string;
  description: string;
  quantity: number;
  unit_price: number;
  unit: string;
}

export interface EstimateLaborItem {
  description: string;
  hours: number;
  rate: number;
  cost: number;
}

export interface Estimate {
  id: string;
  estimate_number: string;
  project_name?: string;
  custom_work_id?: string;
  customer_id?: string;
  vendor_id?: string;
  vendor_name?: string;
  client_name?: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  line_items: EstimateLineItem[];
  labor_items: EstimateLaborItem[];
  markup_percent: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ── Invoices ────────────────────────────────────────────────

export interface InvoiceLineItem {
  category: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  custom_work_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  description?: string;
  reference_number?: string;
  issued_date?: string;
  due_date?: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  tax_rate: number;
  line_items?: InvoiceLineItem[];
  payments: Payment[];
  status: "unpaid" | "partial" | "paid";
  notes?: string;
  reminders_sent: number;
  last_reminder_sent?: string;
  next_reminder_date?: string;
  invoice_type?: "standard" | "deposit" | "final";
  created_at: string;
  updated_at: string;
}

export interface Payment {
  amount: number;
  method: string;
  date: string;
  note?: string;
  ref?: string;
  created_at: string;
}

// ── Vendors ─────────────────────────────────────────────────

export interface Vendor {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  status: "active" | "inactive";
  created_at: string;
}

export interface CatalogItem {
  id: string;
  vendor_id: string;
  item_number?: string;
  description: string;
  unit_price: number;
  unit: string;
  category?: string;
  active: boolean;
  created_at: string;
}

// ── Purchase Orders ─────────────────────────────────────────

export interface POLineItem {
  item_number?: string;
  description: string;
  quantity: number;
  unit_price: number;
  unit: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_name: string;
  vendor_id?: string;
  item_description?: string;
  purchase_url?: string;
  quantity: number;
  unit_price: number;
  line_items: POLineItem[];
  notes?: string;
  custom_work_id?: string;
  status: "pending" | "approved" | "rejected";
  need_by_date?: string;
  delivery_method?: "pickup" | "will_call" | "ship";
  delivery_date?: string;
  ship_to_address?: string;
  attachments: string[];
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

// ── Expenses ────────────────────────────────────────────────

export interface Expense {
  id: string;
  date: string;
  description?: string;
  amount: number;
  category?: string;
  custom_work_id?: string;
  vendor_name?: string;
  receipt_url?: string;
  notes?: string;
  created_at: string;
}

// ── Portal ──────────────────────────────────────────────────

export interface BuildFile {
  id: string;
  custom_work_id: string;
  file_url: string;
  file_name?: string;
  file_type?: string;
  label?: string;
  uploaded_by?: string;
  created_at: string;
}

export interface BuildComment {
  id: string;
  custom_work_id: string;
  author: string;
  body: string;
  is_change_request: boolean;
  image_url?: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  custom_work_id: string;
  description?: string;
  status: "pending" | "approved" | "rejected";
  client_notes?: string;
  images?: string[];
  response_images?: string[];
  responded_at?: string;
  created_at: string;
}

// ── Activity ────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  action: string;
  entity: string;
  entity_id?: string;
  label: string;
  user_name?: string;
  meta: Record<string, unknown>;
  created_at: string;
}

// ── Settings ────────────────────────────────────────────────

export interface Settings {
  id: string;
  biz_name: string;
  biz_email?: string;
  biz_phone?: string;
  biz_address?: string;
  biz_city?: string;
  biz_state?: string;
  biz_zip?: string;
  logo_url?: string;
  accent_color: string;
  terms_text?: string;
  deposit_percent: number;
  balance_due_days: number;
  invoice_send_days: number;
  reminder_interval_days: number;
  team_members: TeamMember[];
  categories: string[];
  receipts_pin?: string;
  created_at: string;
}

export interface TeamMember {
  name: string;
  email: string;
  role: "admin" | "manager" | "staff";
  hourly_rate: number;
  pin?: string;
  color?: string;
  notifications?: {
    portal_updates?: boolean;
  };
}

// ── Time Entries ────────────────────────────────────────────

export interface TimeEntry {
  id: string;
  member_name: string;
  custom_work_id?: string;
  project_name?: string;
  clock_in: string;
  clock_out?: string;
  hours?: number;
  hourly_rate: number;
  notes?: string;
  created_at: string;
}

// ── Leads ────────────────────────────────────────────────────

export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  description?: string;
  budget_range?: string;
  inspiration_photos: string[];
  status: "new" | "contacted" | "quoted" | "converted" | "lost";
  source?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ── Axiom Navigation ────────────────────────────────────────

export type AxiomPage =
  | "dashboard"
  | "projects"
  | "tasks"
  | "customers"
  | "invoices"
  | "purchase-orders"
  | "expenses"
  | "calendar"
  | "activity"
  | "settings";
