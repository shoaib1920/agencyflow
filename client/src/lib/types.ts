export type Role = 'admin' | 'manager' | 'member';

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
  createdAt: string;
}

export interface Notification {
  _id: string;
  type: 'task_assigned' | 'lead_stage' | 'lead_won' | 'system';
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
  entityType: 'client' | 'lead' | 'project' | 'task' | 'user';
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
}
