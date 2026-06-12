/**
 * Synapse OS SDK — typed client for the per-org intent gateway.
 *
 * Usage:
 *   import { SynapseOS } from './synapse-os';
 *   const cnu = await SynapseOS.fromEnv({
 *     dashboardUrl: 'https://cnu.synapse-os.ai',
 *     envVar: 'SYNAPSE_ADMIN_TOKEN_CNU',
 *   });
 *   const fleet = await cnu.agents.list({ is_platform: false });
 *
 * Contract:
 *   - One client = one org. Construct one per org per session.
 *   - Token is held in memory only. Never logged, never serialized.
 *   - Throws on HOOTL violations (decision.propose with status='proposed', etc.)
 *     BEFORE the network call.
 *   - Falls back to direct Supabase REST for known-missing intents (brief.publish
 *     on cnu, e.g.) when configured with a supabase project ref + service-role key.
 */

// ---------------------------------------------------------------------------
// Domain types (mirror intent-contract.md)
// ---------------------------------------------------------------------------

export type Confidence = 'low' | 'medium' | 'high';
export type DOKGrade = '1' | '2' | '3' | 'ungraded';
export type ObjectiveStatus = 'active' | 'achieved' | 'abandoned' | 'superseded';
export type MilestoneStatus = 'pending' | 'achieved' | 'abandoned';
export type ScopeKind = 'org' | 'department' | 'project' | 'agent';
export type WorkflowStatus = 'active' | 'completed' | 'failed' | 'cancelled';
export type CheckinStatus = 'in_progress' | 'blocked' | 'completed' | 'failed';
export type BriefKind = 'coaching' | 'contract' | 'qa' | 'notification';
export type DecisionStatus = 'active' | 'rejected' | 'superseded';

/**
 * Conventional defaults for `Shipment.kind`. Freeform by design — agents may
 * invent a custom value when none of these fits. See SOUL.md guidance in the
 * synapse-fixer / chief-of-staff templates for the contract.
 */
export const SHIPMENT_KIND_DEFAULTS = [
  'code',           // PR merged, deployed feature, infra change
  'content',        // curriculum unit, blog post, deck, written artifact
  'model',          // trained checkpoint promoted, eval baseline shipped
  'doc',            // documentation page, AGENTS.md update, runbook
  'customer_comm',  // customer email/DM sent, support reply
  'capability',     // automated process turned on, integration live
] as const;
export type ShipmentKindDefault = typeof SHIPMENT_KIND_DEFAULTS[number];
/** Accepts the conventional defaults with autocomplete; falls through to string for custom kinds. */
export type ShipmentKind = ShipmentKindDefault | (string & {});

export interface Shipment {
  id: string;
  agent_id: string;
  project_id?: string;
  workflow_id?: string;
  kind: ShipmentKind;
  reference: string;
  outcome_summary: string;
  evidence_artifact_ids: string[];
  created_at: string;
}

export interface Objective {
  id: string;
  title: string;
  description?: string;
  status: ObjectiveStatus;
  scope_kind: ScopeKind;
  scope_id: string;
  project_id?: string;
  owner_human_id?: string;
  parent_objective_id?: string;
  alignment_description?: string;
  weight?: number;
  target_completion?: string;
  created_at: string;
}

export interface Milestone {
  id: string;
  objective_id: string;
  title: string;
  position?: number;
  status: MilestoneStatus;
  metric_target?: number;
  metric_current?: number;
  metric_direction?: 'up' | 'down';
  metric_unit?: string;
  metric_source?: string;
  achieved_at?: string;
}

export interface Workflow {
  id: string;
  agent_id: string;
  project_id?: string;
  workflow_class: string;
  title: string;
  status: WorkflowStatus;
  inputs?: Record<string, unknown>;
  parent_id?: string;
  target_objective_id?: string;
  created_at: string;
  closed_at?: string;
}

export interface Checkin {
  id: string;
  agent_id: string;
  project_id?: string;
  bd_id?: string;
  status: CheckinStatus;
  current_task?: string;
  payload?: Record<string, unknown>;
  target_objective_id?: string;
  created_at: string;
}

export interface Agent {
  id: string;
  display_name: string;
  primary_team_id?: string;
  status: 'active' | 'archived';
  is_platform: boolean;
  declared_capabilities?: string[];
  earned_capabilities?: string[];
  evidence_n?: number;
  evidence_alpha?: number;
  evidence_beta?: number;
  expected_scope_template?: string;
  archived_at?: string;
  archived_reason?: string;
  created_at: string;
}

export interface Fact {
  id: string;
  agent_id: string;
  project_id: string;
  claim: string;
  applies_to: string[];
  confidence: Confidence;
  dok_grade: '1' | 'ungraded';
  evidence_artifact_id?: string;
  status: 'active' | 'rejected';
  judgment_reason?: string;
  created_at: string;
}

export interface Learning {
  id: string;
  agent_id: string;
  project_id: string;
  claim: string;
  non_obvious_marker?: string;
  applies_to: string[];
  confidence: Confidence;
  dok_grade: '2' | '3' | 'ungraded';
  evidence_artifact_id?: string;
  used_learnings?: { learning_id: string; outcome: 'resolved' | 'did_not_resolve' | 'unknown' }[];
  status: 'active' | 'rejected';
  judgment_reason?: string;
  created_at: string;
}

export interface Brief {
  id: string;
  author_agent_id?: string;
  author_human_id?: string;
  target_agent_id: string;
  kind: BriefKind;
  subject: string;
  body_markdown: string;
  payload?: Record<string, unknown>;
  ack_at?: string;
  created_at: string;
}

export interface Decision {
  id: string;
  team_id: string;
  scope_projects: string[];
  scope_tags: string[];
  title: string;
  rationale: string;
  alternatives_considered: string[];
  evidence_learning_ids: string[];
  evidence_fact_ids: string[];
  status: DecisionStatus;
  proposed_by_agent_id?: string;
  decision_event_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Construction options
// ---------------------------------------------------------------------------

export interface SynapseOSOptions {
  dashboardUrl: string;
  adminToken: string;
  agentId?: string;
  fetch?: typeof fetch;
  /** Optional supabase escape hatch for known-missing intents. */
  supabase?: {
    projectRef: string;
    serviceRoleKey: string;
  };
  /** Default page size for list calls. Defaults to 200. */
  pageSize?: number;
}

export interface FromEnvOptions {
  dashboardUrl: string;
  envVar?: string;
  agentId?: string;
  fetch?: typeof fetch;
  supabase?: SynapseOSOptions['supabase'];
}

export interface FromKeychainOptions {
  dashboardUrl: string;
  service?: string;
  account?: string;
  agentId?: string;
  fetch?: typeof fetch;
  supabase?: SynapseOSOptions['supabase'];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SynapseError extends Error {
  constructor(
    message: string,
    public readonly intent: string,
    public readonly httpStatus?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'SynapseError';
  }
}

export class SynapseHOOTLError extends SynapseError {
  constructor(message: string, intent: string) {
    super(message, intent);
    this.name = 'SynapseHOOTLError';
  }
}

export class SynapseScopeShapeError extends SynapseError {
  constructor(message: string, intent: string) {
    super(message, intent);
    this.name = 'SynapseScopeShapeError';
  }
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export class SynapseOS {
  readonly dashboardUrl: string;
  readonly agentId: string;
  readonly pageSize: number;

  private readonly _token: string;
  private readonly _fetch: typeof fetch;
  private readonly _supabase?: SynapseOSOptions['supabase'];

  readonly okrs: OKRsCluster;
  readonly agents: AgentsCluster;
  readonly workflows: WorkflowsCluster;
  readonly checkins: CheckinsCluster;
  readonly decisions: DecisionsCluster;
  readonly facts: FactsCluster;
  readonly learnings: LearningsCluster;
  readonly artifacts: ArtifactsCluster;
  readonly briefs: BriefsCluster;
  readonly feedback: FeedbackCluster;
  readonly assistance: AssistanceCluster;
  readonly choices: ChoicesCluster;
  readonly templates: TemplatesCluster;
  readonly fleet: FleetCluster;
  readonly shipments: ShipmentsCluster;

  constructor(opts: SynapseOSOptions) {
    if (!opts.dashboardUrl) throw new Error('dashboardUrl required');
    if (!opts.adminToken) throw new Error('adminToken required');

    this.dashboardUrl = opts.dashboardUrl.replace(/\/+$/, '');
    this.agentId = opts.agentId ?? this._deriveAdminAgentId();
    this._token = opts.adminToken;
    this._fetch = opts.fetch ?? fetch;
    this._supabase = opts.supabase;
    this.pageSize = opts.pageSize ?? 200;

    this.okrs = new OKRsCluster(this);
    this.agents = new AgentsCluster(this);
    this.workflows = new WorkflowsCluster(this);
    this.checkins = new CheckinsCluster(this);
    this.decisions = new DecisionsCluster(this);
    this.facts = new FactsCluster(this);
    this.learnings = new LearningsCluster(this);
    this.artifacts = new ArtifactsCluster(this);
    this.briefs = new BriefsCluster(this);
    this.feedback = new FeedbackCluster(this);
    this.assistance = new AssistanceCluster(this);
    this.choices = new ChoicesCluster(this);
    this.templates = new TemplatesCluster(this);
    this.fleet = new FleetCluster(this);
    this.shipments = new ShipmentsCluster(this);
  }

  static fromEnv(opts: FromEnvOptions): SynapseOS {
    const envVar = opts.envVar ?? 'SYNAPSE_ADMIN_TOKEN';
    const adminToken = process.env[envVar];
    if (!adminToken) {
      throw new Error(
        `Env var ${envVar} not set. Export it or use a different envVar option.`,
      );
    }
    return new SynapseOS({
      dashboardUrl: opts.dashboardUrl,
      adminToken,
      agentId: opts.agentId,
      fetch: opts.fetch,
      supabase: opts.supabase,
    });
  }

  static async fromKeychain(opts: FromKeychainOptions): Promise<SynapseOS> {
    const service = opts.service ?? 'synapse-os';
    const account = opts.account ?? opts.dashboardUrl;
    let adminToken: string | null;
    try {
      const keytar = await import('keytar');
      adminToken = await keytar.default.getPassword(service, account);
    } catch (err) {
      throw new Error(
        `Keychain read failed (${(err as Error).message}). Install 'keytar' or use fromEnv/direct.`,
      );
    }
    if (!adminToken) {
      throw new Error(
        `No keychain entry for service='${service}' account='${account}'.`,
      );
    }
    return new SynapseOS({
      dashboardUrl: opts.dashboardUrl,
      adminToken,
      agentId: opts.agentId,
      fetch: opts.fetch,
      supabase: opts.supabase,
    });
  }

  // -------------------------------------------------------------------------
  // Core HTTP
  // -------------------------------------------------------------------------

  /**
   * Low-level intent call. Prefer the typed cluster methods (this.okrs.publish, etc.)
   * over this. Use intent() only for intents not yet wrapped by the SDK.
   *
   * Automatically prefixes 'synapse.' if missing.
   */
  async intent<T = unknown>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
    const fullName = name.startsWith('synapse.') ? name : `synapse.${name}`;
    const url = `${this.dashboardUrl}/v1/intent/${fullName}`;

    const res = await this._fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this._token}`,
      },
      body: JSON.stringify(payload),
    });

    let body: { ok?: boolean; data?: T; error?: string; detail?: unknown };
    try {
      body = await res.json();
    } catch {
      throw new SynapseError(
        `${fullName}: non-JSON response (HTTP ${res.status})`,
        fullName,
        res.status,
      );
    }

    if (!res.ok || body.ok === false) {
      throw new SynapseError(
        `${fullName}: ${body.error ?? `HTTP ${res.status}`}`,
        fullName,
        res.status,
        body.detail,
      );
    }

    return body.data as T;
  }

  /**
   * Health check + drift detection. Returns gateway version + reachability.
   */
  async health(): Promise<{ ok: boolean; gateway_version?: string }> {
    try {
      const res = await this._fetch(`${this.dashboardUrl}/v1/health`);
      if (!res.ok) return { ok: false };
      const body = (await res.json()) as { gateway_version?: string };
      return { ok: true, gateway_version: body.gateway_version };
    } catch {
      return { ok: false };
    }
  }

  // -------------------------------------------------------------------------
  // Supabase REST escape hatch
  // -------------------------------------------------------------------------

  /**
   * Direct PostgREST insert. Use only when an intent is known-missing and the
   * SDK has explicitly mapped a fallback. Do NOT use for arbitrary writes —
   * that bypasses validation, audit, and trust scoring.
   */
  async _supabaseInsert<T = unknown>(table: string, row: Record<string, unknown>): Promise<T> {
    if (!this._supabase) {
      throw new SynapseError(
        `Supabase REST fallback requested for '${table}' but no supabase credentials were configured. ` +
          `Pass { supabase: { projectRef, serviceRoleKey } } when constructing the client.`,
        `supabase.${table}.insert`,
      );
    }
    const url = `https://${this._supabase.projectRef}.supabase.co/rest/v1/${table}`;
    const res = await this._fetch(url, {
      method: 'POST',
      headers: {
        apikey: this._supabase.serviceRoleKey,
        Authorization: `Bearer ${this._supabase.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      throw new SynapseError(
        `supabase.${table}: HTTP ${res.status}`,
        `supabase.${table}.insert`,
        res.status,
        await res.text(),
      );
    }
    const body = (await res.json()) as T[];
    return body[0] as T;
  }

  private _deriveAdminAgentId(): string {
    // dashboardUrl like https://cnu.synapse-os.ai → agent.cnu-admin
    try {
      const host = new URL(this.dashboardUrl).hostname;
      const slug = host.split('.')[0];
      return `agent.${slug}-admin`;
    } catch {
      return 'agent.admin';
    }
  }
}

// ---------------------------------------------------------------------------
// Capability clusters
// ---------------------------------------------------------------------------

class OKRsCluster {
  constructor(private readonly c: SynapseOS) {}

  async list(opts: {
    status?: ObjectiveStatus;
    scope_kind?: ScopeKind;
    scope_id?: string;
    project_id?: string;
    owner_human_id?: string;
    parent_objective_id?: string;
    limit?: number;
  } = {}): Promise<Objective[]> {
    return this._paginate('objective.read', opts);
  }

  async get(id: string): Promise<Objective | null> {
    const all = await this.c.intent<{ items: Objective[] }>('objective.read', { id });
    return all.items[0] ?? null;
  }

  async publish(opts: {
    title: string;
    description?: string;
    scope_kind: ScopeKind;
    scope_id: string;
    project_id?: string;
    parent_objective_id?: string;
    owner_human_id?: string;
    alignment_description?: string;
    weight?: number;
    target_completion?: string;
    krs?: Array<{
      title: string;
      description?: string;
      position?: number;
      metric_target?: number;
      metric_direction?: 'up' | 'down';
      metric_unit?: string;
      metric_source?: string;
    }>;
    idempotency_key?: string;
  }): Promise<{ id: string; kr_ids: string[] }> {
    if (opts.scope_kind !== 'project' && opts.project_id) {
      throw new SynapseScopeShapeError(
        `objective.publish: scope_kind='${opts.scope_kind}' but project_id was set. ` +
          `Non-project-scoped OKRs cannot carry project_id (objectives_scope_shape_check).`,
        'objective.publish',
      );
    }
    if (opts.scope_kind === 'project' && !opts.project_id) {
      throw new SynapseScopeShapeError(
        `objective.publish: scope_kind='project' requires project_id.`,
        'objective.publish',
      );
    }
    return this.c.intent('objective.publish', opts);
  }

  async patch(id: string, patch: {
    title?: string;
    status?: ObjectiveStatus;
    owner_human_id?: string;
    parent_objective_id?: string;
    weight?: number;
    alignment_description?: string;
    target_completion?: string;
  }): Promise<{ id: string }> {
    return this.c.intent('objective.write', { id, patch });
  }

  /**
   * Re-scope an OKR. The constraint forbids changing project_id in the same
   * UPDATE as anything else when scope_kind != 'project', so we split into
   * separate calls.
   */
  async rescope(id: string, newProjectId: string): Promise<{ id: string }> {
    return this.c.intent('objective.write', { id, patch: { project_id: newProjectId } });
  }

  async listKRs(objectiveId: string): Promise<Milestone[]> {
    const out = await this.c.intent<{ items: Milestone[] }>('milestone.list', {
      objective_id: objectiveId,
      limit: this.c.pageSize,
    });
    return out.items;
  }

  private async _paginate<T>(intent: string, opts: Record<string, unknown>): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await this.c.intent<{ items: T[]; next_cursor?: string }>(intent, {
        ...opts,
        limit: this.c.pageSize,
        cursor,
      });
      out.push(...page.items);
      cursor = page.next_cursor;
      pages += 1;
      if (pages > 100) throw new SynapseError(`${intent}: pagination runaway (>100 pages)`, intent);
    } while (cursor);
    return out;
  }
}

class AgentsCluster {
  constructor(private readonly c: SynapseOS) {}

  async list(opts: {
    status?: 'active' | 'archived';
    is_platform?: boolean;
    primary_team_id?: string;
  } = {}): Promise<Agent[]> {
    return paginate<Agent>(this.c, 'agent.directory', opts);
  }

  async register(opts: {
    id: string;
    display_name: string;
    primary_team_id?: string;
    declared_capabilities?: string[];
    expected_scope_template?: string;
    is_platform?: boolean;
  }): Promise<{ id: string }> {
    return this.c.intent('agent.register', opts);
  }

  async archive(id: string, reason: string): Promise<{ id: string }> {
    return this.c.intent('agent.archive', { id, reason });
  }
}

class WorkflowsCluster {
  constructor(private readonly c: SynapseOS) {}

  async list(opts: {
    status?: WorkflowStatus;
    agent_id?: string;
    project_id?: string;
  } = {}): Promise<Workflow[]> {
    return paginate<Workflow>(this.c, 'workflow.list', opts);
  }

  async get(id: string): Promise<Workflow | null> {
    try {
      return await this.c.intent<Workflow>('workflow.get', { id });
    } catch (err) {
      if (err instanceof SynapseError && err.httpStatus === 404) return null;
      throw err;
    }
  }

  async create(opts: {
    workflow_class: string;
    title: string;
    project_id?: string;
    target_objective_id?: string;
    inputs?: Record<string, unknown>;
    parent_id?: string;
  }): Promise<{ id: string }> {
    return this.c.intent('workflow.create', opts);
  }
}

class CheckinsCluster {
  constructor(private readonly c: SynapseOS) {}

  async query(opts: {
    agent_id?: string;
    project_id?: string;
    since?: string;
    limit?: number;
  } = {}): Promise<Checkin[]> {
    return paginate<Checkin>(this.c, 'checkin.query', opts);
  }

  async record(opts: {
    bd_id: string;
    status: CheckinStatus;
    current_task?: string;
    payload?: Record<string, unknown>;
    used_learnings?: Array<string | { learning_id: string; outcome: 'resolved' | 'did_not_resolve' | 'unknown' }>;
    target_objective_id?: string;
  }): Promise<{ id: string }> {
    return this.c.intent('checkin', opts);
  }
}

class DecisionsCluster {
  constructor(private readonly c: SynapseOS) {}

  async listRecent(opts: { since?: string; scope_tags?: string[]; limit?: number } = {}): Promise<Decision[]> {
    const out = await this.c.intent<{ items: Decision[] }>('admin.decisions', opts);
    return out.items;
  }

  /**
   * Record a decision the agent has already made. Status is hard-coded to
   * 'active' server-side; passing any other status throws before the network
   * call (HOOTL enforcement).
   */
  async propose(opts: {
    title: string;
    rationale: string;
    team_id?: string;
    scope_projects: string[];
    scope_tags: string[];
    alternatives_considered: string[];
    evidence_learning_ids: string[];
    evidence_fact_ids: string[];
  } & { status?: never }): Promise<{ id: string; status: 'active' }> {
    if ('status' in opts && (opts as Record<string, unknown>).status !== undefined) {
      throw new SynapseHOOTLError(
        `decision.propose: 'status' must not be passed. Decisions are journaled directly to 'active' (HOOTL contract).`,
        'decision.propose',
      );
    }
    return this.c.intent('decision.propose', opts);
  }

  /**
   * Interrupt a codification. Operator-initiated; confirm before calling.
   */
  async reject(id: string, reason: string, rejected_by_human_id?: string): Promise<{ id: string }> {
    return this.c.intent('decision.reject', { id, reason, rejected_by_human_id });
  }
}

class FactsCluster {
  constructor(private readonly c: SynapseOS) {}

  async query(opts: {
    project_id?: string;
    agent_id?: string;
    applies_to?: string[];
    confidence?: Confidence;
    status?: 'active' | 'rejected';
    since?: string;
  } = {}): Promise<Fact[]> {
    return paginate<Fact>(this.c, 'fact.query', opts);
  }

  async record(opts: {
    project_id: string;
    bd_id?: string;
    claim: string;
    applies_to: string[];
    confidence: Confidence;
    evidence_artifact_id?: string;
  }): Promise<{ id: string }> {
    if ((opts.confidence === 'medium' || opts.confidence === 'high') && !opts.evidence_artifact_id) {
      throw new SynapseError(
        `fact.record: confidence='${opts.confidence}' requires evidence_artifact_id. ` +
          `Upload an artifact first via client.artifacts.upload().`,
        'fact.record',
      );
    }
    return this.c.intent('fact.record', opts);
  }
}

class LearningsCluster {
  constructor(private readonly c: SynapseOS) {}

  async query(opts: {
    project_id?: string;
    agent_id?: string;
    applies_to?: string[];
    confidence?: Confidence;
    dok_grade?: DOKGrade;
    status?: 'active' | 'rejected';
    since?: string;
  } = {}): Promise<Learning[]> {
    return paginate<Learning>(this.c, 'learning.query', opts);
  }

  async record(opts: {
    project_id: string;
    bd_id?: string;
    claim: string;
    non_obvious_marker?: string;
    applies_to: string[];
    confidence: Confidence;
    evidence_artifact_id?: string;
    used_learnings?: Array<string | { learning_id: string; outcome: 'resolved' | 'did_not_resolve' | 'unknown' }>;
  }): Promise<{ id: string }> {
    if ((opts.confidence === 'medium' || opts.confidence === 'high') && !opts.evidence_artifact_id) {
      throw new SynapseError(
        `learning.record: confidence='${opts.confidence}' requires evidence_artifact_id.`,
        'learning.record',
      );
    }
    return this.c.intent('learning.record', opts);
  }
}

class ArtifactsCluster {
  constructor(private readonly c: SynapseOS) {}

  async upload(opts: {
    filename: string;
    mime_type: string;
    bytes: Uint8Array;
    description?: string;
    project_id?: string;
    applies_to?: string[];
  }): Promise<{ id: string; sha256: string; size_bytes: number; url?: string }> {
    if (opts.bytes.byteLength > 50 * 1024 * 1024) {
      throw new SynapseError(
        `artifact.upload: ${opts.filename} is ${opts.bytes.byteLength} bytes; cap is 50 MB.`,
        'artifact.upload',
      );
    }
    const bytes_base64 = bytesToBase64(opts.bytes);
    return this.c.intent('artifact.upload', {
      filename: opts.filename,
      mime_type: opts.mime_type,
      bytes_base64,
      description: opts.description,
      project_id: opts.project_id,
      applies_to: opts.applies_to,
    });
  }

  async download(id: string): Promise<{ filename: string; mime_type: string; bytes: Uint8Array; sha256: string }> {
    const out = await this.c.intent<{ filename: string; mime_type: string; bytes_base64: string; sha256: string }>(
      'artifact.download',
      { id },
    );
    return { ...out, bytes: base64ToBytes(out.bytes_base64) };
  }

  async reference(id: string): Promise<{ id: string; url: string; mime_type: string; sha256: string; size_bytes: number }> {
    return this.c.intent('artifact.reference', { id });
  }
}

class BriefsCluster {
  constructor(private readonly c: SynapseOS) {}

  async fetch(opts: {
    target_agent_id: string;
    since?: string;
    kind?: BriefKind;
    limit?: number;
  }): Promise<Brief[]> {
    const out = await this.c.intent<{ items: Brief[] }>('brief.fetch', opts);
    return out.items;
  }

  /**
   * Publish a brief. On orgs where `synapse.brief.publish` is not registered
   * (cnu as of 2026-06-10), falls back to direct Supabase REST insertion if
   * the client was constructed with supabase credentials.
   */
  async publish(opts: {
    target_agent_id: string;
    kind: BriefKind;
    subject: string;
    body_markdown: string;
    payload?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    try {
      return await this.c.intent('brief.publish', opts);
    } catch (err) {
      if (err instanceof SynapseError && err.httpStatus === 404) {
        return this.c._supabaseInsert<{ id: string }>('briefs', {
          target_agent_id: opts.target_agent_id,
          kind: opts.kind,
          subject: opts.subject,
          body_markdown: opts.body_markdown,
          payload: opts.payload ?? null,
          author_agent_id: this.c.agentId,
        });
      }
      throw err;
    }
  }
}

class FeedbackCluster {
  constructor(private readonly c: SynapseOS) {}

  async read(opts: { status?: 'open' | 'acknowledged' | 'resolved'; kind?: string; limit?: number } = {}): Promise<unknown[]> {
    const out = await this.c.intent<{ items: unknown[] }>('feedback.read', opts);
    return out.items;
  }

  async write(opts: {
    kind: string;
    subject: string;
    body: string;
    escalation_level?: 'info' | 'warn' | 'error';
    payload?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return this.c.intent('feedback.write', opts);
  }
}

class AssistanceCluster {
  constructor(private readonly c: SynapseOS) {}

  async route(opts: {
    requested_capability: string;
    context: string;
    priority?: 'low' | 'normal' | 'high';
  }): Promise<{ assigned_agent_id: string; brief_id?: string }> {
    return this.c.intent('assistance.route', opts);
  }
}

class ChoicesCluster {
  constructor(private readonly c: SynapseOS) {}

  async record(opts: {
    context: string;
    options: string[];
    chosen: string;
    rationale?: string;
    payload?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return this.c.intent('choice.record', opts);
  }
}

class TemplatesCluster {
  constructor(private readonly c: SynapseOS) {}

  async install(opts: {
    template_name: string;
    ids: Record<string, string>;
  }): Promise<{ installed: string[] }> {
    return this.c.intent('template.install', opts);
  }
}

class FleetCluster {
  constructor(private readonly c: SynapseOS) {}

  async mintEnrollment(opts: {
    agent_id: string;
    scopes: string[];
    ttl_hours?: number;
  }): Promise<{ code: string; expires_at: string }> {
    return this.c.intent('enrollment.mint', opts);
  }

  async revokeEnrollment(code: string): Promise<{ revoked: true }> {
    return this.c.intent('enrollment.revoke', { code });
  }
}

class ShipmentsCluster {
  constructor(private readonly c: SynapseOS) {}

  /**
   * Record output the agent produced. Workflow completion is NOT a ship —
   * use this when something concrete went out (PR merged, deploy live,
   * model checkpoint promoted, customer email sent, etc.).
   *
   * Prefer a value from SHIPMENT_KIND_DEFAULTS when one fits. Custom kinds
   * are allowed and intentional — use the same lowercase, hyphenated string
   * every time you ship that class of thing, so the kind acts as a stable
   * aggregation key. Briefly explain the choice in `outcome_summary`.
   */
  async record(opts: {
    kind: ShipmentKind;
    reference: string;
    outcome_summary: string;
    project_id?: string;
    workflow_id?: string;
    evidence_artifact_ids?: string[];
  }): Promise<{ shipment_id: string }> {
    if (!opts.kind || opts.kind.trim() === '') {
      throw new SynapseError('shipment.record: kind required', 'shipment.record');
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(opts.kind)) {
      throw new SynapseError(
        `shipment.record: kind '${opts.kind}' must be lowercase ASCII, optionally with hyphens/underscores, starting with a letter`,
        'shipment.record',
      );
    }
    if (!opts.reference || opts.reference.trim() === '') {
      throw new SynapseError('shipment.record: reference required', 'shipment.record');
    }
    if (!opts.outcome_summary || opts.outcome_summary.trim() === '') {
      throw new SynapseError('shipment.record: outcome_summary required', 'shipment.record');
    }
    return this.c.intent('shipment.record', opts);
  }

  /**
   * Query shipments. Defaults to the last 7 days of the caller's scope.
   * Admin-scoped callers can read across the org; non-admin callers see
   * only shipments tied to projects under their primary team.
   */
  async query(opts: {
    project_id?: string;
    agent_id?: string;
    kind?: string;
    workflow_id?: string;
    since?: string;
    limit?: number;
  } = {}): Promise<Shipment[]> {
    const out = await this.c.intent<{ shipments: Shipment[] }>('shipment.query', opts);
    return out.shipments;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function paginate<T>(
  client: SynapseOS,
  intent: string,
  opts: Record<string, unknown>,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await client.intent<{ items: T[]; next_cursor?: string }>(intent, {
      ...opts,
      limit: client.pageSize,
      cursor,
    });
    out.push(...page.items);
    cursor = page.next_cursor;
    pages += 1;
    if (pages > 100) throw new SynapseError(`${intent}: pagination runaway (>100 pages)`, intent);
  } while (cursor);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i += 1) bin += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  // eslint-disable-next-line no-undef
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
