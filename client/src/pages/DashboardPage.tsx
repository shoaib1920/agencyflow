import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, CircleDollarSign, KanbanSquare, UsersRound, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/card';
import { PageHeader, StatusBadge } from '@/components/shared/common';
import { ActivityTimeline } from '@/components/shared/ActivityTimeline';
import { STAGES } from '@/features/leads/stages';
import { get } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { formatDate, formatMoney, formatMoneyCompact } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import type { DashboardData } from '@/lib/types';

// Categorical slots 1-3 from the validated palette (fixed order, never cycled)
const TASK_COLORS = { todo: '#2a78d6', 'in-progress': '#eb6834', done: '#1baf7a' } as const;
const TASK_LABELS = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' } as const;

const axisProps = {
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 12 },
  axisLine: false,
  tickLine: false,
} as const;

function ChartTooltip({ active, payload, label, money }: { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 font-medium">{label ?? String(p.payload.name ?? '')}</p>
      <p className="text-muted-foreground">
        {money ? formatMoney(p.value) : p.value}
        {typeof p.payload.count === 'number' && money ? ` · ${p.payload.count} leads` : ''}
        {typeof p.payload.deals === 'number' ? ` · ${p.payload.deals} deals` : ''}
      </p>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, to }: { icon: LucideIcon; label: string; value: string; hint: string; to: string }) {
  return (
    <Link to={to}>
      <Card className="p-5 transition-colors hover:border-primary/40">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading } = useQuery({ queryKey: qk.dashboard, queryFn: () => get<DashboardData>('/dashboard') });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader title={`${greeting}, ${user?.name.split(' ')[0] ?? ''}`} description="Here's what's happening across the agency." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[118px] rounded-lg" />
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  const { kpis } = data;
  const stageData = data.leadsByStage.map((s) => ({ ...s, name: STAGES.find((x) => x.id === s.stage)?.label ?? s.stage }));
  const taskData = data.tasksByStatus.map((t) => ({ ...t, name: TASK_LABELS[t.status] }));
  const taskTotal = taskData.reduce((n, t) => n + t.count, 0);
  const revenueTotal = data.revenueByMonth.reduce((n, r) => n + r.revenue, 0);

  return (
    <div>
      <PageHeader title={`${greeting}, ${user?.name.split(' ')[0] ?? ''}`} description="Here's what's happening across the agency." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={UsersRound} label="Active clients" value={String(kpis.activeClients)} hint={`${kpis.totalClients} total`} to="/clients?status=active" />
        <Kpi icon={KanbanSquare} label="Open leads" value={String(kpis.openLeads)} hint={`${kpis.winRate}% win rate on closed deals`} to="/leads" />
        <Kpi icon={CircleDollarSign} label="Pipeline value" value={formatMoneyCompact(kpis.pipelineValue)} hint={`${formatMoneyCompact(kpis.revenueWon)} won to date`} to="/leads" />
        <Kpi icon={CalendarClock} label="Due this week" value={String(kpis.projectsDueThisWeek)} hint="Projects with a deadline in 7 days" to="/projects" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue won per month</CardTitle>
            <CardDescription>{formatMoney(revenueTotal)} over the last 12 months</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.revenueByMonth} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v: number) => formatMoneyCompact(v)} width={56} />
                <Tooltip content={<ChartTooltip money />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: 4 }} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }} activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads by stage</CardTitle>
            <CardDescription>Number of leads in each pipeline stage</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 11 }} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Task status</CardTitle>
            <CardDescription>{taskTotal} tasks across all projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={taskData} dataKey="count" nameKey="name" innerRadius="62%" outerRadius="90%" stroke="hsl(var(--card))" strokeWidth={2} paddingAngle={1}>
                    {taskData.map((t) => (
                      <Cell key={t.status} fill={TASK_COLORS[t.status]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{taskTotal ? Math.round(((taskData.find((t) => t.status === 'done')?.count ?? 0) / taskTotal) * 100) : 0}%</span>
                <span className="text-xs text-muted-foreground">complete</span>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {taskData.map((t) => (
                <li key={t.status} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: TASK_COLORS[t.status] }} />
                    {t.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{t.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My open tasks</CardTitle>
            <CardDescription>Assigned to you, soonest first</CardDescription>
          </CardHeader>
          <CardContent>
            {data.myTasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing assigned to you. Nice.</p>
            ) : (
              <ul className="divide-y">
                {data.myTasks.map((t) => (
                  <li key={t._id}>
                    <Link to={`/projects/${t.project._id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.project.title} · {t.dueDate ? `due ${formatDate(t.dueDate)}` : 'no due date'}
                        </p>
                      </div>
                      <StatusBadge value={t.priority} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Across the whole workspace</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <ActivityTimeline items={data.activity} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
