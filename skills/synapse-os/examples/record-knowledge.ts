/**
 * Example: record-knowledge.ts
 *
 * Walk the four-tier knowledge graph:
 *   1. Upload an artifact (the evidence)
 *   2. Record a Fact citing it (atomic observation)
 *   3. Record a Learning citing the same evidence (generalized pattern)
 *   4. Record a Decision citing both the Fact and Learning (org policy)
 *
 *   SYNAPSE_ADMIN_TOKEN_CNU=… npx tsx examples/record-knowledge.ts
 */

import { SynapseOS } from '../synapse-os';

async function main() {
  const cnu = SynapseOS.fromEnv({
    dashboardUrl: 'https://cnu.synapse-os.ai',
    envVar: 'SYNAPSE_ADMIN_TOKEN_CNU',
  });

  const projectId = 'project.edu-llm-g6';

  // 1. Upload evidence
  const evalJson = JSON.stringify({
    commit: 'abc123',
    benchmark: 'g6',
    score_pct: 84.70,
    correct: 526,
    total: 621,
    timestamp: new Date().toISOString(),
  });
  const artifact = await cnu.artifacts.upload({
    filename: 'g6-eval-abc123.json',
    mime_type: 'application/json',
    bytes: new TextEncoder().encode(evalJson),
    description: 'G6 benchmark run on commit abc123',
    project_id: projectId,
    applies_to: ['benchmark', 'g6'],
  });
  console.log(`uploaded artifact ${artifact.id}`);

  // 2. Record the Fact
  const fact = await cnu.facts.record({
    project_id: projectId,
    claim: 'On commit abc123, the G6 benchmark scored 84.70% (526/621).',
    applies_to: ['benchmark', 'g6'],
    confidence: 'high',
    evidence_artifact_id: artifact.id, // required at confidence>=medium
  });
  console.log(`recorded fact ${fact.id}`);

  // 3. Record the Learning (generalized pattern, DOK3-worthy non-obvious marker)
  const learning = await cnu.learnings.record({
    project_id: projectId,
    claim:
      'Self-correction multi-loop generators are net-negative on 32B-class models ' +
      'because the verifier over-approves: G6 hit 84.7% with single-pass but dropped ' +
      'to 79.3% with a 3-loop self-correct on the same prompts.',
    non_obvious_marker:
      'Counterintuitive — more validation hurt accuracy. The verifier had a higher ' +
      'false-positive rate than the generator had errors, so each loop amplified bad ' +
      'rewrites.',
    applies_to: ['prompt-engineering', 'self-correction', 'model-32b'],
    confidence: 'high',
    evidence_artifact_id: artifact.id,
  });
  console.log(`recorded learning ${learning.id}`);

  // 4. Codify a Decision citing both — status auto-goes to 'active' (HOOTL)
  const decision = await cnu.decisions.propose({
    title: 'Default to single-pass generation on 32B-class models',
    rationale:
      'Multi-loop self-correction underperforms single-pass on 32B-class models in ' +
      'all three projects that tried it. Verifier reliability is the bottleneck, not ' +
      'generator quality.',
    alternatives_considered: [
      'Keep multi-loop on with stricter verifier rubric',
      'Switch to a different verifier model',
      'Per-project opt-in',
    ],
    evidence_learning_ids: [learning.id],
    evidence_fact_ids: [fact.id],
    scope_projects: [projectId],
    scope_tags: ['prompt-engineering', 'self-correction'],
    team_id: 'team.edu-llm',
  });
  console.log(`codified decision ${decision.id} status=${decision.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
