---
name: extension-coordinator
description: >
  Governs the controlled creation of new skills and agents in the JP Dynamic Agent System.
  Invoke when an agent detects a repeatable workflow gap that may need a new skill or agent.
  Runs the full EDR → Gate A–D decision → (if approved) create → register → wire → verify flow.
  Prevents ad-hoc extension creation without justification and an audit trail.
argument-hint: "<gap summary> | proposed kind (skill|agent) | candidate wiring targets | risk level"
user-invokable: true
disable-model-invocation: true
---

# Extension Coordinator

---

## When to Use This Skill

Invoke this skill when **all three conditions are true**:

1. An agent has detected a repeatable workflow gap during normal operation (research, planning, execution, verification, or debugging).
2. The gap has occurred (or is expected to recur) across 2+ distinct sessions — it is not a one-off.
3. The agent is tempted to create a new skill or agent to address the gap.

**Do NOT invoke speculatively.** This skill governs a real need, not a planning exercise.

### Detection signals (any one is sufficient to warrant a report)

- The agent is copy-pasting the same multi-step guidance across sessions.
- The agent repeatedly needs the same checklist, template, or procedure that does not yet exist as a skill.
- A gap requires a distinct tool boundary or role contract not satisfied by any existing agent or skill (rare; requires Gate C).
- The agent is about to create `.github/skills/**` or `.github/agents/**` without an approved EDR.

---

## Inputs Required

Before invoking, prepare these inputs:

| Input | Description | Required? |
|---|---|---|
| Gap statement | Observable problem: what fails, what is missing, or what causes repeated churn | Required |
| Proposed kind | `skill` (default) or `agent` | Required |
| Proposed name | Lowercase-hyphenated, ≤64 chars; for skills must match the target directory name exactly | Required |
| Candidate wiring targets | Agent names that would use or detect this extension (e.g., Orchestrator, Planner) | Required |
| Risk level | `low` / `medium` / `high` with a one-sentence reason | Required |
| Gate C justification | Only if proposing an agent: answers to all 4 agent justification questions | Conditional |

---

## Governance Procedure

Follow these steps in order. Do not skip steps. Do not create anything before Gate D passes.

```
Gap detected (any agent)
      ↓
Step 1: Draft EDR (status: proposed)   ← Planner
      ↓
Step 2: Apply Gates A–D                ← Planner + Orchestrator
      ↓
Step 3: Approval checkpoint            ← Human (required; Gate D must PASS first)
      ↓                                ↑ If rejected or Gate D fails: STOP
Step 4: Create on disk                 ← Coder
      ↓
Step 5: Register in REGISTRY.yaml      ← Coder or Planner
      ↓
Step 6: Wire (Option A or B)           ← Coder or Planner
      ↓
Step 7: Verify                         ← Verifier
```

---

### Step 1: Draft EDR

1. Planner copies `.planning/extensions/EDR_TEMPLATE.md` to:
   - `.planning/extensions/edr/EDR-<YYYYMMDD>-<NNNN>-<slug>.md`
   - Date = today (ISO 8601); NNNN = next sequential number (check existing EDRs first)
   - Slug = proposed name (e.g., `my-new-skill`)
2. Fill all sections (1–8). Do not leave TODOs unfilled — write "N/A with reason" if a section does not apply.
3. Set frontmatter `status: proposed`.
4. Set `wiring_targets` in frontmatter (at least one agent name).

### Step 2: Apply Gates A–D (record results in EDR Section 8)

Work through `.planning/extensions/DECISION_RULES.md` in order:

#### Gate A — Can this be solved without a new extension?

Ask: Can a clearer prompt, an additive section in a planning doc, or a checkpoint-approved additive agent-file block solve this without creating anything new?

- **YES** → STOP. Do not create the extension. Fix the content instead. Do not submit the EDR.
- **NO** → Proceed to Gate B.

#### Gate B — Is a Skill sufficient?

A Skill is the correct choice when ALL of the following are true:
- The gap is knowledge or workflow — it does not require new tool access.
- No new tool permissions are needed (adding tools expands attack surface; skills do not).
- The capability can be loaded on-demand (Skills are progressive-loaded, not permanently resident).
- The skill is portable across the intended wiring targets.

- **All true** → Propose a `skill`. Record Gate B = PASS (skill chosen). Skip Gate C. Proceed to Gate D.
- **Any false** → Proceed to Gate C.

#### Gate C — Agent justification (complete ONLY if Skill was insufficient at Gate B)

Answer ALL FOUR questions in EDR Section 8. Weak or absent answers = Gate C FAIL = reject the agent proposal.

1. **Why can't this be a skill?** Give a structural reason, not a convenience argument.
2. **What new tool boundary is required?** List the specific tools this agent needs that are unavailable in any existing agent. Justify each tool.
3. **What is the smallest toolset needed?** Enumerate the exact least-privilege `tools:` list.
4. **What is the deprecation / merge-back plan?** Describe the conditions under which this agent would be retired or folded back into an existing agent.

#### Gate D — Verdict

| Outcome | Condition |
|---|---|
| PASS | Skill chosen at Gate B (Gate C not reached) AND all Gate B conditions met |
| PASS | Agent proposed AND all 4 Gate C questions answered with specificity |
| FAIL | Gate A was YES (no extension needed) |
| FAIL | Agent proposed but Gate B conditions are all satisfied (should be a skill) |
| FAIL | Gate C answers are weak, absent, or circular |

Record verdict in EDR Section 8. If FAIL: return to proposer. EDR cannot proceed to approval until Gate D PASS.

### Step 3: Approval Checkpoint (Human Required)

Orchestrator requests explicit user confirmation to change EDR `status: proposed` → `status: approved`.

**Do NOT proceed to Step 4 without explicit user approval. This gate is non-negotiable.**

- If approved: update EDR frontmatter `status: approved`.
- If rejected: update EDR frontmatter `status: rejected`; record decision in the Approval table and stop.

### Step 4a: Create Skill (if kind = skill)

1. Create `.github/skills/<proposed-name>/SKILL.md` with valid VS Code frontmatter:
   - `name:` must match the directory name exactly (lowercase-hyphenated)
   - `description:` keyword-rich; explains trigger conditions and what the skill does
   - `argument-hint:` input hint shown to the user (format: `"<input1> | <input2> | ..."`)
   - `user-invokable: true` so `/<name>` works as a slash command
   - `disable-model-invocation: true` prevents accidental auto-loading
2. Body must minimally include: when to use, required inputs, step-by-step procedure, and a verification checklist.
3. Directory name must be lowercase-hyphenated and match the `name:` field exactly.

### Step 4b: Create Agent (if kind = agent)

1. Create `.github/agents/<name>.agent.md` with:
   - Explicit least-privilege `tools:` list matching Gate C answer #3
   - `name:` set correctly
   - Role instructions non-overlapping with all existing agents
2. **Any edit to `.github/agents/**` is Gate 2 high-risk.** Obtain a checkpoint before the edit. The diff must be strictly additive.

### Step 5: Register

Add an entry to `.planning/extensions/REGISTRY.yaml`:

```yaml
- id: "ext-<kind>-<name>"
  kind: "<skill|agent>"
  name: "<name>"
  purpose: >
    One to two sentence description of what this extension does and when it is invoked.
  owner: "<owner>"
  status: "active"                    # ONLY after EDR is approved
  scope: "<what it is allowed to influence>"
  wiring_targets:
    - "<AgentName>"
  edr: ".planning/extensions/edr/EDR-<YYYYMMDD>-<NNNN>-<slug>.md"
  source_path: ".github/skills/<name>/"   # or .github/agents/<name>.agent.md for agents
  created: "<YYYY-MM-DD>"
  updated: "<YYYY-MM-DD>"
```

Rules:
- `status: active` ONLY after EDR is `approved`.
- `edr:` path must exist on disk.
- `wiring_targets` must match the `wiring_targets` list in the EDR frontmatter.

### Step 6: Operational Wiring

The wiring mechanism was chosen in EDR Section 7b. Choose the applicable path below:

#### Option A — Plan-driven references (preferred default; no agent-file edits)

- Add `@.github/skills/<name>/SKILL.md` to the `Context` section of all plans that use the skill.
- The plan text must include explicit instructions telling the executing agent to invoke the skill when performing relevant tasks.
- Update `last_updated` in `REGISTRY.yaml`.

**Choose Option A when** the skill is phase-specific or only needed during identifiable plan steps.

#### Option B — Additive agent-file blocks (persistent discovery; requires Gate 2)

- MUST obtain Gate 2 checkpoint (explicit user approval) before editing any `.github/agents/**` file.
- Append a clearly-bounded section at the end of each target agent file. See Append-Only Rules below.
- Verify P0 anchors pass after every agent-file edit. Record evidence in `VERIFICATION.md`.

**Choose Option B when** the skill governs behavior that agents should always be aware of across all phases and sessions — not just during a specific plan.

### Step 7: Verify

Verifier confirms (satisfies REQ-006, REQ-007):

1. **EDR enforcement** — `.planning/extensions/edr/EDR-*.md` with `status: approved` exists for the created extension.
2. **Registry** — `REGISTRY.yaml` entry with `status: active` references the approved EDR path.
3. **Extension on disk** — Skill file (or agent file) exists; `name` field matches directory / filename.
4. **Wiring evidence** — Option A: plan files include `@.github/skills/<name>/SKILL.md` reference. Option B: agent files have additive extension blocks.
5. **P0 preserved** — If any `.github/agents/**` file was changed: all P0 anchors from `.planning/baseline/P0_INVARIANTS.yaml` still match.

---

## Append-Only Rules for Agent Files (Option B)

When wiring requires editing `.github/agents/**`:

1. **Read the file first** — Never edit blind. Confirm current file tail before appending.
2. **Append at end only** — No changes to any content above the new section.
3. **Use boundary marker** — Every appended section must begin with the appropriate boundary heading.
4. **Include HTML comment** — `<!-- This section is append-only. Do not modify or delete existing lines. -->` immediately after the heading.
5. **Checkpoint required** — Gate 2 (`.planning/baseline/CHANGE_GATES.md`) must be satisfied before the edit is applied.
6. **Verify P0 after** — Check all strings from `.planning/baseline/P0_INVARIANTS.yaml` are still present in the file.
7. **Record evidence** — Write the diff shape and anchor check results to the phase's `VERIFICATION.md`.

Full constraint specification: `.planning/extensions/ADDITIVE_ONLY.md`.

---

## Anti-Patterns (Never Do These)

| Anti-pattern | Why it is prohibited |
|---|---|
| Create `.github/skills/**` or `.github/agents/**` without an approved EDR | Violates REQ-005; the extension cannot be registered or verified |
| Set `status: active` in `REGISTRY.yaml` without an approved EDR | Violates registry governance rule #1 |
| Edit content above the append boundary in agent files | Non-additive; violates Gate 3 and may break P0 anchors |
| Skip Gate A | Every needed extension must first prove it cannot be solved without one |
| Propose an agent when Gate B conditions are all satisfied | Unnecessary tool surface expansion; Gate D will FAIL |
| Skip the human approval checkpoint (Step 3) | Governance is meaningless without an explicit approval record |
| Set `wiring_targets` in registry that do not match the EDR frontmatter | Creates inconsistency between declarative and operational wiring evidence |
