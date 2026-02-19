# Additive-Only Constraints for Extension Governance

All work in this governance layer (creating skills, agents, registry entries, EDRs) must be strictly additive. This document restates the baseline additive-only policy as it applies to extension-related changes.

Reference: `.planning/baseline/CHANGE_GATES.md` (authoritative gate definitions) · `WIRING_CONTRACT.md` · `REGISTRY.yaml`

---

## Core Rule

**Extension work only adds. It never rewrites, removes, or restructures existing content.**

This applies to:
- Registry entries (`REGISTRY.yaml`) — add entries; update status fields; do not remove entries (use `deprecated` status instead).
- EDR files — add new EDRs; do not edit an approved EDR (create a superseding EDR instead).
- Agent files (`.github/agents/**`) — see special rules below.
- Skill files (`.github/skills/**`) — additive additions and corrections only (no behavioral rewrites without a new EDR).
- Planning docs in `.planning/extensions/` — append or add sections; do not restructure existing content without a decision checkpoint.

---

## Gate Summary (from CHANGE_GATES.md)

| Gate | What it checks | Trigger |
|---|---|---|
| **Gate 1 — Path-based** | Are all changes within the allowed paths for this phase? | Any file outside `.planning/**` in Phase 2 → STOP + checkpoint |
| **Gate 2 — Agent-file** | Were `.github/agents/**/*.agent.md` files modified? | Any agent-file edit → STOP + checkpoint + anchor check |
| **Gate 3 — Diff-shape** | Are all edits additive (lines added > lines removed)? | Non-additive edits (rewrites, deletions) → STOP + checkpoint |
| **Gate 4 — Evidence** | Is verification evidence recorded? | Missing evidence → flag for review |

All four gates apply to every extension-related change.

---

## Special Rule: `.github/agents/**` is High-Risk

Agent files are the P0 workflow definition for this repo. Any modification to them:

1. **Requires Gate 2 approval** — a user checkpoint must be obtained before the edit is applied.
2. **Must be strictly append-only** — the only permitted change shape is appending content at the end of the file under the `## Extensions (additive-only)` boundary marker (see `WIRING_CONTRACT.md`, Option B).
3. **Must preserve P0 anchors** — all strings listed in `.planning/baseline/P0_INVARIANTS.yaml` with `kind: file_contains*` must remain present after the edit.
4. **Must be accompanied by evidence** — verification that anchors survive must be recorded in the phase's `VERIFICATION.md`.

**The only allowed change shape for agent-file extension wiring edits:**

```diff
  [existing agent file content — unchanged]
+
+ ## Extensions (additive-only)
+ <!-- This section is append-only. Do not modify or delete existing lines. -->
+
+ ### Approved Skills
+ - [`<skill-name>`](.github/skills/<skill-name>/SKILL.md) — <purpose>
```

Any other shape (including editing lines above this section) is **disallowed without a separate non-additive change checkpoint**.

---

## Phase 2 P0 Constraint

During Phase 2, **no `.github/agents/**` file may be modified at all** (Gate 1 applies). All Phase 2 changes are scoped to `.planning/**` only.

The rules in the section above become active in Phase 3+ when actual wiring edits to agent files may be approved.

---

## Additive-Only Enforcement Checklist

Before committing any extension-related change, verify:

- [ ] Gate 1: All modified files are within the allowed paths for this phase.
- [ ] Gate 2: If any `.github/agents/**` file was modified — checkpoint obtained, diff is append-only, P0 anchors verified.
- [ ] Gate 3: No file has more lines deleted than added (no rewrites).
- [ ] Gate 4: Evidence recorded in the appropriate `VERIFICATION.md`.
- [ ] Registry: Any new `active` entry references an `approved` EDR that exists on disk.
- [ ] For agent-file edits: `## Extensions (additive-only)` boundary marker is present and the section is at the end of the file.
