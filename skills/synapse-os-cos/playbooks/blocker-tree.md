# Playbook: blocker tree

The operator asks "what's stuck?" or you see a cluster of `status='blocked'` checkins. Build a tree of who is blocked on whom (or what), and surface the root.

## Why this playbook exists

Blockers compound. One agent stuck on infra → three agents waiting on its output → an OKR slips. The tree exposes the root so a single action unsticks the whole subtree.

## Procedure

### 1. Gather all open blockers

```ts
const since = isoDaysAgo(14);
const allBlocked = (await org.checkins.query({ since }))
  .filter(c => c.status === 'blocked');

// Dedup to one row per (agent_id, project_id) — latest checkin wins
const latestByAgent = new Map<string, Checkin>();
for (const c of allBlocked) {
  const key = `${c.agent_id}|${c.project_id ?? ''}`;
  const existing = latestByAgent.get(key);
  if (!existing || c.created_at > existing.created_at) latestByAgent.set(key, c);
}
const blockers = [...latestByAgent.values()];
```

### 2. Classify each blocker by type

Read the `current_task` and `payload` of each blocker. Classify into:

| Type | Heuristic | Edge in tree |
|---|---|---|
| **External** | `current_task` mentions an external dep, API, vendor, or "waiting on X team" | leaf (no further node) |
| **Inter-agent** | `payload.blocked_on_agent_id` is set, OR text mentions another agent.id | edge → that agent |
| **Capability** | Text says "I don't know how to" or "need an agent that can" | leaf — should be assistance.route'd |
| **OKR-shape** | "Can't measure", "no signal source", "KR is ambiguous" | leaf — should be reshaped |
| **Operator-decision** | "Need to know whether to do X or Y" — wrongly waiting on operator | edge → operator (HOOTL violation, see below) |
| **Unknown** | None of the above | leaf — needs investigation |

### 3. Build the tree

Each node is `{ agent_id, blocked_on, kind }`. Run a BFS from each blocker outward; cycles indicate mutual deadlock (rare but worth flagging).

```ts
const tree = new Map<string, { agent: string; blockedOn: string | null; kind: BlockerType; checkin: Checkin }>();

for (const c of blockers) {
  const kind = classify(c);
  const blockedOn = kind === 'inter_agent' ? extractAgentId(c) : null;
  tree.set(c.agent_id, { agent: c.agent_id, blockedOn, kind, checkin: c });
}

// Find roots — nodes whose blockedOn is null or whose target isn't in the tree
const roots = [...tree.values()].filter(n => !n.blockedOn || !tree.has(n.blockedOn));
```

### 4. For each root, take action

| Root type | Action |
|---|---|
| External | Brief to the agent's project lead: "X is blocked on external Y — owns this resolution?" |
| Capability | Call `assistance.route({requested_capability: '...'})` on the blocked agent's behalf and brief them with the result. |
| OKR-shape | Reshape the KR (split, redefine metric, add metric_source). Log a decision. |
| Operator-decision | **HOOTL violation by the agent.** Send a contract-update brief to the agent: "*Decisions are yours — make the call and inform via decision.propose. Operator does not gate routine choices.*" |
| Unknown | Brief asking the agent to elaborate. Set 24h timer. |

For inter-agent edges, the action is on the *root*, not the downstream waiters. Resolving the root unblocks the subtree automatically.

### 5. Codify recurring patterns

If the same root type appears 3+ times across a week, codify. Examples:

- *"3 agents blocked on the same external API."* → Decision: switch infra, add a circuit breaker, or formally pause work pending vendor resolution.
- *"5 HOOTL-violating blockers."* → Decision: tighten agent SOULs to reinforce the contract.

### 6. Report

```
## Blocker tree — <date>

Roots (<n>):
- agent.foo [capability] — needs TypeScript runtime. Routed to agent.bar via assistance.route. 1 downstream waiter.
- agent.baz [external] — vendor X down 4d. Brief sent to project lead.
- agent.qux [okr_shape] — KR3 has no metric_source. Reshaped + decision codified.

Total downstream agents unblocked: <n>
HOOTL violations corrected: <n>
```

## Don'ts

- **Don't list every blocked checkin.** Roots only. The tree exists to compress 30 blockers into 5 actionable roots.
- **Don't act on downstream nodes.** Acting on a non-root spends effort that the root resolution would cover for free.
- **Don't treat "blocked on operator" as legitimate.** That's the contract violation — name it and correct it.
- **Don't ship a tree without acting on the roots.** The tree is a diagnostic, not a deliverable.
