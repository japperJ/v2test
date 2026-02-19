# Decision Rules — Skill-First Policy

Every proposed extension must pass through Gates A–D before an EDR may be submitted. Gate results must be recorded in Section 8 of the EDR.

Reference: `.planning/phases/2/RESEARCH.md` (Section 3) · `.planning/baseline/CHANGE_GATES.md`

---

## Gate A — Can this be solved without adding anything?

**Test:** Is the gap caused by missing _content_, rather than missing structural capability?

Ask:
- Can a clearer prompt or better plan text eliminate the gap?
- Can an additive section in an existing `.planning/` doc solve it?
- Can a short additive section in an existing agent file (checkpoint-approved; append-only) solve it?

**If YES to any:** Do not propose an extension. Fix the content instead.

**If NO to all:** Proceed to Gate B.

---

## Gate B — Default to Skill

**Test:** Is the gap procedural knowledge, a checklist, a reference, or a repeatable workflow that requires no new tool boundary?

A **Skill** is the right choice when ALL of the following are true:

| Condition | Why it matters |
|---|---|
| The gap is knowledge or workflow, not tool access | Skills carry instructions; agents carry tool boundaries |
| No new tool permissions are required | Adding tools expands the attack surface; skills do not |
| The capability can be loaded on-demand | Skills are progressive-loaded; they don't inflate permanent context |
| The skill is portable across agents | A single skill can serve multiple wiring targets |

**VS Code framing:** Skills are "folders of instructions, scripts, and resources loaded on-demand."
Source: https://code.visualstudio.com/docs/copilot/customization/agent-skills

**If ALL conditions are true:** Propose a **Skill**. Skip Gate C. Proceed to Gate D.

**If ANY condition is false:** Proceed to Gate C.

---

## Gate C — Agent Justification (only if Skill is insufficient)

**Test:** Does this gap genuinely require a new tool boundary, context isolation, or role contract?

A **Custom Agent** MAY be considered when ONE OR MORE of the following is true:

| Condition | Explanation |
|---|---|
| Requires tool restrictions different from all existing agents | Security boundary / least privilege — the new agent needs a narrower or different `tools:` list |
| Requires context isolation | Specialized persona with tighter scope; information must not bleed into general agents |
| Requires an explicit role contract | Changes workflow orchestration (handoffs, subagent-only visibility, etc.) |

**VS Code framing:** Custom agents provide "personas with specific tools, instructions, behaviors" to tailor tools per task.
Source: https://code.visualstudio.com/docs/copilot/customization/custom-agents

### Agent Justification Questions (all four must be answered in the EDR)

An EDR proposing a new agent **must answer all four** of these questions. Weak answers → reject, require a skill instead:

1. **Why can't this be a skill?**
   _What property of a skill makes it fundamentally insufficient for this gap? (Not "it would be harder" — a structural reason.)_

2. **What new tool boundary is required?**
   _List the specific tools this agent needs that are not available in any existing agent. Justify each._

3. **What is the smallest toolset needed (least privilege)?**
   _Enumerate the exact `tools:` list. Every tool not on this list is implicitly excluded._

4. **What is the deprecation / merge-back plan?**
   _When and how would this agent be retired or folded back into an existing agent? What conditions would trigger that?_

**If answers are weak or absent:** Gate C FAILS → reject agent proposal → require skill instead.

---

## Gate D — Skill-First Enforcement Verdict

**Test:** Does the proposal satisfy Gates A–C?

| Outcome | Condition |
|---|---|
| **PASS** | Gate C was not reached (skill proposed) AND Gate B conditions all met |
| **PASS** | Gate C was reached AND all four agent justification questions answered with specificity |
| **FAIL** | Gate A had a YES (no extension needed) |
| **FAIL** | Gate B conditions are all met but an agent was proposed anyway |
| **FAIL** | Gate C justification questions are weak, absent, or circular |

**FAIL outcome:** Return to proposer. EDR cannot proceed to approval until Gate D passes.

---

## Quick Decision Tree

```
Gap identified
    ↓
Gate A: Solvable without new extension?
    YES → Fix content/prompt/plan. No EDR needed.
    NO  ↓
Gate B: Pure knowledge/workflow gap, no new tool boundary?
    YES → Propose a SKILL. Go to Gate D.
    NO  ↓
Gate C: Justified need for new tool boundary / isolation / role contract?
    NO  → Reject. Propose a skill or solve without extension.
    YES → Answer all 4 agent justification questions. Go to Gate D.
        ↓
Gate D: Verdict
    PASS → Submit EDR for approval.
    FAIL → Rework and re-run gates.
```

---

## Enforcement

- Gates are enforced by requiring Section 8 of the `EDR_TEMPLATE.md` to be filled before approval.
- Reviewers must verify Gate D = PASS before setting EDR `status: approved`.
- Registry entries must not be set to `active` without an approved EDR (see `REGISTRY.yaml` governance rules).
