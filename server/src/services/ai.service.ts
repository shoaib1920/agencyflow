import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Lead } from '../models/Lead';
import { Activity } from '../models/Activity';
import { AppError } from '../utils/AppError';

export const AI_ACTIONS = ['summary', 'email', 'next_steps'] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

const MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
function getClient() {
  if (!env.aiEnabled) throw new AppError(503, 'AI assist is not configured on this server (ANTHROPIC_API_KEY missing)');
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  return client;
}

const SYSTEM = `You are a sales assistant inside AgencyFlow, a CRM for small digital agencies.
You help the agency team work their leads. Be concise, specific and practical.
Write plain text without markdown headings. Never invent facts that are not in the lead data;
if something important is missing (budget, timeline, decision maker), say what to ask for.`;

const TASKS: Record<AiAction, string> = {
  summary:
    'Summarize this lead for a teammate in at most 5 short bullet points (use "- "): who they are, what they want, deal size, where it stands, and the main risk or open question.',
  email:
    'Draft a short, friendly follow-up email from the agency to this contact that fits the current pipeline stage. Include a subject line on the first line as "Subject: ...", then the email body. Keep it under 150 words and end with one clear call to action.',
  next_steps:
    'Suggest the 3 most useful next steps to move this deal forward, as a numbered list. Each step one sentence, concrete and doable this week.',
};

/**
 * One Claude call per click. The lead is passed as data inside tags (never as instructions),
 * effort is low because these are short writing tasks, and server-side fallbacks retry on a
 * fallback model if a request is declined.
 */
export async function leadAssist(leadId: string, action: AiAction) {
  const lead = await Lead.findById(leadId).populate('owner', 'name').lean();
  if (!lead) throw AppError.notFound('Lead');
  const history = await Activity.find({ entityType: 'lead', entityId: lead._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('action meta createdAt')
    .lean();

  const data = {
    title: lead.title,
    contact: lead.contactName,
    company: lead.company,
    country: lead.country,
    dealValueUSD: lead.value,
    stage: lead.stage,
    source: lead.source,
    owner: (lead.owner as unknown as { name?: string } | null)?.name,
    createdAt: lead.createdAt,
    notes: lead.notes,
    recentActivity: history.map((h) => ({ action: h.action, ...(h.meta ?? {}), at: h.createdAt })),
  };

  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [
        {
          role: 'user',
          content: `<lead_data>\n${JSON.stringify(data, null, 2)}\n</lead_data>\n\n${TASKS[action]}`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new AppError(422, 'The AI declined this request. Try editing the lead notes.');
    }
    const text = response.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('\n')
      .trim();
    if (!text) throw new AppError(502, 'The AI returned an empty answer, please try again');
    return { action, text, model: response.model };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new AppError(429, 'AI is busy right now, try again in a minute');
    if (err instanceof Anthropic.AuthenticationError) throw new AppError(503, 'AI is misconfigured (invalid API key)');
    if (err instanceof Anthropic.APIError) {
      logger.error({ status: err.status, message: err.message }, 'Claude API error');
      throw new AppError(502, 'AI service error, please try again');
    }
    throw err;
  }
}
