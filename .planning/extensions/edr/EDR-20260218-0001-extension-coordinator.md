---
edr_id: "EDR-20260218-0001-extension-coordinator"
date: "2026-02-18"
status: "approved"         # proposed | approved | rejected | superseded
kind: "skill"              # skill | agent
proposed_name: "extension-coordinator"    # for skills: lowercase-hyphenated, must match .github/skills/<name>/ dir
owner: "JP Dynamic Agent System bootstrap"
requirements:
  - "REQ-005"   # justification before creation — always include
  - "REQ-013"   # registry entry required — always include
wiring_targets:
  - "Orchestrator"
  - "Researcher"
  - "Planner"
  - "Coder"
risk_level: "low"
additive_only: true
---

# Extension Decision Record: `extension-coordinator`

## 1. Problem / Gap

When a repeatable workflow gap is identified, agents need a governed process for creating new skills/agents. Without a coordinator skill, agents may create extensions ad hoc without EDR approval, which can introduce unreviewed changes to the agent system and break additive-only governance.

## 2. Why Existing Agents and Skills Cannot Solve This

| Existing thing considered | Why it is insufficient |
|---|---|
| Orchestrator agent | Coordinates work, but is not an authoritative, on-demand runbook for the full extension lifecycle and can drift over time without a canonical reference. |
| Planner agent | Produces plans, but does not by itself enforce the controlled extension lifecycle unless guided by an authoritative checklist/runbook. |
| Verifier agent | Verifies outcomes, but does not provide the end-to-end controlled creation playbook that prevents governance shortcuts. |
| Ad-hoc notes in phase plans | Plan text is phase-scoped and can become fragmented; it does not provide a canonical, reusable lifecycle playbook available to any agent at the moment the gap is detected. |

## 3. Proposal

- **Kind:** `skill`
- **Name:** `extension-coordinator`
- **Location:** `.github/skills/extension-coordinator/SKILL.md`
- **One-sentence purpose:** Provide the authoritative playbook for proposing, approving, creating, registering, wiring, and verifying new skills/agents so extensions are never created ad hoc.

## 4. Scope

**In scope:**
- Extension creation governance only: EDR drafting, Gate A–D application, approval checkpoint handling, registry entry requirements, wiring option selection (A vs B), and verification handoff.

**Out of scope:**
- Implementing product features or modifying application code.
- Making any non-additive changes to existing agent contracts.
- Performing infrastructure changes unrelated to extension governance.

## 5. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Process bypass (agents create extensions without approval) | medium | Centralize the lifecycle as a user-invokable skill and require Gate A–D results recorded in the EDR. |
| Prompt bloat if embedded in multiple agents | high | Keep the lifecycle in a skill so it is loaded on-demand. |
| Confusion between declarative wiring vs operational wiring | medium | Explicitly reference `WIRING_CONTRACT.md` and require Layer 2 evidence (Option A or B). |

**P0 regression risk:** This skill does not require editing `.github/agents/**` when using Wiring Option A. Any move to Option B would require Gate 2 checkpoint and P0 anchor re-validation.

## 6. Verification Plan

- [ ] Confirm `REGISTRY.yaml` entry exists with `status: active` and correct `wiring_targets`.
- [ ] Confirm registry `edr` path points to this EDR and the file exists.
- [ ] Confirm `.github/skills/extension-coordinator/SKILL.md` exists and `name` matches directory.
- [ ] Confirm operational wiring evidence exists per Section 7 (Option A references in relevant phase plans).
- [ ] Confirm all P0 invariants still pass (`.planning/baseline/P0_SMOKE_CHECKS.md`).

## 7. Wiring Contract

### 7a. Declarative wiring (registry)

- [x] `REGISTRY.yaml` entry lists `wiring_targets` for the agents expected to use this skill.
- [x] Registry `status` is `active` only because this EDR is `approved`.

### 7b. Operational wiring — chosen option

**Option A — Plan-driven references (no agent-file edits).**

- Plans that introduce or modify extensions will include: `@.github/skills/extension-coordinator/SKILL.md` in their Context section.
- Plan text will explicitly instruct the executing agent to invoke `/extension-coordinator` when an extension is being proposed.

_Rationale for choosing Option A:_ preserves additive-only constraints without triggering Gate 2 (agent-file edits) and avoids changing `.github/agents/**` while still providing auditable wiring evidence in phase plans.

## 8. Gate A–D Decision Record

**Gate A — Can this be solved without adding anything?**
- [x] No — the multi-step governance workflow requires a canonical reference that all agents can reliably invoke; embedding and maintaining this lifecycle across prompts/plans would be impractical and inconsistent.

**Gate B — Is a Skill sufficient?**
- [x] Yes — this is procedural knowledge / repeatable workflow with no new tool boundary needed.

**Gate C — Agent justification (complete only if proposing an agent)**

N/A — skill chosen in Gate B.

**Gate D — Skill-first enforcement verdict**
- [x] PASS — skill is the correct extension type, scope is bounded to extension governance, additive-only.

---

## Approval

| Role | Name | Date | Decision |
|---|---|---|---|
| Proposer | JP Dynamic Agent System bootstrap | 2026-02-18 | Proposed |
| Reviewer | JP Dynamic Agent System bootstrap | 2026-02-18 | Approved |
