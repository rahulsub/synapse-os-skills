# Playbook: weekly digest

The Monday-morning report. Run weekly, or whenever the operator says *"how are we doing?"* and you don't have a more specific task to start from.

## Goal

Produce one screen of the org's state that an operator can read in 90 seconds:

- What moved this week.
- What's stuck.
- What you (the CoS) did about it.
- What (if anything) needs their interrupt.

## Procedure

### 1. Read

In parallel:

```ts
const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
const [admin, okrs, agents, checkins, decisions, learnings, feedback] = await Promise.all([
  org.intent('admin.read'),
  org.okrs.list({ status: 'active' }),
  org.agents.list({ is_platform: false, status: 'active' }),
  org.checkins.query({ since }),
  org.decisions.listRecent({ since, limit: 50 }),
  org.learnings.query({ since }),
  org.feedback.read({ status: 'open' }),
]);
```

### 2. Compute the five numbers

These are the only numbers on the digest. Resist adding more.

| # | Number | How to compute |
|---|---|---|
| 1 | **OKRs that moved** | Active OKRs whose KRs' `metric_current` changed in the last 7d |
| 2 | **OKRs that didn't move** | Active OKRs whose KRs are unchanged in 7d AND it's been ≥7d since last KR update |
| 3 | **Active agents** | Agents with ≥1 checkin in last 7d |
| 4 | **Silent agents** | Worker (non-platform) agents with 0 checkins in last 7d |
| 5 | **Decisions codified** | Count of `decisions.listRecent({since})` |

### 3. Identify the three concerning things

Apply the diagnostic-signal table from SKILL.md. Pick the **top three** by impact. Examples:

- *"3 worker agents in EduLLM-G6 have been silent for 9 days while the OKR target is 30 days away."*
- *"6 learnings on `prompt-engineering` across 3 projects — Loop 3 hasn't crystallized yet, I'm codifying now."*
- *"project.alphi has no active OKRs and no workflows — lead Jamie signed up but never set anything up."*

### 4. Act

For each concerning thing, apply the matching playbook:

- Silent agent → `coach-stalled-agent.md`
- Learning cluster → `codify-decision.md`
- Empty project → coaching brief to the lead (template below)

Do this **before** reporting. The report says what you did, not what you might do.

#### Empty-project coaching brief template

```ts
await org.briefs.publish({
  target_agent_id: leadAgent,    // or send to the project's primary agent
  kind: 'coaching',
  subject: `${projectName} has no OKRs or workflows yet — what's the plan?`,
  body_markdown: [
    `**What I see**`,
    `Your project ${projectName} has been active for ${daysSinceCreated} days but has 0 OKRs and 0 workflows. The fleet can't help you make progress on something it can't see.`,
    ``,
    `**What I'm suggesting**`,
    `Publish one OKR with one KR in the next 48h. It doesn't have to be the perfect goal — it has to be measurable and visible. You can revise later.`,
    ``,
    `**What I'm asking back**`,
    `Either publish the OKR, or send a feedback.write explaining what's blocking you. If nothing happens in 7 days I'll escalate to operator.`,
  ].join('\n'),
});
```

### 5. Report

Use this exact shape — operator pattern-matches on it:

```
# Weekly digest — <org slug> — <date>

## Numbers
- OKRs that moved this week: <n>
- OKRs that didn't move (≥7d): <n>
- Active agents: <n> / <total worker>
- Silent agents (no checkin 7d+): <n>
- Decisions codified: <n>

## Top three things I'm watching
1. <one-line observation>
2. <one-line observation>
3. <one-line observation>

## What I did this cycle
- <action 1>
- <action 2>
- <action 3>

## Needs your interrupt
<one of:>
- Nothing this cycle.
- <thing the operator must decide>
```

### 6. Persist the digest as a decision

Codify the digest as a decision with `scope_tags: ['weekly-digest', '<iso-week>']`. Why: it gives the operator a chronological record they can read forward in time, and gives you a "what did I report last week" memory for next cycle.

```ts
await org.decisions.propose({
  title: `Weekly digest — ${isoWeek}`,
  rationale: digestMarkdown,   // the full report
  alternatives_considered: ['No persistent record', 'Email only'],
  evidence_learning_ids: [],
  evidence_fact_ids: [],
  scope_projects: [],          // org-wide
  scope_tags: ['weekly-digest', isoWeek],
});
```

## Don'ts

- Don't pad the report with more numbers. Five is the limit.
- Don't list things you "could do." Decide and do, then report.
- Don't report on the work of platform agents — they're infra. Report on customer-owned worker agents.
- Don't repeat the prior week's concerns verbatim if nothing changed; instead flag that *no progress was made* and what you did about it.
