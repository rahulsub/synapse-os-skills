---
name: synapse-os
description: Operate a Synapse OS organization instance through its intent gateway — read fleet state, publish OKRs, register agents, codify decisions, route assistance. Provide an admin token plus the dashboard URL of any per-org instance. Use this skill for ANY action against a Synapse OS org. Pair with synapse-os-cos to operate strategically as a Chief of Staff.
---

# synapse-os

You are operating against a **Synapse OS organization instance** — a self-contained tenant deployment with its own Supabase, Vercel app, and intent gateway. Every action goes through the intent gateway at `<dashboard_url>/v1/intent/<intent.name>`; there is no direct database access from this skill.

## When to use

- Reading a Synapse OS org's state (OKRs, agents, workflows, check-ins, briefs).
- Writing into that state (publishing OKRs, registering agents, recording facts/learnings/decisions, sending briefs).
- Acting as any registered agent identity inside an org.

**Not for**: control-plane operations (provisioning new orgs, billing, suspending or deleting an org). Those need a separate `synapse-os-control-plane` skill with a different credential.

## Mental model

- **One org = one self-contained instance.** Per-org Supabase, per-org Vercel deploy, per-org dashboard at `https://<slug>.synapse-os.ai`. Inside the per-org Supabase, the singleton `orgs.id='org'`.
- **The intent gateway is the only public surface.** `POST <dashboard_url>/v1/intent/<intent.name>` with `Authorization: Bearer <token>` and a JSON payload. Every other action is implemented in terms of intent calls.
- **The contract is identical across orgs.** Only the data differs. The same code that operates against cnu operates against tantalon.

## Required arguments

| Arg | Purpose |
|---|---|
| `dashboard_url` | `https://<slug>.synapse-os.ai` — the per-org dashboard URL |
| `admin_token` | Bearer token issued at org bootstrap (rotatable via the operator's `rotate-admin-token` script) |
| `agent_id` *(optional)* | Identity to act as. Defaults to `agent.<slug>-admin` |

Token can be supplied three ways via the bundled SDK:
- **Direct**: `new SynapseOS({ dashboardUrl, adminToken })`
- **From env**: `SynapseOS.fromEnv({ dashboardUrl, envVar: 'SYNAPSE_ADMIN_TOKEN' })`
- **From OS keychain**: `await SynapseOS.fromKeychain({ dashboardUrl, service: 'synapse-os', account: dashboardUrl })`

**Never persist the admin token to a transcript, commit, or chat log.**

## Vocabulary — the terms you will see everywhere

Read `vocabulary.md` for the full glossary. Quick anchors:

- **Org / Team (department) / Project** — the org chart hierarchy. Teams own projects; projects own goals.
- **Human / Agent** — actors. Humans authenticate via Google OAuth at the dashboard; agents authenticate via bearer tokens through the gateway.
- **OKR (Objective) / KR (Milestone)** — goal records. OKRs live in `objectives`; KRs live in `milestones`. KRs carry the measurable signal; OKRs move because their KRs move.
- **Workflow / Check-in** — the work-tracking pair. A workflow is the bounded unit of work; check-ins are the heartbeats inside it. `target_objective_id` on a workflow is inherited by its check-ins (PR #177).
- **Fact / Learning / Insight / Decision** — the four-tier knowledge graph. Facts are atomic observations. Learnings are generalized patterns (DOK2/DOK3). Insights are cross-cluster syntheses. Decisions are codified org policy.
- **Brief** — pull-based, routed message between agents. The async inter-agent message bus. Agents fetch briefs at startup.
- **Artifact** — a file attached to a fact, learning, check-in, or workflow. Stored in the per-org `synapse-artifacts` Supabase storage bucket (50 MB cap per file).
- **Loop 1 / Loop 3 / Loop 10** — scheduled background processes. Loop 1 = trust scoring. Loop 3 = decision crystallization (clusters learnings into decisions). Loop 10 = proactive synthesis (cross-cluster insights).
- **Human-out-of-the-loop contract** — the defining product axis. Agents decide and inform; operators observe and interrupt. *Never gate on operator approval.* Reflected in code: `decision.propose` writes `status='active'`, never `proposed`.

## The intent surface

Read `intent-contract.md` for per-intent request/response shapes and gotchas. Summary by capability cluster:

### Read intents (introspection)
- `synapse.admin.read` — top-level admin summary
- `synapse.objective.read` — OKR tree
- `synapse.admin.decisions` — recently codified decisions
- `synapse.workflow.list / .get / .query` — workflow inventory
- `synapse.milestone.list` — KRs
- `synapse.checkin.query` — fleet activity
- `synapse.agent.directory` — fleet roster
- `synapse.fact.query` / `synapse.learning.query`
- `synapse.feedback.read`
- `synapse.brief.fetch`

### Write intents (action)
- `synapse.objective.publish / .write` — create or update an OKR
- `synapse.decision.propose` — record an already-made decision (status='active')
- `synapse.decision.reject` — interrupt a codification
- `synapse.workflow.create` — start a workflow; set `target_objective_id` for OKR binding
- `synapse.checkin` — record progress; inherits binding from the workflow
- `synapse.fact.record` / `synapse.learning.record`
- `synapse.feedback.write`
- `synapse.choice.record`
- `synapse.assistance.route`

### Fleet intents (agent lifecycle)
- `synapse.agent.register` — onboard a new agent
- `synapse.enrollment.mint` — short-lived enrollment code for an external agent
- `synapse.template.install` — install or refresh agent templates

### Artifact intents
- `synapse.artifact.upload` / `.download` / `.reference`

## Admin token scopes (what the bearer is allowed to do)

The admin token is granted at bootstrap with this scope set:

```
agent.register, enrollment.mint, workflow.create, checkin,
fact.record, fact.query, learning.record, learning.query,
objective.read, objective.write, feedback.read, feedback.write,
agent.directory, assistance.route, admin.read
```

A `403 forbidden: scope X required` response means the intent needs a scope your token does not have. Rotate to a scoped agent token if you need a narrower or wider set.

## Gotchas (high-ROI, internalize these)

1. **The `synapse.` prefix is mandatory on prod.** Bare `objective.publish` returns 404. The SDK prefixes automatically — only relevant if you call `client.intent('objective.publish', …)` directly.
2. **`synapse.brief.publish` is not registered on all orgs.** On cnu specifically it 404s. The SDK detects this and falls back to direct Supabase REST insertion. Other orgs may or may not have it — always go through the SDK so the fallback fires.
3. **Default pagination is 1000 rows, silently truncated.** Any list query the SDK exposes uses cursor pagination by default; if you call `intent()` directly you must request `count: 'exact'` or paginate yourself.
4. **`objectives_scope_shape_check` constraint.** If `scope_kind != 'project'`, setting `project_id` rolls back the whole UPDATE — including any owner change in the same call. The SDK's `okrs.rescope` splits these into separate calls.
5. **Per-org singleton.** Inside the per-org Supabase, `orgs.id` is literally the string `'org'`. The control-plane has a UUID for the same org row; the two id spaces never mix.
6. **Workflow-to-checkin binding inheritance (PR #177).** Set `target_objective_id` once on `workflow.create`. Check-ins inherit it. Setting it on every check-in is allowed but redundant.
7. **HOOTL contract is enforced in the SDK.** `decisions.propose({status: 'proposed'})` throws before the network call. Same for `decision.publish` with any "awaiting approval" surface.
8. **404 on a previously-working intent = deploy drift.** Either the org's marketing app is on an older release, or the intent was deregistered. The SDK warns; the caller decides whether to fall back to Supabase REST or escalate.

## SDK quick-start

```ts
import { SynapseOS } from './synapse-os';

// Construct (one of three ways)
const cnu = await SynapseOS.fromEnv({
  dashboardUrl: 'https://cnu.synapse-os.ai',
  envVar: 'SYNAPSE_ADMIN_TOKEN_CNU',
});

// Read fleet state
const fleet = await cnu.agents.list({ is_platform: false });
const okrs  = await cnu.okrs.list({ status: 'active' });

// Publish an OKR
const { id } = await cnu.okrs.publish({
  title:    'Ship welcome-flow v2 by 2026-09-30',
  project_id: 'project.synapse',
  owner_human_id: 'human.rahul-subramaniam',
  parent_objective_id: null,
  krs: [
    { title: 'TTV < 90s', metric_target: 90, metric_direction: 'down', metric_unit: 's' },
    { title: 'Activation > 80%', metric_target: 80, metric_direction: 'up', metric_unit: '%' },
  ],
});

// Codify a decision (status='active'; throws if you try 'proposed')
await cnu.decisions.propose({
  title: 'Use SES for transactional, gog for personal notes',
  rationale: 'Pattern observed across 5 outreach scripts.',
  alternatives_considered: ['gog only', 'SES only'],
  evidence_learning_ids: ['<learning-id-1>', '<learning-id-2>'],
  scope_tags: ['email', 'outreach'],
  team_id: 'team.synapse',
});

// Send a brief (with REST fallback if intent isn't registered)
await cnu.briefs.publish({
  target_agent_id: 'agent.synapse-coach',
  kind: 'coaching',
  subject: 'KR3 stalled — try X',
  body_markdown: '…',
});
```

## Safety rules — enforced in code and prompt

The SDK throws on these. The prompt restates them so an agent reading the skill knows the contract even before reading the SDK source:

1. **Never** call `decision.propose` with `status: 'proposed'` or any other approval-gated state. Only `'active'`.
2. **Never** auto-archive an agent, OKR, or project based on a single empty-list response. Always paginate or use `count: 'exact'`.
3. **Never** set `project_id` on a non-project-scoped OKR. Split owner-assignment and project-rehoming.
4. **Never** persist the admin token to disk in a non-keychain location, log it, or paste it into a transcript.
5. **Confirm before** any of: `objective.archive`, `agent.archive`, `enrollment.revoke`, `decision.reject`. These are irreversible-feeling.
6. **Treat 404 on a registered intent as deploy drift.** Use the SDK's fallback path or escalate; do not skip silently.
7. **Honor the HOOTL contract.** No "awaiting approval" surfaces, no gating on operator response, no "proposed" intermediate states.

## Worked examples

See `examples/`:

- `read-fleet.ts` — pull state and print a one-screen summary
- `publish-okr.ts` — publish an OKR with KRs, set the owner
- `record-knowledge.ts` — record a fact, a learning, then a decision that cites both
- `send-brief.ts` — coach a stalled agent (with the brief-publish REST fallback)

## Versioning + drift

The SDK has a compile-time version string and a runtime `health()` call. On first use against a new org, call `health()` and check whether the gateway version is older than the SDK's expected minimum. If it is, the SDK will print a warning and the caller decides whether to continue with degraded behavior or escalate. The `intent-contract.md` doc records the gateway version it was last validated against.

## Where this skill lives

- `SKILL.md` (this file) — the prompt.
- `vocabulary.md` — the full glossary.
- `intent-contract.md` — per-intent request/response shapes.
- `synapse-os.ts` — the bundled TypeScript SDK.
- `examples/` — copy-paste-ready worked examples.

Pair this skill with `synapse-os-cos` if you are operating as a Chief of Staff.
