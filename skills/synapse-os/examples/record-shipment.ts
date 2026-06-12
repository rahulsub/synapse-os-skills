/**
 * Example: record-shipment.ts (synapse-311)
 *
 * Show all three patterns:
 *   1. Default kind (autocomplete-typed).
 *   2. Custom kind (still type-checks).
 *   3. Querying recent shipments by kind for a per-project view.
 *
 *   SYNAPSE_ADMIN_TOKEN_CNU=… npx tsx examples/record-shipment.ts
 *
 * Workflow completion is NOT a ship — call `shipments.record` only when
 * concrete output went out (PR merged, deploy live, customer email sent,
 * model checkpoint promoted, etc.).
 */

import { SynapseOS, SHIPMENT_KIND_DEFAULTS, type ShipmentKindDefault } from '../synapse-os';

async function main() {
  const cnu = SynapseOS.fromEnv({
    dashboardUrl: 'https://cnu.synapse-os.ai',
    envVar: 'SYNAPSE_ADMIN_TOKEN_CNU',
  });

  // 1. Default kind — TypeScript autocompletes from SHIPMENT_KIND_DEFAULTS.
  const code: ShipmentKindDefault = 'code';
  const merged = await cnu.shipments.record({
    kind: code,
    reference: 'https://github.com/trilogy-group/synapse-ai/pull/311',
    outcome_summary: 'merged PR #311: shipment primitive landed',
    project_id: 'project.synapse',
  });
  console.log(`recorded code shipment ${merged.shipment_id}`);

  // 2. Custom kind — none of the defaults capture "pipeline-restart" precisely,
  //    so we invent a stable lowercase-hyphenated string. The kind-hygiene
  //    watchdog will surface it for promotion if it catches on.
  const restart = await cnu.shipments.record({
    kind: 'pipeline-restart',
    reference: 'cnu://saga/run/abc123',
    outcome_summary: 'restarted ingest pipeline after schema migration; agents back online',
    project_id: 'project.synapse',
  });
  console.log(`recorded custom-kind shipment ${restart.shipment_id}`);

  // 3. Query — what shipped this week, grouped by kind.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = await cnu.shipments.query({ since: sevenDaysAgo, limit: 500 });

  const byKind = new Map<string, number>();
  for (const s of recent) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
  console.log('\nWhat shipped this week:');
  const defaults = new Set<string>(SHIPMENT_KIND_DEFAULTS);
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    const tag = defaults.has(kind) ? '' : '  (custom)';
    console.log(`  ${count.toString().padStart(4)}  ${kind}${tag}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
