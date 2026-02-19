---
edr_id: "EDR-20260218-0002-extension-verifier"
date: "2026-02-18"
status: "approved"         # proposed | approved | rejected | superseded
kind: "skill"              # skill | agent
proposed_name: "extension-verifier"    # for skills: lowercase-hyphenated, must match .github/skills/<name>/ dir
owner: "JP Dynamic Agent System bootstrap"
requirements:
  - "REQ-005"   # justification before creation — always include
  - "REQ-013"   # registry entry required — always include
wiring_targets:
  - "Verifier"
  - "Orchestrator"
risk_level: "low"
additive_only: true
---

# Extension Decision Record: `extension-verifier`

## 1. Problem / Gap

When a new skill or agent is created, there is no standardized checklist to verify the full governance loop was followed (EDR → registry → wiring → P0 checks → tooling evidence). Without this, extensions can be “registered but not actually wired” or “wired but not verified,” which undermines auditability and increases the risk of governance drift.

## 2. Why Existing Agents and Skills Cannot Solve This

| Existing thing considered | Why it is insufficient |
|---|---|
| Verifier agent (base behavior) | The verification procedure is multi-step and easy to perform inconsistently without an authoritative runbook; relying on memory increases error risk. |
| Orchestrator agent | Coordinates but does not guarantee systematic evidence capture across all gates; lacks a standardized extension-loop verification checklist. |
| EDR template alone | Provides structure for decisions, but not the operational checklist/commands for proving wiring + P0 invariants + tooling evidence. |
| CHANGE_GATES.md + P0_INVARIANTS.yaml | Define rules/anchors, but do not provide a consolidated, repeatable verification runbook that produces auditable VERIFICATION.md evidence. |

## 3. Proposal

- **Kind:** `skill`
- **Name:** `extension-verifier`
- **Location:** `.github/skills/extension-verifier/SKILL.md`
- **One-sentence purpose:** Provide the authoritative verification runbook for extension governance (EDR/registry/wiring/P0/tooling evidence) and the required VERIFICATION.md evidence shape.

## 4. Scope

**In scope:**
- Extension-loop verification only: governance alignment, registry correctness, operational wiring evidence checks, P0 regression spot-checks, and tooling evidence capture guidance.

**Out of scope:**
- Modifying application code, infrastructure, or agent files as part of verification.
- Implementing new extensions or making governance decisions (that is handled by the coordinator flow).

## 5. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| False sense of completion (“exists” mistaken for “wired”) | medium | Skill enforces Layer 1 + Layer 2 wiring contract checks and requires evidence. |
| Prompt bloat if checklist embedded everywhere | high | Keep verification runbook in a skill so it is loaded on demand. |
| Incomplete tooling evidence capture | medium | Skill includes explicit VS Code diagnostics/debug-view checks as evidence. |

**P0 regression risk:** This skill does not require editing `.github/agents/**` under Wiring Option A. If an extension chooses Option B, P0 anchors must be verified via baseline smoke checks.

## 6. Verification Plan

- [ ] Confirm `REGISTRY.yaml` entry exists with `status: active` and correct `wiring_targets`.
- [ ] Confirm registry `edr` points to this EDR and the file exists.
- [ ] Confirm `.github/skills/extension-verifier/SKILL.md` exists and `name` matches directory.
- [ ] Confirm operational wiring evidence exists per Section 7 (Option A references in relevant phase plans, or Option B agent-file additive index with checkpoint evidence).
- [ ] Confirm all P0 invariants still pass (`.planning/baseline/P0_SMOKE_CHECKS.md`).

## 7. Wiring Contract

### 7a. Declarative wiring (registry)

- [x] `REGISTRY.yaml` entry lists `wiring_targets` for agents expected to use this skill.
- [x] Registry `status` is `active` only because this EDR is `approved`.

### 7b. Operational wiring — chosen option

**Option A — Plan-driven references (no agent-file edits).**

- Phase plans that need extension-loop verification will include: `@.github/skills/extension-verifier/SKILL.md` in their Context section.
- Plan text will explicitly instruct the executing agent to invoke `/extension-verifier` when producing verification evidence.

_Rationale for choosing Option A:_ keeps verification evidence phase-scoped and avoids `.github/agents/**` modifications (no Gate 2), while still satisfying the wiring contract via explicit plan references.

## 8. Gate A–D Decision Record

**Gate A — Can this be solved without adding anything?**
- [x] No — the 5-gate verification procedure requires structured, authoritative documentation that cannot be reliably executed from memory alone; embedding this procedure inline in agent instructions would create unworkable prompt sizes and encourage drift.

**Gate B — Is a Skill sufficient?**
- [x] Yes — this is a procedural checklist/workflow with no new tool boundary required.

**Gate C — Agent justification (complete only if proposing an agent)**

N/A — skill chosen in Gate B.

**Gate D — Skill-first enforcement verdict**
- [x] PASS — skill is the correct extension type, scope is bounded, additive-only.

---

## Approval

| Role | Name | Date | Decision |
|---|---|---|---|
| Proposer | JP Dynamic Agent System bootstrap | 2026-02-18 | Proposed |
| Reviewer | JP Dynamic Agent System bootstrap | 2026-02-18 | Approved |
