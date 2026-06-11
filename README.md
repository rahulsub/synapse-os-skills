# synapse-os-skills

Claude Code skills for operating a [Synapse OS](https://synapse-os.ai) organization instance.

Two skills:

- **`synapse-os`** — the transport layer. A typed TypeScript SDK + reference docs for the intent gateway. Use this to read or write any state in a Synapse OS org from an agent context.
- **`synapse-os-cos`** — a strategic Chief-of-Staff playbook layered on top. Weekly digests, coaching stalled agents, blocker trees, codifying decisions, calibrated escalations.

The Chief-of-Staff skill depends on the transport skill. Install both.

---

## What's a Synapse OS skill for?

Synapse OS is a multi-tenant AI agent platform. Each customer organization gets its own deployment — its own Supabase, its own Vercel app, its own dashboard at `<slug>.synapse-os.ai`. Every action goes through an intent gateway: `POST <dashboard_url>/v1/intent/<intent.name>` with a bearer admin token.

These skills let any Claude Code agent operate that gateway:

- **`synapse-os`** is the *how* — given a dashboard URL + admin token, here is the typed SDK, the intent contract, and the gotchas (HOOTL enforcement, scope-shape constraints, the brief.publish REST fallback for orgs where the intent isn't registered).
- **`synapse-os-cos`** is the *what to do* — given a fleet to manage, here is the cycle (read → diagnose → act → report) and the playbooks for the common situations.

---

## Install

The content (SKILL prompts, SDK, playbooks, examples) is agent-agnostic. Only the *discovery path* differs by harness.

### Claude Code

```bash
git clone https://github.com/rahulsub/synapse-os-skills.git ~/synapse-os-skills
cp -R ~/synapse-os-skills/skills/synapse-os    ~/.claude/skills/
cp -R ~/synapse-os-skills/skills/synapse-os-cos ~/.claude/skills/
```

Or symlink so you get updates with `git pull`:

```bash
git clone https://github.com/rahulsub/synapse-os-skills.git ~/synapse-os-skills
ln -s ~/synapse-os-skills/skills/synapse-os     ~/.claude/skills/synapse-os
ln -s ~/synapse-os-skills/skills/synapse-os-cos ~/.claude/skills/synapse-os-cos
```

Restart Claude Code (or run `/skills` in a new session) and confirm both appear.

### Codex (OpenAI CLI)

Codex doesn't auto-discover skills from a directory — it loads `AGENTS.md` from the repo root. Two options:

**Option A — drop into your project root + `AGENTS.md` pointer (recommended).**

```bash
cd ~/your-project
git clone https://github.com/rahulsub/synapse-os-skills.git .synapse-os-skills
```

Then add (or append to) `AGENTS.md` at your project root:

```markdown
## Synapse OS

This project interacts with a Synapse OS organization instance. Two skill bundles
are vendored at `.synapse-os-skills/skills/`:

- `.synapse-os-skills/skills/synapse-os/` — transport SDK + intent contract.
  Read `SKILL.md`, `vocabulary.md`, and `intent-contract.md` BEFORE making any
  intent call. Use the SDK at `synapse-os.ts`; never call the gateway directly.

- `.synapse-os-skills/skills/synapse-os-cos/` — Chief-of-Staff playbook. Read
  `SKILL.md` and the relevant `playbooks/*.md` before strategic org work
  (weekly digest, coaching, blocker trees, codifying decisions).

Both skills are agent-agnostic. The TypeScript SDK runs anywhere Node 18+ runs.
Set `SYNAPSE_ADMIN_TOKEN` (or `SYNAPSE_ADMIN_TOKEN_<ORG>`) before invoking.
```

Codex reads `AGENTS.md` on session start and will pull the skill files in as needed.

**Option B — paste the prompts into your Codex system prompt.**

If you don't want files in your repo, copy the contents of `skills/synapse-os/SKILL.md` and `skills/synapse-os-cos/SKILL.md` into your Codex system prompt, and load `vocabulary.md`, `intent-contract.md`, and `synapse-os.ts` as attached context when relevant.

### Any other agent / from-scratch script

Both skills are also just files. The SDK at `skills/synapse-os/synapse-os.ts` is a single TypeScript module with one `npm` dependency (`keytar`, optional — only needed for `fromKeychain`). Drop it into any TypeScript project and `import { SynapseOS } from './synapse-os'`. The `SKILL.md` and playbook docs are useful as system-prompt context for any LLM-driven agent.

---

## Quick start

```ts
import { SynapseOS } from './synapse-os';

const org = SynapseOS.fromEnv({
  dashboardUrl: 'https://your-org.synapse-os.ai',
  envVar: 'SYNAPSE_ADMIN_TOKEN',
});

// Read fleet state
const fleet  = await org.agents.list({ is_platform: false });
const active = await org.okrs.list({ status: 'active' });

// Publish an OKR
const { id } = await org.okrs.publish({
  title: 'Ship welcome-flow v2 by 2026-09-30',
  scope_kind: 'project',
  scope_id:   'project.synapse',
  project_id: 'project.synapse',
  owner_human_id: 'human.you',
  krs: [
    { title: 'TTV < 90s',        metric_target: 90, metric_direction: 'down', metric_unit: 's' },
    { title: 'Activation > 80%', metric_target: 80, metric_direction: 'up',   metric_unit: '%' },
  ],
});

// Codify a decision (status='active'; throws if you try 'proposed' — HOOTL contract)
await org.decisions.propose({
  title: 'Default to single-pass generation on 32B-class models',
  rationale: 'Multi-loop self-correction underperforms single-pass across G3/G6/IB.',
  alternatives_considered: ['Keep multi-loop', 'Different verifier'],
  evidence_learning_ids: ['<learning-id>'],
  evidence_fact_ids: [],
  scope_projects: ['project.edu-llm-g6'],
  scope_tags: ['prompt-engineering'],
});
```

For a complete Chief-of-Staff cycle (read → coach silent agents → codify clusters → report), see [`skills/synapse-os-cos/examples/cos-cycle.ts`](skills/synapse-os-cos/examples/cos-cycle.ts).

---

## Token handling

The SDK supports three token sources. Pick whichever matches your security posture.

```ts
// 1. Direct (test / one-off)
const org = new SynapseOS({ dashboardUrl, adminToken });

// 2. Env var (servers, CI)
const org = SynapseOS.fromEnv({ dashboardUrl, envVar: 'SYNAPSE_ADMIN_TOKEN_CNU' });

// 3. OS keychain (recommended on developer machines)
const org = await SynapseOS.fromKeychain({
  dashboardUrl,
  service: 'synapse-os',
  account: dashboardUrl,
});
```

The token is held in memory only and never logged. **Never paste it into a transcript, commit, or chat log.**

---

## What's enforced at the SDK boundary

The contract isn't just documented — it's wired in:

- **HOOTL** — `decisions.propose()` throws if you pass any `status` field. Decisions go to `'active'` immediately, never `'proposed'`.
- **Scope-shape** — `okrs.publish()` throws if `scope_kind != 'project'` and you set `project_id` (mirrors the `objectives_scope_shape_check` SQL constraint).
- **Evidence-required** — `facts.record()` and `learnings.record()` throw if `confidence` is `'medium'` or `'high'` and `evidence_artifact_id` is missing.
- **Pagination by default** — list calls walk every cursor. No silent 1000-row truncation.
- **`synapse.` prefix** — auto-applied to intent names so `okrs.publish` always hits `/v1/intent/synapse.objective.publish`, not the unprefixed 404 path.
- **Brief-publish fallback** — on orgs where `synapse.brief.publish` isn't registered, the SDK falls back to direct Supabase REST insertion (requires `supabase: { projectRef, serviceRoleKey }` at construction).

---

## Layout

```
skills/
├── synapse-os/
│   ├── SKILL.md            # the prompt — when to use, mental model, safety rules
│   ├── vocabulary.md       # full glossary (~30 domain terms)
│   ├── intent-contract.md  # per-intent request/response shapes + errors
│   ├── synapse-os.ts       # the SDK
│   └── examples/
│       ├── read-fleet.ts
│       ├── publish-okr.ts
│       ├── record-knowledge.ts
│       └── send-brief.ts
└── synapse-os-cos/
    ├── SKILL.md            # CoS contract, 4-phase cycle, anti-patterns
    ├── playbooks/
    │   ├── weekly-digest.md
    │   ├── coach-stalled-agent.md
    │   ├── blocker-tree.md
    │   ├── codify-decision.md
    │   └── escalation.md
    └── examples/
        └── cos-cycle.ts    # end-to-end CoS cycle
```

---

## Versioning

The SDK has a runtime `health()` call. On first use against a new org, call it and check the gateway version — `intent-contract.md` records the version the SDK was last validated against. A 404 on a previously-working intent generally means deploy drift, not a real failure; the SDK warns and the caller decides whether to fall back or escalate.

---

## License

MIT
