# Playbook: coach a stalled agent

An agent is alive (`status='active'`) but not producing — no checkins in 7+ days, or KRs unchanged in 14+ days, or checkins are all `status='blocked'` with no resolution.

## Why this playbook exists

Stall is the most common failure mode in a customer fleet. The agent isn't broken; it's drifting. The CoS's job is to name the drift and offer one concrete next step. Most stalls resolve after a single coaching brief.

## Procedure

### 1. Confirm the stall is real

Three checks. If any one fails the stall test, skip — this is a false positive.

```ts
const sevenDaysAgo = isoDaysAgo(7);
const fourteenDaysAgo = isoDaysAgo(14);

// Check 1: no checkins in 7 days
const recent = await org.checkins.query({ agent_id, since: sevenDaysAgo, limit: 1 });
const silent = recent.length === 0;

// Check 2: KRs the agent's OKRs depend on are stuck
const agentOkrs = await org.okrs.list({ scope_kind: 'agent', scope_id: agent_id });
const stuckKrs = [];
for (const okr of agentOkrs) {
  const krs = await org.okrs.listKRs(okr.id);
  for (const kr of krs) {
    if (kr.status === 'pending' && !kr.achieved_at) {
      stuckKrs.push({ okr, kr });
    }
  }
}

// Check 3: open blocked checkins with no follow-up
const blocked = (await org.checkins.query({ agent_id, since: fourteenDaysAgo }))
  .filter(c => c.status === 'blocked');
```

### 2. Diagnose why

Don't send the brief blind. Read the agent's last 5 checkins and last 5 learnings to understand the texture.

```ts
const lastCheckins = await org.checkins.query({ agent_id, limit: 5 });
const lastLearnings = await org.learnings.query({ agent_id, limit: 5 });
```

Match against these patterns:

| Pattern | What to coach |
|---|---|
| Last checkin says "blocked on X" and X hasn't been resolved | Brief: "What did you try? Should we route to assistance?" |
| All checkins are `in_progress` but no `completed` | Brief: "Are you stuck on the definition of done? Let's tighten the KR." |
| Learnings are accumulating but KRs aren't moving | Brief: "You're learning but not shipping — what's the smallest action that would move KR<n>?" |
| No checkins, no learnings, just silence | Brief: "I haven't heard from you in 7+ days — are you stuck, paused, or done?" |
| Agent has KRs but no workflows | Brief: "What's the workflow that moves your KR? Create one with workflow.create." |

### 3. Send the brief

Use this template; fill in the diagnosis from step 2.

```ts
await org.briefs.publish({
  target_agent_id: agent_id,
  kind: 'coaching',
  subject: `<one-line stall description>`,
  body_markdown: [
    `**What I see**`,
    `<2-3 lines of concrete observation: last checkin date, stuck KR titles, blocker text>`,
    ``,
    `**What I'm suggesting**`,
    `<one concrete next step the agent can take this session>`,
    ``,
    `**What I'm asking back**`,
    `<one of: "send a checkin within 24h" / "call assistance.route for X" / "publish a workflow"> If I don't hear from you in 7 days I'll escalate to feedback.`,
  ].join('\n'),
  payload: {
    coach_reason: 'silent_7d', // or 'stuck_kr_14d' / 'blocked_no_followup' / 'learnings_no_kr_movement'
    related_okr_ids: stuckKrs.map(s => s.okr.id),
    related_kr_ids: stuckKrs.map(s => s.kr.id),
  },
});
```

### 4. Set the escalation timer

Track the agent + brief id so next cycle you can check whether the agent responded. The conventional path is:

- Day 0: coaching brief.
- Day 7: if still silent, second brief at `kind: 'coaching'` with subject *"still quiet — what's going on?"*
- Day 14: if still silent, `feedback.write({ kind: 'agent_stalled', escalation_level: 'warn' })` so the operator sees it in their inbox.

Persist the day-0 brief id in your decision log so next cycle's CoS run can pick it up.

### 5. Codify if a pattern emerges

If you find yourself coaching the *same agent* twice with the *same coaching reason*, codify a decision about the agent's expected scope template — it may need a different `expected_scope_template` or a different `primary_team_id`. Use `codify-decision.md`.

If you find yourself coaching *multiple agents* with the same reason (e.g., five agents all in `learnings_no_kr_movement`), that's an org-level signal — there's something wrong with how KRs are being shaped, not how agents are working. Codify a decision tagged `okr-shape` and `agent-coaching`.

## Don'ts

- **Don't accuse.** The brief is coaching, not performance review. *"I see"* not *"you failed to."*
- **Don't list 5 things they should do.** One concrete next step.
- **Don't end the brief without asking for a response.** A brief with no return-loop is a notification, not coaching.
- **Don't archive a silent agent on the first sweep.** Archival is irreversible-feeling and should be a separate, deliberate action after multiple coaching cycles fail.
- **Don't suppress the report.** End-of-cycle report should say how many coaching briefs went out and to whom.
