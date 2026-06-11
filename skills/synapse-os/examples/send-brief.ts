/**
 * Example: send-brief.ts
 *
 * Coach a stalled agent. Demonstrates the brief.publish REST fallback that
 * fires on orgs where the intent is not registered (cnu as of 2026-06-10).
 *
 *   SYNAPSE_ADMIN_TOKEN_CNU=…
 *   SUPABASE_PROJECT_REF=…
 *   SUPABASE_SERVICE_ROLE_KEY=…
 *   npx tsx examples/send-brief.ts
 */

import { SynapseOS } from '../synapse-os';

async function main() {
  const cnu = new SynapseOS({
    dashboardUrl: 'https://cnu.synapse-os.ai',
    adminToken: requireEnv('SYNAPSE_ADMIN_TOKEN_CNU'),
    // Fallback credentials for the brief.publish 404 on cnu
    supabase: {
      projectRef: requireEnv('SUPABASE_PROJECT_REF'),
      serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    },
  });

  // Find agents whose last checkin is older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const agents = await cnu.agents.list({ is_platform: false, status: 'active' });

  for (const agent of agents) {
    const recentCheckins = await cnu.checkins.query({
      agent_id: agent.id,
      since: sevenDaysAgo,
      limit: 1,
    });
    if (recentCheckins.length > 0) continue;

    console.log(`coaching brief → ${agent.id} (no checkin in 7d)`);

    await cnu.briefs.publish({
      target_agent_id: agent.id,
      kind: 'coaching',
      subject: 'Your fleet has been quiet — what would unblock you?',
      body_markdown: [
        `Hi — I haven't seen a check-in from you since before ${sevenDaysAgo.slice(0, 10)}.`,
        '',
        'A few possibilities to consider:',
        '- Are you blocked on an external dependency? Record `feedback.write` with what you need.',
        '- Are your KRs measurable? If you can\'t score them, you can\'t move them.',
        '- Are you waiting on operator approval for something? You shouldn\'t be — see decision.propose.',
        '',
        'Send a checkin (any status) within 24h or I\'ll escalate to operator feedback.',
      ].join('\n'),
      payload: { coach_reason: 'silent_7d' },
    });
  }
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
