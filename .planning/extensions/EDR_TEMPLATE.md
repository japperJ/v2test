---
edr_id: "EDR-YYYYMMDD-NNNN-<slug>"
date: "YYYY-MM-DD"
status: "proposed"         # proposed | approved | rejected | superseded
kind: "skill"              # skill | agent
proposed_name: "<name>"    # for skills: lowercase-hyphenated, must match .github/skills/<name>/ dir; for agents: must match .agent.md filename stem
owner: "<person or team>"
requirements:
  - "REQ-004"   # skill-first — include if applicable
  - "REQ-005"   # justification before creation — always include
  - "REQ-013"   # registry entry required — always include
wiring_targets:
  - "<AgentName>"   # canonical agent name (e.g., Planner, Coder). At least one required.
risk_level: "low"          # low | medium | high
additive_only: true        # must be true; non-additive changes require separate checkpoint + EDR amendment
---

# Extension Decision Record: `<proposed_name>`

> **Instructions:** Copy this template to `.planning/extensions/edr/EDR-YYYYMMDD-NNNN-<slug>.md`. Fill every section. Do not delete sections — write "N/A" with a brief explanation if a section does not apply.

---

## 1. Problem / Gap

_What is the observable gap or unmet need? Be specific: what fails, what is missing, or what is slower/riskier than it should be?_

<!-- TODO: Describe the problem in 2–5 sentences. -->

---

## 2. Why Existing Agents and Skills Cannot Solve This

_Enumerate the existing agents / skills that were considered. Explain precisely why each is insufficient. If no skill exists yet, explain why none was created earlier._

| Existing thing considered | Why it is insufficient |
|---|---|
| <!-- e.g., Planner agent --> | <!-- e.g., Lacks X capability --> |

_If you cannot fill this table, the answer is likely Gate A (no new extension needed). See `DECISION_RULES.md`._

---

## 3. Proposal

_What exactly will be added?_

- **Kind:** `skill` or `agent` (must match frontmatter `kind`)
- **Name:** `<proposed_name>` (must match frontmatter; for skills, must match dir name under `.github/skills/`)
- **Location:**
  - Skill: `.github/skills/<proposed_name>/SKILL.md` (+ any referenced resources)
  - Agent: `.github/agents/<proposed_name>.agent.md`
- **One-sentence purpose:** _What does this do and when is it used?_

---

## 4. Scope

**In scope:**
- <!-- What this extension is allowed to influence. Be narrow. -->

**Out of scope:**
- <!-- What this extension must NOT do. Be explicit about tool boundaries for agents. -->

---

## 5. Risks

_List risks, including tool permission implications (for agents) and context-pollution risks (for skills)._

| Risk | Likelihood | Mitigation |
|---|---|---|
| <!-- e.g., Expands tool surface unexpectedly --> | <!-- low / medium / high --> | <!-- e.g., Explicit tools: list in frontmatter --> |

**P0 regression risk:** _Does this extension touch or reference `.github/agents/**`? If yes, state which files and describe how anchor preservation will be verified (see `.planning/baseline/P0_INVARIANTS.yaml`)._

---

## 6. Verification Plan

_How will the Verifier confirm that this extension is correctly wired and introduces no P0 regressions?_

- [ ] Confirm `REGISTRY.yaml` entry exists with `status: active` and correct `wiring_targets`.
- [ ] Confirm EDR path is recorded in registry `edr` field.
- [ ] For skills: Confirm `.github/skills/<proposed_name>/SKILL.md` exists and `name` matches directory.
- [ ] For agents: Confirm `.github/agents/<proposed_name>.agent.md` exists and frontmatter is complete.
- [ ] Confirm all P0 invariants still pass (`P0_SMOKE_CHECKS.md`).
- [ ] Confirm operational wiring evidence exists (see Section 7 below).
- <!-- Add extension-specific checks here -->

---

## 7. Wiring Contract

_This extension must be both discoverable and operationally referenced. See `.planning/extensions/WIRING_CONTRACT.md` for full definitions._

### 7a. Declarative wiring (registry)

- [ ] `REGISTRY.yaml` entry will include `wiring_targets: [<AgentName>, ...]` matching frontmatter `wiring_targets`.
- [ ] Registry `status` will be set to `active` only after this EDR is `approved`.

### 7b. Operational wiring — choose one

Select the mechanism and delete the other. Record the rationale.

**Option A — Plan-driven references (no agent-file edits):**
- The phase plan(s) that use this extension will include an explicit `@.github/skills/<proposed_name>/SKILL.md` reference in their Context section.
- The plan text will instruct the executing agent to invoke the skill when performing relevant tasks.
- _Rationale for choosing Option A:_

**Option B — Additive agent-file Skill Index (agent-file edits required):**
- A `## Extensions (additive-only)` section will be appended to each target agent file listed in `wiring_targets`.
- This requires Gate 2 (agent-file gate) approval and a user checkpoint per `.planning/baseline/CHANGE_GATES.md`.
- _Rationale for choosing Option B:_
- _Checkpoint requested:_ <!-- date or "pending" -->

---

## 8. Gate A–D Decision Record

_Fill this to demonstrate the skill-first decision process was followed. See `DECISION_RULES.md`._

**Gate A — Can this be solved without adding anything?**
- [ ] No — a new extension is genuinely required. Explain: _<!-- why existing content, prompts, or planning docs cannot solve this -->_

**Gate B — Is a Skill sufficient?**
- [ ] Yes — this is procedural knowledge / repeatable workflow with no new tool boundary needed. _(Stop here if skill is chosen.)_
- [ ] No — a skill is insufficient because: _<!-- specific reason -->_

**Gate C — Agent justification (complete only if proposing an agent)**

_An EDR proposing a new agent must answer all four questions or be rejected:_

1. **Why can't this be a skill?** _<!-- specific answer -->_
2. **What new tool boundary is required?** _<!-- list the tools not available in any existing agent -->_
3. **What is the smallest toolset needed (least privilege)?** _<!-- exact tools list -->_
4. **What is the deprecation / merge-back plan?** _<!-- when and how this agent would be retired or folded back into an existing agent -->_

**Gate D — Skill-first enforcement verdict**
- [ ] PASS — proposal satisfies Gates A–C and proceeds to review.
- [ ] FAIL — proposal requires rework. Reason: _<!-- -->_

---

## Approval

| Role | Name | Date | Decision |
|---|---|---|---|
| Proposer | | | Proposed |
| Reviewer | | | Approved / Rejected / Deferred |

_Update frontmatter `status` to match the decision above._
