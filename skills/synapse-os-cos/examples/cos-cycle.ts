/**
 * Example: cos-cycle.ts
 *
 * End-to-end Chief of Staff cycle against one org. Walks the 4-phase loop:
 * READ → DIAGNOSE → ACT → REPORT.
 *
 *   SYNAPSE_ADMIN_TOKEN_CNU=… \
 *   SUPABASE_PROJECT_REF=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   npx tsx examples/cos-cycle.ts
 *
 * Run weekly via cron, or on-demand when the operator asks "how are we doing?"
 */

import { SynapseOS, type Agent, type Objective, type Checkin, type Learning } from '../../synapse-os/synapse-os';

const SILENT_DAYS = 7;
const STUCK_KR_DAYS = 14;

async function main() {
  const org = new SynapseOS({
    dashboardUrl: 'https://cnu.synapse-os.ai',
    adminToken: requireEnv('SYNAPSE_ADMIN_TOKEN_CNU'),
    agentId: 'agent.cnu-cos',
    supabase: {
      projectRef: requireEnv('SUPABASE_PROJECT_REF'),
      serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    },
  });

  // ----- 1. READ -----------------------------------------------------------
  const since = isoDaysAgo(SILENT_DAYS);
  const [okrs, agents, recentDecisions, openFeedback] = await Promise.all([
    org.okrs.list({ status: 'active' }),
    org.agents.list({ is_platform: false, status: 'active' }),
    org.decisions.listRecent({ since, limit: 50 }),
    org.feedback.read({ status: 'open' }),
  ]);

  // Last checkin per agent (parallel)
  const lastCheckinByAgent = new Map<string, Checkin | undefined>();
  await Promise.all(
    agents.map(async (a) => {
      const cks = await org.checkins.query({ agent_id: a.id, limit: 1 });
      lastCheckinByAgent.set(a.id, cks[0]);
    }),
  );

  // ----- 2. DIAGNOSE -------------------------------------------------------
  const silentAgents = agents.filter((a) => {
    const last = lastCheckinByAgent.get(a.id);
    if (!last) return true;
    return last.created_at < since;
  });

  const stuckOkrs: { okr: Objective; reason: string }[] = [];
  for (const okr of okrs) {
    const krs = await org.okrs.listKRs(okr.id);
    const allPending = krs.length > 0 && krs.every((k) => k.status === 'pending');
    if (!allPending) continue;
    // No workflow targeting this OKR?
    const wfs = await org.workflows.list({ project_id: okr.project_id });
    const bound = wfs.some((w) => w.target_objective_id === okr.id);
    if (!bound) stuckOkrs.push({ okr, reason: 'no_workflow_bound' });
  }

  // Learning clusters that haven't been codified
  const since30d = isoDaysAgo(30);
  const recentLearnings = await org.learnings.query({ since: since30d, status: 'active' });
  const clustersByTag = clusterByTag(recentLearnings);
  const codifiedTags = new Set(recentDecisions.flatMap((d) => d.scope_tags));
  const uncodifiedClusters = [...clustersByTag.entries()].filter(([tag, entries]) => {
    if (codifiedTags.has(tag)) return false;
    const projectCount = new Set(entries.map((e) => e.project_id)).size;
    return entries.length >= 3 && projectCount >= 2;
  });

  // ----- 3. ACT ------------------------------------------------------------
  const actions: string[] = [];

  // Coach silent agents (cap at 5 per cycle so we don't flood)
  for (const agent of silentAgents.slice(0, 5)) {
    await sendCoachingBrief(org, agent, lastCheckinByAgent.get(agent.id));
    actions.push(`coached silent agent ${agent.id}`);
  }

  // Coach owners of stuck OKRs
  for (const { okr } of stuckOkrs.slice(0, 5)) {
    if (!okr.owner_human_id) continue;
    // Find an agent on the project to send the brief through
    const projectAgents = agents.filter((a) => a.primary_team_id);
    const target = projectAgents[0];
    if (!target) continue;
    await org.briefs.publish({
      target_agent_id: target.id,
      kind: 'coaching',
      subject: `OKR "${truncate(okr.title, 60)}" has no workflow — who's moving it?`,
      body_markdown: [
        `**What I see**`,
        `Active OKR ${okr.id} has been pending with no workflow bound to it for >${STUCK_KR_DAYS}d.`,
        ``,
        `**What I'm suggesting**`,
        `Create a workflow via workflow.create with target_objective_id=${okr.id}. Check-ins will inherit the binding.`,
        ``,
        `**What I'm asking back**`,
        `Either bind a workflow or send feedback.write explaining why this OKR should be abandoned.`,
      ].join('\n'),
      payload: { related_okr_id: okr.id, coach_reason: 'no_workflow_bound' },
    });
    actions.push(`briefed re unbound OKR ${okr.id}`);
  }

  // Codify uncodified clusters
  for (const [tag, entries] of uncodifiedClusters.slice(0, 3)) {
    const projects = [...new Set(entries.map((e) => e.project_id))];
    const decision = await org.decisions.propose({
      title: `Codify pattern: ${tag} (${entries.length} learnings across ${projects.length} projects)`,
      rationale: [
        `Loop 3 hasn't crystallized this yet but the cluster is mature.`,
        `Most consistent signal across the cluster: "${entries[0].claim.slice(0, 200)}"`,
        `Adopting this as org-level guidance for projects in scope.`,
      ].join(' '),
      alternatives_considered: [
        'Wait for Loop 3 to catch up — risks letting projects re-discover the same lesson',
        'Codify per-project instead of org-wide — duplicates effort',
      ],
      evidence_learning_ids: entries.map((e) => e.id),
      evidence_fact_ids: [],
      scope_projects: projects,
      scope_tags: [tag],
    });
    actions.push(`codified decision ${decision.id} on tag '${tag}'`);
  }

  // ----- 4. REPORT ---------------------------------------------------------
  const isoWeek = new Date().toISOString().slice(0, 10);
  const report = [
    `# Weekly digest — ${new URL(org.dashboardUrl).hostname.split('.')[0]} — ${isoWeek}`,
    ``,
    `## Numbers`,
    `- Active OKRs: ${okrs.length}`,
    `- OKRs without a bound workflow: ${stuckOkrs.length}`,
    `- Active worker agents: ${agents.length - silentAgents.length} / ${agents.length}`,
    `- Silent agents (no checkin ${SILENT_DAYS}d+): ${silentAgents.length}`,
    `- Decisions codified this week: ${recentDecisions.length}`,
    `- Open operator feedback items: ${openFeedback.length}`,
    ``,
    `## What I did this cycle`,
    ...actions.map((a) => `- ${a}`),
    ``,
    `## Needs your interrupt`,
    openFeedback.length > 0
      ? `${openFeedback.length} unread operator-feedback items in the inbox — please review.`
      : `Nothing this cycle.`,
  ].join('\n');

  console.log(report);

  // Persist the digest as a decision for future-CoS to read
  await org.decisions.propose({
    title: `Weekly digest — ${isoWeek}`,
    rationale: report,
    alternatives_considered: ['No persistent record', 'Email-only'],
    evidence_learning_ids: [],
    evidence_fact_ids: [],
    scope_projects: [],
    scope_tags: ['weekly-digest', isoWeek],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendCoachingBrief(org: SynapseOS, agent: Agent, last: Checkin | undefined) {
  const lastSeen = last ? last.created_at.slice(0, 10) : 'never';
  await org.briefs.publish({
    target_agent_id: agent.id,
    kind: 'coaching',
    subject: `Quiet ${SILENT_DAYS}+ days — what would unblock you?`,
    body_markdown: [
      `**What I see**`,
      `Your last checkin was ${lastSeen}. The fleet can't help you move on goals it can't see progress on.`,
      ``,
      `**What I'm suggesting**`,
      `Send any checkin (status=in_progress / blocked / completed) within 24h. If blocked, say what on — I'll route assistance.`,
      ``,
      `**What I'm asking back**`,
      `Checkin within 24h, or a feedback.write explaining the gap. Silence past 14d triggers an operator escalation.`,
    ].join('\n'),
    payload: { coach_reason: 'silent_7d', last_checkin_at: last?.created_at },
  });
}

function clusterByTag(learnings: Learning[]): Map<string, Learning[]> {
  const out = new Map<string, Learning[]>();
  for (const l of learnings) {
    for (const tag of l.applies_to ?? []) {
      if (!out.has(tag)) out.set(tag, []);
      out.get(tag)!.push(l);
    }
  }
  return out;
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`required env var ${name} not set`);
  return v;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
