# Wiring Contract

An extension is not "done" when it exists on disk. It is done when it is **discoverable** AND **operationally referenced** by the correct agent(s). This document defines what both properties mean for this repo.

Reference: `.planning/phases/2/RESEARCH.md` (Section 4) · `REGISTRY.yaml` · `ADDITIVE_ONLY.md`

---

## Layer 1 — Declarative Wiring (governance, always required)

Every approved extension must have a `REGISTRY.yaml` entry that explicitly lists which agents are expected to use it.

**Required registry fields:**

```yaml
wiring_targets:
  - "AgentName"     # canonical agent name (matches name: field in .github/agents/*.agent.md)
edr: ".planning/extensions/edr/EDR-YYYYMMDD-NNNN-<slug>.md"
status: "active"    # only set after EDR is approved
```

**Contract:** Listing an agent in `wiring_targets` is a governance claim that "this agent is expected to reference or invoke this extension when relevant." The claim is not self-fulfilling — it must be backed by Layer 2 evidence.

**Verification:** A registry entry with `status: active` and a `wiring_target` for which no Layer 2 evidence exists is a wiring gap. It must be resolved before the phase that introduced it is marked complete.

---

## Layer 2 — Operational Wiring (execution evidence, choose one per extension)

The EDR must declare which option is used (Section 7b of `EDR_TEMPLATE.md`). The choice is permanent for that extension unless a new EDR supersedes it.

### Option A — Plan-Driven References (no agent-file edits)

**Mechanism:** Phase plans that need the skill include an explicit `@` reference to it in their Context section.

**Format in a PLAN.md:**

```markdown
## Context
- @.github/skills/<skill-name>/SKILL.md — <one-sentence reason this skill is referenced here>
```

The plan text must also instruct the executing agent to invoke the skill when performing the relevant task.

**Properties:**
- Zero risk to existing agent files (no Gate 2 trigger).
- Evidence is localized to the phases that use the extension.
- Wiring is visible in plan diffs.

**Verification:** Confirm the phase plan file contains the `@` reference and the execution instruction.

---

### Option B — Additive Agent-File Skill Index (agent-file edits, checkpoint required)

**Mechanism:** A clearly delimited section is appended to each target agent file, listing the approved skills the agent may use.

**Required boundary marker (must appear verbatim):**

```markdown
## Extensions (additive-only)
<!-- This section is append-only. Do not modify or delete existing lines. -->

### Approved Skills
- [`<skill-name>`](.github/skills/<skill-name>/SKILL.md) — <one-sentence purpose>
```

**Constraints:**
- The section MUST be appended at the end of the file. No edits to existing content.
- Each line in the section is append-only on all future edits.
- This triggers **Gate 2 (agent-file gate)** and requires a **user checkpoint** before application. See `.planning/baseline/CHANGE_GATES.md`.

**Properties:**
- Stronger discoverability — agents have a persistent, co-located reference.
- Higher risk — requires editing `.github/agents/**` files.
- Requires P0 anchor preservation checks (`.planning/baseline/P0_INVARIANTS.yaml`).

**Verification:**
1. Confirm the `## Extensions (additive-only)` section exists at the end of the target agent file.
2. Confirm no existing content was modified (diff shows only additions).
3. Confirm all P0 anchors still pass (`P0_SMOKE_CHECKS.md`).

---

## Wiring Completeness Checklist

An extension is fully wired when ALL of the following are true:

- [ ] `REGISTRY.yaml` entry exists with correct `id`, `name`, `kind`, `wiring_targets`, `edr`, and `status: active`.
- [ ] EDR at the registered `edr` path has `status: approved`.
- [ ] Layer 2 operational wiring evidence exists:
  - Option A: phase plan(s) contain `@.github/skills/<name>/SKILL.md` reference + invocation instruction.
  - Option B: target agent file(s) have appended `## Extensions (additive-only)` section with skill listed.
- [ ] For Option B: Gate 2 checkpoint was approved and recorded.
- [ ] All P0 invariants pass after wiring changes.

---

## Open Question (Phase 3 Checkpoint)

The default operational wiring mechanism (Option A vs Option B vs both) will be decided in Phase 3 as part of the checkpoint: "Skill wiring mechanism" (see `.planning/STATE.md`). Until that decision is made, each EDR declares its own choice.
