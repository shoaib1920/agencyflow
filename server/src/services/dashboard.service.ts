import { Client } from '../models/Client';
import { Lead, LEAD_STAGES } from '../models/Lead';
import { Project } from '../models/Project';
import { Task, TASK_STATUSES } from '../models/Task';

/**
 * All dashboard numbers come from MongoDB aggregation pipelines so the work
 * happens in the database (index-backed $match first, then $group), not in JS loops.
 */
export async function getStats() {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const yearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [clientAgg, leadAgg, revenueAgg, taskAgg, dueAgg] = await Promise.all([
    Client.aggregate<{ _id: null; active: number; total: number }>([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        },
      },
    ]),

    // Leads by stage: count + summed deal value per column
    Lead.aggregate<{ _id: string; count: number; value: number }>([
      { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$value' } } },
    ]),

    // Revenue won per month for the last 12 months
    Lead.aggregate<{ _id: { y: number; m: number }; revenue: number; deals: number }>([
      { $match: { stage: 'won', wonAt: { $gte: yearAgo } } },
      {
        $group: {
          _id: { y: { $year: '$wonAt' }, m: { $month: '$wonAt' } },
          revenue: { $sum: '$value' },
          deals: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),

    Task.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    Project.aggregate<{ count: number }>([
      { $match: { status: { $ne: 'completed' }, deadline: { $gte: now, $lte: weekEnd } } },
      { $count: 'count' },
    ]),
  ]);

  const stageMap = new Map(leadAgg.map((s) => [s._id, s]));
  const leadsByStage = LEAD_STAGES.map((stage) => ({
    stage,
    count: stageMap.get(stage)?.count ?? 0,
    value: stageMap.get(stage)?.value ?? 0,
  }));
  const open = leadsByStage.filter((s) => s.stage !== 'won' && s.stage !== 'lost');

  // Fill months with zero revenue so the line chart has a continuous x-axis
  const revMap = new Map(revenueAgg.map((r) => [`${r._id.y}-${r._id.m}`, r]));
  const revenueByMonth = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(yearAgo.getFullYear(), yearAgo.getMonth() + i, 1);
    const r = revMap.get(`${d.getFullYear()}-${d.getMonth() + 1}`);
    return {
      month: d.toLocaleString('en-US', { month: 'short' }),
      year: d.getFullYear(),
      revenue: r?.revenue ?? 0,
      deals: r?.deals ?? 0,
    };
  });

  const taskMap = new Map(taskAgg.map((t) => [t._id, t.count]));
  const tasksByStatus = TASK_STATUSES.map((status) => ({ status, count: taskMap.get(status) ?? 0 }));

  const won = stageMap.get('won');
  const lost = stageMap.get('lost');
  const closed = (won?.count ?? 0) + (lost?.count ?? 0);

  return {
    kpis: {
      activeClients: clientAgg[0]?.active ?? 0,
      totalClients: clientAgg[0]?.total ?? 0,
      openLeads: open.reduce((n, s) => n + s.count, 0),
      pipelineValue: open.reduce((n, s) => n + s.value, 0),
      projectsDueThisWeek: dueAgg[0]?.count ?? 0,
      winRate: closed ? Math.round(((won?.count ?? 0) / closed) * 100) : 0,
      revenueWon: won?.value ?? 0,
    },
    leadsByStage,
    revenueByMonth,
    tasksByStatus,
  };
}
