# Playbook: codify a decision

You believe the org has learned something that should change how it operates. This playbook is the bar for promoting that belief into a codified Decision.

## When to codify

You see all four of these at once:

1. **Cluster.** ≥3 learnings on the same `applies_to` tag across ≥2 projects.
2. **Conviction.** You can state in one sentence *what changes about agent behavior* if this decision exists.
3. **Alternatives.** You can name at least 2 plausible alternatives and why they lose.
4. **Reversibility.** The decision is recoverable — superseding it next month doesn't cost the org irreversibly.

If you have 1-3 but not 4, that's a feedback escalation, not a decision. See `escalation.md`.

## Why this bar matters

Decisions are *policy*. They show up in agent reads forever. A weak decision pollutes the knowledge graph and trains agents to discount decisions in general. The bar protects the signal.

If you don't pass the bar but still feel something should be said, write a *learning* — that's what learnings are for.

## Procedure

### 1. Pull the candidate cluster

```ts
const tag = 'prompt-engineering'; // or whatever the operator/Loop 3 surfaced
const candidates = await org.learnings.query({
  applies_to: [tag],
  status: 'active',
  confidence: 'high',
});

const byProject = new Map<string, Learning[]>();
for (const l of candidates) {
  if (!byProject.has(l.project_id)) byProject.set(l.project_id, []);
  byProject.get(l.project_id)!.push(l);
}

// Cluster check: ≥3 learnings across ≥2 projects
const totalLearnings = candidates.length;
const projectCount = byProject.size;
if (totalLearnings < 3 || projectCount < 2) {
  console.log(`tag '${tag}' below cluster bar: ${totalLearnings} learnings, ${projectCount} projects`);
  return;
}
```

### 2. Draft the title + rationale

**Title** = the new norm in one sentence. Action-shaped. *"Default to single-pass generation on 32B-class models"* beats *"Decision about generation strategies."*

**Rationale** = three sentences max:

1. The pattern observed.
2. Why it matters.
3. What changes as a result.

Example:
> Multi-loop self-correction underperforms single-pass on 32B-class models across three projects (G3, G6, IB). Verifier reliability is the bottleneck, not generator quality, so each loop amplifies bad rewrites instead of fixing them. Going forward, default to single-pass; multi-loop must justify against this benchmark before adoption.

### 3. Name alternatives

At least two, each with one-line reasoning for why it loses:

- *Keep multi-loop with stricter verifier rubric* — *we tried this in G3, gains too small and rubric churn too high.*
- *Switch to a different verifier model* — *won't address the root cause; the bottleneck is rubric design, not model.*

### 4. Write it

```ts
const decision = await org.decisions.propose({
  title: '<the new norm in one sentence>',
  rationale: '<three sentences>',
  alternatives_considered: [
    '<alt 1: why it loses>',
    '<alt 2: why it loses>',
  ],
  evidence_learning_ids: candidates.map(l => l.id),
  evidence_fact_ids: [],     // optional but strengthens the audit trail
  scope_projects: [...byProject.keys()],
  scope_tags: [tag],
  team_id: '<resolved from primary project's team>',
});
console.log(`codified ${decision.id} status=${decision.status}`);  // 'active'
```

Note: status is `'active'` immediately. Do not pass a status field; the SDK throws if you do (HOOTL).

### 5. Socialize

Send a `kind: 'notification'` brief to every active agent in `scope_projects`:

```ts
for (const projectId of [...byProject.keys()]) {
  const projectAgents = await org.agents.list({ /* filter by project */ });
  for (const agent of projectAgents) {
    await org.briefs.publish({
      target_agent_id: agent.id,
      kind: 'notification',
      subject: `New decision affects your scope: ${decision.title}`,
      body_markdown: [
        `Loop 3 / CoS codified a decision tagged \`${tag}\` that applies to your project.`,
        ``,
        `**Decision**: ${decision.title}`,
        ``,
        `**Rationale**: ${decision.rationale}`,
        ``,
        `Decision id: \`${decision.id}\`. Read in your next checkin cycle and adjust workflows accordingly.`,
      ].join('\n'),
      payload: { decision_id: decision.id, scope_tag: tag },
    });
  }
}
```

### 6. Report it in the digest

Decisions are the highest-signal artifact for the operator's weekly read. Surface every codification by title in the next weekly digest.

## Special case — superseding a prior decision

If your new decision conflicts with a prior `status='active'` decision, do not write two contradictory active decisions. Instead:

1. Write the new one first.
2. Then mark the old one `'superseded'` via `intent('decision.write', { id: oldId, patch: { status: 'superseded', superseded_by: newId } })`.

This preserves history while making clear which is current.

## Don'ts

- **Don't codify single-project learnings.** That's a learning, not a decision.
- **Don't codify your own preference.** Decisions need an evidence cluster, not "I think we should."
- **Don't pass `status: 'proposed'`.** The SDK throws.
- **Don't skip the socialize step.** A decision nobody reads is paperwork.
- **Don't codify the same decision twice.** Check `decisions.listRecent({scope_tags: [tag]})` first.
