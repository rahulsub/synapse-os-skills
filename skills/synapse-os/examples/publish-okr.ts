/**
 * Example: publish-okr.ts
 *
 * Publish a project-scoped OKR with two KRs, owner attached. Demonstrates the
 * SDK's pre-flight scope-shape enforcement.
 *
 *   SYNAPSE_ADMIN_TOKEN_CNU=… npx tsx examples/publish-okr.ts
 */

import { SynapseOS } from '../synapse-os';

async function main() {
  const cnu = SynapseOS.fromEnv({
    dashboardUrl: 'https://cnu.synapse-os.ai',
    envVar: 'SYNAPSE_ADMIN_TOKEN_CNU',
  });

  // Required: project must exist before scoping an OKR to it.
  const projectId = 'project.synapse';

  const { id, kr_ids } = await cnu.okrs.publish({
    title: 'Ship welcome-flow v2 by 2026-09-30',
    description: 'Cut time-to-first-OKR for new operators in half.',
    scope_kind: 'project',
    scope_id: projectId,
    project_id: projectId,                       // required because scope_kind='project'
    owner_human_id: 'human.rahul-subramaniam',
    target_completion: '2026-09-30',
    krs: [
      {
        title: 'Time-to-value < 90s for new operators',
        metric_target: 90,
        metric_direction: 'down',
        metric_unit: 's',
        metric_source: 'synapse-judge instrumentation',
      },
      {
        title: 'Activation rate (publishes ≥1 OKR within 24h) > 80%',
        metric_target: 80,
        metric_direction: 'up',
        metric_unit: '%',
        metric_source: 'synapse-judge instrumentation',
      },
    ],
  });

  console.log(`published okr ${id} with KRs:`, kr_ids);

  // Demonstrate the constraint guard: this throws BEFORE the network call.
  try {
    await cnu.okrs.publish({
      title: 'Bad: org-scoped OKR with project_id set',
      scope_kind: 'org',
      scope_id: 'org',
      project_id: projectId, // would violate objectives_scope_shape_check
    });
  } catch (err) {
    console.log(`SDK caught scope-shape violation as expected: ${(err as Error).message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
