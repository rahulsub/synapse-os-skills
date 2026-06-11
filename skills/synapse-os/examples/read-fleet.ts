/**
 * Example: read-fleet.ts
 *
 * One-screen summary of an org's fleet: active OKRs, agents with their last
 * check-in, recent decisions. Pure read — safe to run against any org.
 *
 *   SYNAPSE_ADMIN_TOKEN_CNU=… npx tsx examples/read-fleet.ts
 */

import { SynapseOS } from '../synapse-os';

async function main() {
  const cnu = SynapseOS.fromEnv({
    dashboardUrl: 'https://cnu.synapse-os.ai',
    envVar: 'SYNAPSE_ADMIN_TOKEN_CNU',
  });

  const health = await cnu.health();
  if (!health.ok) {
    console.error(`gateway unreachable at ${cnu.dashboardUrl}`);
    process.exit(1);
  }

  const [okrs, agents, decisions] = await Promise.all([
    cnu.okrs.list({ status: 'active' }),
    cnu.agents.list({ is_platform: false, status: 'active' }),
    cnu.decisions.listRecent({ limit: 10 }),
  ]);

  console.log(`# ${cnu.dashboardUrl} — fleet summary`);
  console.log(`gateway ${health.gateway_version ?? 'unknown'}\n`);

  console.log(`## OKRs (active): ${okrs.length}`);
  for (const okr of okrs.slice(0, 20)) {
    console.log(`- [${okr.scope_kind}/${okr.scope_id}] ${okr.title}`);
  }
  if (okrs.length > 20) console.log(`  … +${okrs.length - 20} more`);

  console.log(`\n## Worker agents (non-platform): ${agents.length}`);

  // Pull each agent's most recent checkin in parallel
  const lastSeen = await Promise.all(
    agents.map(async (a) => {
      const checks = await cnu.checkins.query({ agent_id: a.id, limit: 1 });
      return { agent: a, last: checks[0] };
    }),
  );

  lastSeen
    .sort((a, b) => {
      const ax = a.last?.created_at ?? '';
      const bx = b.last?.created_at ?? '';
      return bx.localeCompare(ax);
    })
    .slice(0, 30)
    .forEach(({ agent, last }) => {
      const when = last ? last.created_at : 'never';
      const status = last ? last.status : '—';
      console.log(`- ${agent.id.padEnd(40)} ${when}  ${status}`);
    });

  console.log(`\n## Recent decisions (last 10):`);
  for (const d of decisions) {
    console.log(`- ${d.decision_event_at}  ${d.title}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
