export type Role = 'admin' | 'manager' | 'member' | 'client';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string | null;
  meta: PageMeta | null;
}

export interface PageMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  unread?: number;
  errors?: Record<string, string[]>;
}

export interface UserRef {
  _id: string;
  name: string;
  avatarColor?: string;
}

export interface User extends UserRef {
  email: string;
  role: Role;
  title?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  client?: { _id: string; name: string; company?: string } | null;
  emailNotifications?: boolean;
}

export type ClientStatus = 'active' | 'paused' | 'closed';
export interface Client {
  _id: string;
  name: string;
  company?: string;
  email: string;
  phone?: string;
  country?: string;
  status: ClientStatus;
  notes?: string;
  sourceLead?: string;
  createdAt: string;
  updatedAt: string;
  projects?: Pick<Project, '_id' | 'title' | 'status' | 'budget' | 'deadline'>[];
}

export type LeadStage = 'new' | 'contacted' | 'proposal' | 'negotiation' | 'won' | 'lost';
export interface Lead {
  _id: string;
  title: string;
  contactName: string;
  company?: string;
  email: string;
  phone?: string;
  country?: string;
  value: number;
  stage: LeadStage;
  position: number;
  source?: string;
  notes?: string;
  owner?: UserRef;
  client?: string | { _id: string; name: string };
  wonAt?: string;
  createdAt: string;
}

export type ProjectStatus = 'planning' | 'active' | 'on-hold' | 'completed';
export interface Attachment {
  _id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  storage: 'cloudinary' | 'local';
  uploadedBy?: { _id: string; name: string };
  createdAt: string;
}
export interface Project {
  _id: string;
  title: string;
  description?: string;
  client: { _id: string; name: string; company?: string; email?: string };
  budget: number;
  deadline?: string;
  status: ProjectStatus;
  members: (UserRef & { email?: string; role?: Role })[];
  attachments?: Attachment[];
  taskCount?: number;
  doneCount?: number;
  estimatedHours?: number | null;
  createdAt: string;
}

export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export interface Task {
  _id: string;
  project: string | { _id: string; title: string };
  title: string;
  description?: string;
  assignee?: UserRef | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  completedAt?: string;
  position?: number;
  createdAt: string;
}

export interface Notification {
  _id: string;
  type: 'task_assigned' | 'lead_stage' | 'lead_won' | 'mention' | 'comment' | 'reminder' | 'invoice' | 'system';
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  actor?: UserRef | string;
  createdAt: string;
}

export interface Activity {
  _id: string;
  actor: UserRef;
  action: string;
  entityType: 'client' | 'lead' | 'project' | 'task' | 'user' | 'invoice';
  entityId: string;
  entityName: string;
  project?: string;
  meta?: { from?: string; to?: string; [k: string]: unknown };
  createdAt: string;
}

export interface DashboardData {
  kpis: {
    activeClients: number;
    totalClients: number;
    openLeads: number;
    pipelineValue: number;
    projectsDueThisWeek: number;
    winRate: number;
    revenueWon: number;
  };
  leadsByStage: { stage: LeadStage; count: number; value: number }[];
  revenueByMonth: { month: string; year: number; revenue: number; deals: number }[];
  tasksByStatus: { status: TaskStatus; count: number }[];
  activity: Activity[];
  myTasks: (Task & { project: { _id: string; title: string } })[];
  money: MoneySummary | null;
}

export interface MoneyBucket {
  total: number;
  count: number;
}
export interface MoneySummary {
  paid: MoneyBucket;
  outstanding: MoneyBucket;
  overdue: MoneyBucket;
  draft: MoneyBucket;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}
export interface Invoice {
  _id: string;
  number: string;
  client: { _id: string; name: string; company?: string; email?: string; country?: string };
  project?: { _id: string; title: string } | null;
  lead?: string | null;
  items: InvoiceItem[];
  currency: string;
  taxRate: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  displayStatus: InvoiceStatus | 'overdue';
  issueDate: string;
  dueDate: string;
  sentAt?: string;
  paidAt?: string;
  notes?: string;
  createdBy?: { _id: string; name: string };
  createdAt: string;
}

export interface Comment {
  _id: string;
  project: string;
  task?: string | null;
  author: UserRef & { role?: Role };
  body: string;
  mentions: { _id: string; name: string }[];
  internal: boolean;
  createdAt: string;
}

export interface RunningTimer {
  _id: string;
  startedAt: string;
  task: { _id: string; title: string };
  project: { _id: string; title: string };
}
export interface ProjectTime {
  totalMinutes: number;
  estimatedHours: number | null;
  byUser: { _id: string; minutes: number; name: string; avatarColor?: string }[];
  byTask: Record<string, number>;
  recent: { _id: string; minutes: number; note?: string; endedAt: string; user: UserRef; task: { _id: string; title: string } }[];
}

export interface Invite {
  _id: string;
  email: string;
  name?: string;
  role: Role;
  client?: string;
  expiresAt: string;
  invitedBy?: { name: string };
}

export interface TrashItem {
  _id: string;
  type: 'client' | 'lead' | 'project' | 'invoice';
  name: string;
  deletedAt: string;
  deletedBy: string | null;
  purgeAt: string;
}

export interface SearchResults {
  clients: { _id: string; name: string; company?: string; status: string }[];
  leads: { _id: string; title: string; company?: string; stage: LeadStage; value: number }[];
  projects: { _id: string; title: string; status: ProjectStatus; client?: { name: string; company?: string } }[];
  tasks: { _id: string; title: string; status: TaskStatus; project: { _id: string; title: string } }[];
  invoices: { _id: string; number: string; total: number; status: InvoiceStatus; client?: { name: string } }[];
}

export interface PortalOverview {
  client: { _id: string; name: string; company?: string; email: string };
  projects: (Pick<Project, '_id' | 'title' | 'status' | 'deadline' | 'description'> & { taskCount: number; doneCount: number })[];
  invoices: Pick<Invoice, '_id' | 'number' | 'total' | 'currency' | 'status' | 'displayStatus' | 'dueDate' | 'issueDate' | 'paidAt'>[];
  amountDue: number;
  overdueCount: number;
}
export interface PortalProject {
  _id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  deadline?: string;
  members: (UserRef & { title?: string })[];
  attachments: Pick<Attachment, '_id' | 'name' | 'url' | 'size' | 'mimeType' | 'createdAt'>[];
  tasks: Pick<Task, '_id' | 'title' | 'status' | 'dueDate' | 'completedAt' | 'priority'>[];
}
