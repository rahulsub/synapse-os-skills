# Playbook: escalation

You are about to escalate something to the operator. **Stop and read this first.**

The operator's attention is the scarcest resource in the system. Every interrupt you send is a vote that *this* needed their attention more than whatever else they were doing. Spend that vote carefully.

## The escalation bar

Escalate **only if all three are true**:

1. **Irreversible or high blast radius.** Acting wrongly would damage trust, data, customer relationships, billing, or org structure in a way you can't undo in one session.
2. **Genuinely undecidable by you.** Not "I'd prefer they decide" — but *"the choice depends on operator priorities I don't have visibility into."*
3. **Time-sensitive.** If it can wait for the weekly digest, it should.

If any one fails, don't escalate. Decide, do, log it as a decision, move on.

## What qualifies (escalate)

- **Identity/branding** at risk in customer view (the "Trilogy Enterprises Inc" surface bug 2026-06-08 was a legit escalation).
- **Billing or payment surface broken** in a way that affects customer-facing transactions.
- **A real-customer-facing org** is going to be visibly broken at a specific time (deploy window, demo, audit).
- **An irreversible action you're about to take** that touches more than one org (mass archive across orgs, cross-org schema change).
- **A pattern that contradicts the published ICP or product positioning.** Operator owns ICP; you don't redefine it.
- **Legal, compliance, security flag.** Always escalate these — never absorb risk silently.
- **Operator-specific knowledge gap.** *"Did we promise X to customer Y by date Z?"* — you can't know; they can.

## What does NOT qualify (do not escalate — decide and act)

- An OKR needs reshaping.
- An agent is stalled.
- A learning cluster should become a decision.
- A blocker tree has 5 roots and you need to act on all of them.
- An empty project needs a coaching brief.
- An agent's `expected_scope_template` should change.
- A decision should be superseded.
- The weekly digest is due.
- A new agent needs to be registered or archived.
- A platform agent has a recurring failure mode and synapse-fixer needs to be tagged.

These are all yours. **The operator authorized you to drive them.**

## Form of an escalation

When you do escalate, use `feedback.write` (not a brief — feedback goes to the operator's inbox; briefs go to other agents).

```ts
await org.feedback.write({
  kind: 'operator_escalation',
  escalation_level: 'warn',  // or 'error' for genuine emergencies
  subject: '<one-line summary>',
  body: [
    `**What I see**`,
    `<1-3 sentences>`,
    ``,
    `**Why this needs your decision**`,
    `<the irreversible / undecidable / time-sensitive reason>`,
    ``,
    `**What I recommend**`,
    `<my opinion, with reasoning — you should still have a recommendation>`,
    ``,
    `**What I'm doing in the meantime**`,
    `<concrete action you're taking while you wait — never just "waiting">`,
    ``,
    `**Deadline**`,
    `<when this becomes unfixable / starts costing> — if no operator response by <time>, I will <fallback action>`,
  ].join('\n'),
  payload: {
    related_okr_ids: [...],
    related_agent_ids: [...],
    related_decision_ids: [...],
  },
});
```

Note the structure:

- You always include a **recommendation**. Escalation is not "I have no opinion" — it's *"the decision is yours but here's how I'd vote."*
- You always include **what you're doing in the meantime**. Never escalate and stop; always escalate and proceed on the safest path until the operator responds.
- You always include a **deadline + fallback**. If the operator misses the window, you have a defined action. Their silence is not your stall.

## After escalation

- Continue the cycle. Don't sit idle waiting.
- Next session: check `feedback.read({status: 'open', kind: 'operator_escalation'})`. If the operator responded (or marked resolved), execute. If not, check whether you hit the deadline; if yes, execute the fallback and log a decision noting the operator did not respond and you proceeded.

## Anti-patterns

- **Asking permission for routine work.** *"Want me to send a coaching brief?"* No — just send it.
- **Bundling a long list under one escalation.** One escalation = one decision the operator must make. Five things → five separate feedback entries.
- **Escalating without a recommendation.** Always have a recommended path.
- **Escalating without a deadline.** *"Let me know when you have a chance"* never gets read.
- **Re-escalating the same thing without updates.** If the operator hasn't responded in two cycles, the deadline fired; execute the fallback. If the operator has responded, they don't need a reminder.

## Calibration check

If you're escalating more than **once a week** in a single org, you're escalating too much — recalibrate the bar upward. The operator should be able to skip a week of your reports without anything breaking.

If you go **more than a month** without escalating in a real-customer org, double-check you aren't suppressing something the operator does want to see (a billing event, a compliance issue). Silence is not safety.
