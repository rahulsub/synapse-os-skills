# Synapse OS intent contract

Per-intent request/response shapes. Use this as a reference when the SDK doesn't cover a case and you need to call `client.intent(name, payload)` directly.

**Validated against gateway version:** 2026-06-10 (synapse-api ≥ 2026-06-09)

**Transport:**
- `POST <dashboard_url>/v1/intent/<intent.name>`
- Header: `Authorization: Bearer <admin_token>`
- Header: `Content-Type: application/json`
- Body: `{ ...payload }`
- Response envelope: `{ ok: boolean, data?: T, error?: string, detail?: object }`

**Error envelope when `ok=false`:**
```json
{ "ok": false, "error": "human-readable reason", "detail": { "zod_errors": [...] } }
```

A `403` with `error: "forbidden: scope X required"` means your admin token lacks the named scope. See `SKILL.md` for the default admin scope set.

---

## Read intents

### `synapse.admin.read`
Top-level admin summary. Returns counts and recent activity.

**Payload**: `{}` (no args)
**Returns**: `{ org: {...}, counts: { humans, agents_active, agents_platform, projects_active, okrs_active, workflows_open_24h, checkins_24h, learnings_7d, decisions_active }, recent_activity: [...] }`

### `synapse.objective.read`
Read OKRs.

**Payload**: `{ status?: 'active'|'achieved'|'abandoned'|'superseded', scope_kind?: ..., scope_id?: ..., project_id?: ..., owner_human_id?: ..., parent_objective_id?: ..., limit?: number, cursor?: string }`
**Returns**: `{ items: Objective[], next_cursor?: string }`

`Objective`:
```ts
{
  id: string,
  title: string,
  description?: string,
  status: 'active' | 'achieved' | 'abandoned' | 'superseded',
  scope_kind: 'org' | 'department' | 'project' | 'agent',
  scope_id: string,
  project_id?: string,        // only when scope_kind='project'
  owner_human_id?: string,
  parent_objective_id?: string,
  alignment_description?: string,
  weight?: number,
  target_completion?: string,  // ISO date
  created_at: string,
}
```

### `synapse.milestone.list`
List KRs.

**Payload**: `{ objective_id?: string, status?: 'pending'|'achieved'|'abandoned', limit?: number, cursor?: string }`
**Returns**: `{ items: Milestone[], next_cursor?: string }`

`Milestone`:
```ts
{
  id: string,
  objective_id: string,
  title: string,
  position?: number,
  status: 'pending' | 'achieved' | 'abandoned',
  metric_target?: number,
  metric_current?: number,
  metric_direction?: 'up' | 'down',
  metric_unit?: string,
  metric_source?: string,
  achieved_at?: string,
}
```

### `synapse.workflow.list / .get / .query`
Inventory workflows.

**`.list` payload**: `{ status?: ..., agent_id?: ..., project_id?: ..., limit?, cursor? }`
**`.get` payload**: `{ id: string }`
**`.query` payload**: `{ filters: { ... }, sort?: 'created_at:desc' }`

`Workflow`:
```ts
{
  id: string,
  agent_id: string,
  project_id?: string,
  workflow_class: string,        // freeform, e.g. 'model.train', 'data.curate'
  title: string,
  status: 'active' | 'completed' | 'failed' | 'cancelled',
  inputs?: object,
  parent_id?: string,
  target_objective_id?: string,
  created_at: string,
  closed_at?: string,
}
```

### `synapse.checkin.query`
Recent fleet activity.

**Payload**: `{ agent_id?: string, project_id?: string, since?: string (ISO), limit?: number, cursor?: string }`
**Returns**: `{ items: Checkin[], next_cursor?: string }`

`Checkin`:
```ts
{
  id: string,
  agent_id: string,
  project_id?: string,
  bd_id?: string,                // workflow id (historical naming)
  status: 'in_progress' | 'blocked' | 'completed' | 'failed',
  current_task?: string,
  payload?: object,
  target_objective_id?: string,  // inherits from parent workflow if unset
  created_at: string,
}
```

### `synapse.agent.directory`
Fleet roster.

**Payload**: `{ status?: 'active'|'archived', is_platform?: boolean, primary_team_id?: string, limit?, cursor? }`
**Returns**: `{ items: Agent[], next_cursor?: string }`

`Agent`:
```ts
{
  id: string,
  display_name: string,
  primary_team_id?: string,
  status: 'active' | 'archived',
  is_platform: boolean,
  declared_capabilities?: string[],
  earned_capabilities?: string[],
  evidence_n?: number,
  evidence_alpha?: number,
  evidence_beta?: number,
  expected_scope_template?: string,
  archived_at?: string,
  archived_reason?: string,
  created_at: string,
}
```

### `synapse.fact.query` / `synapse.learning.query`
Knowledge-tier reads.

**Payload**: `{ project_id?, agent_id?, applies_to?: string[], confidence?: 'low'|'medium'|'high', dok_grade?: '1'|'2'|'3'|'ungraded', status?: 'active'|'rejected', since?: string, limit?, cursor? }`
**Returns**: `{ items: Fact[] | Learning[], next_cursor?: string }`

`Fact`:
```ts
{
  id: string,
  agent_id: string,
  project_id: string,
  claim: string,
  applies_to: string[],
  confidence: 'low' | 'medium' | 'high',
  dok_grade: '1' | 'ungraded',
  evidence_artifact_id?: string,
  status: 'active' | 'rejected',
  judgment_reason?: string,
  created_at: string,
}
```

`Learning`:
```ts
{
  id: string,
  agent_id: string,
  project_id: string,
  claim: string,
  non_obvious_marker?: string,
  applies_to: string[],
  confidence: 'low' | 'medium' | 'high',
  dok_grade: '2' | '3' | 'ungraded',
  evidence_artifact_id?: string,
  used_learnings?: { learning_id: string, outcome: 'resolved'|'did_not_resolve'|'unknown' }[],
  status: 'active' | 'rejected',
  judgment_reason?: string,
  created_at: string,
}
```

### `synapse.brief.fetch`
Read briefs targeted at an agent.

**Payload**: `{ target_agent_id: string, since?: string, kind?: 'coaching'|'contract'|'qa'|'notification', limit?: number }`
**Returns**: `{ items: Brief[] }`

`Brief`:
```ts
{
  id: string,
  author_agent_id?: string,
  author_human_id?: string,
  target_agent_id: string,
  kind: 'coaching' | 'contract' | 'qa' | 'notification',
  subject: string,
  body_markdown: string,
  payload?: object,
  ack_at?: string,
  created_at: string,
}
```

### `synapse.feedback.read`
Operator-facing inbox.

**Payload**: `{ status?: 'open'|'acknowledged'|'resolved', kind?: string, limit? }`

### `synapse.admin.decisions`
Recent codified decisions.

**Payload**: `{ since?: string, scope_tags?: string[], limit? }`
**Returns**: `{ items: Decision[] }`

`Decision`:
```ts
{
  id: string,
  team_id: string,
  scope_projects: string[],
  scope_tags: string[],
  title: string,
  rationale: string,
  alternatives_considered: string[],
  evidence_learning_ids: string[],
  evidence_fact_ids: string[],
  status: 'active' | 'rejected' | 'superseded',
  proposed_by_agent_id?: string,
  decision_event_at: string,
  created_at: string,
}
```

---

## Write intents

### `synapse.objective.publish`
Create an OKR (with optional KRs).

**Payload**:
```ts
{
  title: string,
  description?: string,
  scope_kind: 'org' | 'department' | 'project' | 'agent',
  scope_id: string,           // 'org', 'team.<slug>', 'project.<slug>', or 'agent.<slug>'
  project_id?: string,        // REQUIRED if scope_kind='project'; FORBIDDEN otherwise
  parent_objective_id?: string,
  owner_human_id?: string,
  alignment_description?: string,
  weight?: number,
  target_completion?: string,
  krs?: Array<{
    title: string,
    description?: string,
    position?: number,
    metric_target?: number,
    metric_direction?: 'up' | 'down',
    metric_unit?: string,
    metric_source?: string,
  }>,
}
```
**Returns**: `{ id: string, kr_ids: string[] }`

**Idempotency**: not idempotent by default. Pass `idempotency_key` (UUID) to dedupe.

**Constraint** (`objectives_scope_shape_check`): if `scope_kind` is anything other than `'project'`, omit `project_id`. The SDK enforces this.

### `synapse.objective.write`
Patch an existing OKR.

**Payload**: `{ id: string, patch: { title?, status?, owner_human_id?, parent_objective_id?, weight?, alignment_description?, target_completion? } }`
**Returns**: `{ id }`

**Cannot** patch `project_id` when `scope_kind != 'project'`. Use a separate `objective.publish` to re-scope; the SDK handles this.

### `synapse.decision.propose`
Record a decision the agent has already made.

**Payload**:
```ts
{
  title: string,
  rationale: string,
  team_id?: string,                // auto-resolves from scope_projects[0] if omitted
  scope_projects: string[],
  scope_tags: string[],
  alternatives_considered: string[],
  evidence_learning_ids: string[],
  evidence_fact_ids: string[],
  // Do NOT include status; it's hard-coded to 'active' server-side.
}
```
**Returns**: `{ id, status: 'active' }`

**HOOTL enforcement** — the server hard-codes `status='active'`. Per the header comment in `intents/decision.propose.ts`:
> "Despite the legacy `.propose` / `.record` path names, this is a journal entry — the decision is already taken — not a request for human sign-off. Records go straight to status='active'."

The SDK throws before the network call if you try to pass any status field.

### `synapse.decision.reject`
Operator-style interrupt on a codification.

**Payload**: `{ id: string, reason: string, rejected_by_human_id?: string }`
**Returns**: `{ id, status: 'rejected' }`

### `synapse.workflow.create`
Start a workflow.

**Payload**:
```ts
{
  workflow_class: string,
  title: string,
  project_id?: string,
  target_objective_id?: string,     // BIND HERE — checkins inherit
  inputs?: object,
  parent_id?: string,
}
```
**Returns**: `{ id }`

### `synapse.checkin`
Record an agent heartbeat / completion.

**Payload**:
```ts
{
  bd_id: string,                    // workflow id (historical naming)
  status: 'in_progress' | 'blocked' | 'completed' | 'failed',
  current_task?: string,
  payload?: object,
  used_learnings?: Array<string | { learning_id: string, outcome: 'resolved'|'did_not_resolve'|'unknown' }>,
  target_objective_id?: string,     // INHERITS from workflow if omitted (PR #177)
}
```
**Returns**: `{ id }`

### `synapse.fact.record`
**Payload**:
```ts
{
  project_id: string,
  bd_id?: string,                   // workflow id this fact emerged from
  claim: string,                    // atomic, single-claim
  applies_to: string[],             // tag list
  confidence: 'low' | 'medium' | 'high',
  evidence_artifact_id?: string,    // required at confidence >= medium
}
```
**Returns**: `{ id }`

### `synapse.learning.record`
**Payload**:
```ts
{
  project_id: string,
  bd_id?: string,
  claim: string,
  non_obvious_marker?: string,      // the wedge
  applies_to: string[],
  confidence: 'low' | 'medium' | 'high',
  evidence_artifact_id?: string,    // required at confidence >= medium
  used_learnings?: Array<string | { learning_id: string, outcome: ... }>,
}
```
**Returns**: `{ id }`

### `synapse.feedback.write`
**Payload**: `{ kind: string, subject: string, body: string, escalation_level?: 'info'|'warn'|'error', payload?: object }`
**Returns**: `{ id }`

### `synapse.choice.record`
**Payload**: `{ context: string, options: string[], chosen: string, rationale?: string, payload?: object }`
**Returns**: `{ id }`

### `synapse.assistance.route`
**Payload**: `{ requested_capability: string, context: string, priority?: 'low'|'normal'|'high' }`
**Returns**: `{ assigned_agent_id: string, brief_id?: string }`

### `synapse.brief.publish`
**Payload**: `{ target_agent_id: string, kind: 'coaching'|'contract'|'qa'|'notification', subject: string, body_markdown: string, payload?: object }`
**Returns**: `{ id }`

**Drift warning**: this intent may 404 on some orgs (specifically not registered on cnu as of 2026-06-10). The SDK falls back to direct Supabase REST insertion when it sees a 404.

---

## Fleet intents

### `synapse.agent.register`
Onboard a new agent.

**Payload**:
```ts
{
  id: string,                        // 'agent.<slug>-<role>'
  display_name: string,
  primary_team_id?: string,
  declared_capabilities?: string[],
  expected_scope_template?: string,
  is_platform?: boolean,             // default false
}
```
**Returns**: `{ id }`

### `synapse.enrollment.mint`
Issue a short-lived enrollment code.

**Payload**: `{ agent_id: string, scopes: string[], ttl_hours?: number }` (default 24h)
**Returns**: `{ code: string, expires_at: string }`

### `synapse.template.install`
Install or refresh agent templates from a manifest.

**Payload**: `{ template_name: string, ids: { team_id?, project_id?, agent_id?, ... } }`
**Returns**: `{ installed: string[] }`

---

## Artifact intents

### `synapse.artifact.upload`
**Payload**: `{ filename: string, mime_type: string, bytes_base64: string, description?: string, project_id?: string, applies_to?: string[] }`
**Returns**: `{ id, url?, sha256, size_bytes }`

**Limit**: 50 MB per file. Larger payloads return `413 payload_too_large`.

### `synapse.artifact.download`
**Payload**: `{ id: string }`
**Returns**: `{ filename, mime_type, bytes_base64, sha256 }`

### `synapse.artifact.reference`
**Payload**: `{ id: string }`
**Returns**: `{ id, url, mime_type, sha256, size_bytes }`

---

## Error codes you will encounter

| HTTP | `error` substring | Meaning |
|---|---|---|
| 400 | `invalid payload` | Zod parse failed; check `detail.zod_errors` |
| 401 | `unauthorized` | Bearer token missing or invalid |
| 403 | `forbidden: scope X required` | Token lacks the named scope |
| 404 | `unknown intent` | Intent not registered on this deploy (drift) |
| 404 | `record not found` | The id you targeted doesn't exist (or RLS filtered) |
| 409 | `conflict` | Idempotency key collision or constraint violation |
| 413 | `payload_too_large` | Artifact upload exceeded 50 MB |
| 429 | `rate_limited` | Too many requests; back off |
| 500 | `internal_error` | Server-side bug; check `detail.trace_id` and escalate |
