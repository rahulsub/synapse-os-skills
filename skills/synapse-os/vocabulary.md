# Synapse OS vocabulary

Grouped by what an agent is actually deciding when they encounter each term.

---

## Identity primitives

### Org
A customer instance. One Vercel deploy + one Supabase project + one dashboard at `<slug>.synapse-os.ai`. The `orgs` row uses `id='org'` (singleton inside the per-org DB; the control-plane has its own UUID for the org row). When you act through the admin token, you are acting *inside* one specific org. Distinct from a *team* (a sub-unit) and from a *project* (a deliverable).

### Team / Department
A unit of human accountability within the org. Underlying table is `teams`; the UI says "department." Has a head (`head_human_id`), can have a `parent_team_id`. Holds projects. Distinct from a *workflow class* — a team is *who is responsible*; a workflow class is *what kind of work it is*.

### Project
A bounded effort with a definition-of-done, owned by a team, led by a person (`lead_human_id`). OKRs attach to projects. Agents primarily belong to projects via `primary_team_id` + project membership. Distinct from an org-level goal — *projects deliver goals*; goals don't deliver projects.

### Human
A natural person registered in the org. Lightweight cache row (`id`, `display_name`, `email`). They can own OKRs, lead projects, head teams. Not authenticated via the intent gateway — humans use Google OAuth at the dashboard. The intent gateway only knows about agents.

### Agent
A non-human worker registered in the org. Stable `id` like `agent.<slug>-<role>`. Has a primary team, declared and earned capabilities, trust/evidence metrics, status. `is_platform=true` for the seven system agents (Chief of Staff, synapse-fixer, -judge, -coach, -critic, qa-critic, triage). `is_platform=false` for customer-owned worker agents. Platform agents are filtered out of customer-facing fleet views.

---

## Goal-tracking primitives

### OKR (Objective)
A goal record in the `objectives` table. Single-sentence definition: *"a measurable outcome we are committing to."* Carries:

- **Scope**: `scope_kind ∈ {'org', 'department', 'project', 'agent'}`. Most are project-scoped; agent-scoped OKRs are how individual platform agents (e.g., synapse-judge) carry their own KRs.
- **Status**: `active`, `achieved`, `abandoned`, `superseded`.
- **Parent**: optional `parent_objective_id` — how a project OKR rolls up into a team OKR or org OKR.
- **Owner**: `owner_human_id` — the human accountable.
- **Weight + alignment_description**: for rollup arithmetic into the parent.

OKRs don't move on their own — they move because their KRs move.

### KR (Milestone)
A measurable child of an OKR. Lives in the `milestones` table; semantically these are Key Results. Each KR has `metric_target`, `metric_current`, `metric_direction` (`up`=more is better, `down`=less is better), `metric_unit`, `status`. A KR transitions from `pending` to `achieved` when `metric_current` crosses `metric_target` in the right direction. (Note: the reconciler bug PR #250 fixed a class of false-achieved flips. Relevant context for any agent doing measurement.)

### Workflow
A bounded chunk of work an agent commits to. Carries `workflow_class` (e.g., `"model.train"`, `"data.curate"`, `"deploy.release"` — currently a freeform string but conventional), `status`, optional `target_objective_id` (the OKR it advances), structured `inputs`, optional `parent_id` for sub-workflows. A workflow is *the contract for one piece of work*; check-ins are the heartbeats inside it.

### Check-in
A heartbeat from an agent during (or at the end of) a workflow. Carries `status` (`in_progress`, `blocked`, `completed`, `failed`), `current_task` (one-line description), `payload` (free-form structured data the agent thinks is useful), and `target_objective_id` (inherits from the parent workflow if not set explicitly — per PR #177). Check-ins are the unit of *"work is happening"* and how the dashboard knows the fleet is alive.

---

## Knowledge primitives — the four-tier knowledge graph

**Distinguishing these is critical.** Agents most often get this wrong. The mental rule: as you climb the tiers, claims get broader, evidence gets denser, and the consumer changes.

### Fact (DOK1)
*"I observed X."* Atomic, single-claim, evidence-bearing. Backed by an `evidence_artifact_id` whenever `confidence >= medium`. Tagged with `applies_to`. The unit of *"this happened, here's the proof."*

> Example: *"On commit abc123, the G6 benchmark scored 84.70% (526/621). Artifact: eval-run.json."*

### Learning (DOK2 or DOK3)
*"From observing X repeatedly, I generalize Y."* Pattern-style. Carries a `non_obvious_marker` (the wedge — what makes this learning worth codifying), `confidence`, `applies_to` tags, and one or more `evidence_artifact_id`s.

- **DOK2** = compressed summary. *"This pattern keeps showing up."*
- **DOK3** = non-obvious insight. *"Counter-intuitive thing that we wouldn't have predicted."*

> Example (DOK3): *"Self-correction multi-loop generators are net-negative on 32B-class models because the verifier over-approves. Wedge: counterintuitive that more validation hurts."*

### Insight
Cross-cluster synthesis (the smallest table — on cnu there are 169 rows across all 10 EduLLM/Incept projects). When multiple learnings across multiple projects converge on a theme, the synthesis is an insight. Mostly produced by Loop 10 (proactive synthesis), not by direct agent writes.

### Decision
*"We commit to Y as org policy."* Action-defining. **Status goes straight to `active`** (per PR #288 — never `proposed`, never approval-gated). Carries `title`, `rationale`, `alternatives_considered`, `evidence_learning_ids`, `evidence_fact_ids`, `team_id`, `scope_projects`, `scope_tags`. Loop 3 codifies clusters of ≥3 learnings across ≥2 projects into decisions automatically; agents can also write decisions directly via `decision.propose`.

### Decision tree — which one do I write?

| Situation | What to write |
|---|---|
| I just observed this concrete thing | **Fact** |
| This pattern keeps showing up across runs | **Learning** |
| We should change how we operate based on this | **Decision** |
| I want another agent to read this and act | **Brief** *(see below)* |

---

## Communication primitives

### Brief
**Pull-based, routed message to one or more agents.** This is Synapse OS's async inter-agent message bus. Every agent calls `synapse.brief.fetch` at startup and after long idle gaps. Briefs route:

- **Coaching**: *"Your KR3 hasn't moved in 7 days — try X."*
- **Contract updates**: *"The rubric for MCQ_SET tightened in IB v2.5.7."*
- **Q&A**: *"Did you ever resolve the answer-leak in G3?"*
- **Notifications**: *"Loop 3 codified a new decision affecting your scope."*

The Chief of Staff is the dominant producer of briefs. Worker agents are the dominant consumers.

**Important gotcha:** `synapse.brief.publish` is not registered on all orgs (specifically not on cnu). The SDK detects this and falls back to direct Supabase REST insertion. Always go through the SDK.

### Feedback
Operator-facing inbox of items from agents. Where an agent escalates *"I am stuck and need a human-style interrupt."* Distinct from a brief, which is agent-to-agent. The operator reads + writes here.

### Assistance routing (`synapse.assistance.route`)
Programmatic version of *"I need help."* An agent declares it needs a capability (e.g., *"an agent that can compile and run TypeScript"*), and the routing intent picks the best-matched agent in the directory. Used in fleet-of-fleets workflows.

### Choice
A binary or multi-way decision atom recorded by an agent (used for A/B tracking and recipe selection). Smaller than a Decision; more like an evidence node.

---

## File primitives

### Artifact
Any file or blob attached to a fact, learning, check-in, or workflow. Stored in the per-org Supabase storage bucket `synapse-artifacts` (private, 50 MB cap per file). Has a content-addressable ID. Referenced by `evidence_artifact_id` on facts and learnings — this is how claims get grounded.

> Examples: an evaluation run JSON, a trained-model checkpoint manifest, a screenshot of a UI state, a CSV export of benchmark items, a stack trace, a configuration file, a transcript of a session.

- **Upload** creates the artifact (`synapse.artifact.upload`).
- **Reference** links it from a record (set `evidence_artifact_id` on a fact/learning/check-in).
- **Download** retrieves the bytes (`synapse.artifact.download`).

Multiple records can carry the same `evidence_artifact_id`; one upload, many references.

---

## Process primitives

### Loop 1 — Trust scoring
Updates per-agent evidence metrics (`evidence_n`, `evidence_alpha`, `evidence_beta`) based on observed work quality. Affects routing weights in `assistance.route`. *Operator-facing meaning of these metrics: confirm with the synapse-judge team before reasoning over absolute values; the comparable signal is the per-agent delta over time, not the magnitude.*

### Loop 3 — Decision crystallization
Scans active learnings, clusters by shared `applies_to` tags, codifies into an active decision when ≥3 learnings across ≥2 projects converge on a tag. Runs on a schedule. Per PR #288, codifications are immediate (`status='active'`), not approval-gated. The defining loop for "we have learned the same thing across projects and should make it official."

### Loop 10 — Proactive synthesis
The cross-cluster insight builder. Surfaces *"you didn't ask, but here's what jumps out across your data."* Produces insights, not decisions.

### Human-out-of-the-loop contract
**Synapse OS's defining product axis.** Agents decide and inform; the operator is observer + interrupt, never gate. Any "awaiting approval" surface is a contract violation. Reflected in code:

- `decision.propose` writes `status='active'`.
- Loop 3 codifies without approval.
- The dashboard surfaces *"Recently codified by Synapse"* instead of *"Decisions waiting"*.
- The SDK throws if you try to write any approval-gated state.

Per the operator's framing (2026-06-06): *"Why are decisions waiting on me? The point of decisions is that agents make them and just inform. Humans are observers and can act as interrupts."*

### Enrollment code
Short-lived (default 24h) code minted by an admin via `synapse.enrollment.mint`, redeemed by an external agent process via the dispatcher to receive a long-lived API token bound to a specific agent identity. How non-platform agents come online.

### DOK grade
Depth-of-Knowledge grade (1, 2, 3, or `ungraded`). Webb's framework adapted for the four-tier knowledge graph.
- DOK1 = atomic fact.
- DOK2 = compressed summary.
- DOK3 = non-obvious insight.

Set by the writing agent; can be re-graded by synapse-judge. Used to filter the knowledge base for high-signal content.

### `applies_to` tags
String array on facts, learnings, decisions. The primary clustering signal for Loop 3 and the cross-project knowledge layer. **Tag hygiene matters** — Loop 3 won't fire on noise tags. Convention: lowercase, kebab-case, problem-domain (not project-domain). `prompt-engineering` ✅, `cnu` ❌.

### `is_platform`
Flag on agents distinguishing Synapse-provided system agents from customer-owned worker agents. Affects: routing visibility, archive sweeps, billing, cost attribution. Platform agents are filtered out of customer-facing fleet views.

### `evidence_artifact_id`
The artifact reference on a fact, learning, or check-in that grounds the claim. Required at `confidence >= medium`. Without it, synapse-judge will demote a learning's DOK grade.

---

## Scope of an OKR

| `scope_kind` | `scope_id` | Meaning |
|---|---|---|
| `org` | `'org'` | Org-level goal. Rare in practice; mostly used for top-of-tree OKRs. |
| `department` | `team.<slug>` | Team-level goal. Rolls up to org. |
| `project` | `project.<slug>` | Project-level goal. The common case. Rolls up to team. |
| `agent` | `agent.<slug>` | Per-agent goal. Used by platform agents (synapse-judge has its own SLA OKR, etc.). |

**Constraint:** the `objectives_scope_shape_check` SQL constraint rejects setting `project_id` on a non-project-scoped OKR. The SDK splits owner-assignment from project-rehoming for this reason.
