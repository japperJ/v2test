# Change Gates — Additive-Only Policy

This document defines gates that must be applied after each additive extension to preserve P0 workflow behavior and ensure changes remain strictly additive.

## Core Principle

**All changes must be additive extensions only.** No breaking edits, no behavioral regressions. If a change would alter existing behavior or requires non-additive modifications, it requires a user checkpoint before proceeding.

---

## Gate 1: Path-Based Gate

### Rule

Changes are scoped by phase. Each phase defines allowed change paths.

**Phase 1 allowed paths:**
- ✅ `.planning/**` (all planning artifacts)
- ❌ `.github/agents/**` (agent files - disallowed unless checkpoint approved)
- ❌ Source code files (not applicable in Phase 1)
- ❌ Configuration files (not applicable in Phase 1)

**Verification:**
```bash
# Check that all changes are within allowed paths
git diff --name-only | grep -v "^\.planning/" | wc -l
# Expected: 0 (all changes under .planning/)
```

**Checkpoint trigger:**
If any file outside `.planning/` is modified → STOP and request user checkpoint.

**Checkpoint question:**
"Phase 1 is limited to `.planning/` changes only. The following files are outside allowed scope: [list]. Do you approve extending the scope for this phase?"

---

## Gate 2: Agent-File Gate

### Rule

If `.github/agents/**/*.agent.md` files are modified, changes must:
1. Be strictly additive (append-only or clearly marked additive sections)
2. Preserve all anchors referenced in `P0_INVARIANTS.yaml`
3. Require user checkpoint before application

**Verification:**
```bash
# Check if any agent files changed
git diff --name-only .github/agents/ | wc -l
# If > 0, trigger agent-file gate
```

**Additive patterns (allowed with checkpoint):**
- Adding new sections to the end of the file
- Adding new rows to tables
- Appending to lists
- Adding clearly marked "Extension:" sections

**Non-additive patterns (disallowed):**
- Rewriting existing instructions
- Removing content
- Changing core behavior statements
- Altering tool boundaries

**Anchor preservation check:**
```bash
# For each invariant in P0_INVARIANTS.yaml with kind=file_contains*
# Verify the must_contain strings still exist in the file
grep -c "Never implements directly" .github/agents/orchestrator.agent.md
# Expected: > 0 for each anchor
```

**Checkpoint trigger:**
Any change to `.github/agents/**/*.agent.md` → STOP and request checkpoint.

**Checkpoint question:**
"Agent file modification detected: [file]. Changes must be additive-only and preserve P0 anchors. Please review the diff and approve."

---

## Gate 3: Diff-Shape Gate

### Rule

If edits are non-additive (rewrites, replacements, deletions), require checkpoint.

**Detection heuristics:**

**Additive edit:**
- Lines added > lines removed
- Existing structure preserved
- No function signature changes
- No behavior changes to existing code paths

**Non-additive edit:**
- Lines removed ≥ lines added
- Major refactoring
- Changed function signatures
- Behavioral changes

**Verification:**
```bash
# Get diff stats
git diff --stat

# Check for large deletions (warning sign)
git diff --numstat | awk '{if ($2 > $1*2) print $3 " has " $2 " deletions vs " $1 " additions"}'
```

**Checkpoint trigger:**
If any file shows substantial deletions or structural changes → STOP and request checkpoint.

**Checkpoint question:**
"Non-additive changes detected in [file]. This appears to be a rewrite rather than an additive extension. Please review and approve."

---

## Gate 4: Evidence Requirement Gate

### Rule

Every phase/task completion must include verification evidence in the appropriate `VERIFICATION.md` file.

**Required evidence elements:**
1. **Changed file list** — exact paths of modified files
2. **Justification** — why each change was necessary
3. **Invariant recheck** — which P0 invariants were spot-checked
4. **Gate application results** — outcome of applying Gates 1-3

**Evidence location:**
- Phase-level changes: `.planning/phases/<phase>/VERIFICATION.md`
- Baseline changes: Record in Phase 1 VERIFICATION.md

**Verification template:**

```markdown
## Change Evidence

### Files Modified
- `.planning/baseline/P0_INVARIANTS.yaml` (created)
- `.planning/baseline/P0_SMOKE_CHECKS.md` (created)

### Justification
Created baseline invariants and smoke checks per Phase 1, Task 1 requirements.

### Gates Applied
- ✅ Gate 1 (Path-based): All changes under `.planning/` ✓
- ✅ Gate 2 (Agent-file): No agent files modified ✓
- ✅ Gate 3 (Diff-shape): All additive (new files) ✓
- ✅ Gate 4 (Evidence): This evidence ✓

### Invariants Rechecked
- P0-AGENTS-EXIST: ✓ (spot-checked orchestrator.agent.md exists)
- P0-ORCH-NO-IMPLEMENT: ✓ (grep confirmed anchor present)
```

**Checkpoint trigger:**
If evidence is missing or incomplete → flag for review.

---

## Gate Application Workflow

### For each task completion:

1. **Review changed files**
   ```bash
   git status
   git diff --name-only
   ```

2. **Apply Gate 1 (Path-based)**
   - Are all changes within allowed paths for this phase?
   - If NO → checkpoint required

3. **Apply Gate 2 (Agent-file)**
   - Were any agent files modified?
   - If YES → verify additive-only + anchor preservation + checkpoint required

4. **Apply Gate 3 (Diff-shape)**
   - Are all changes strictly additive?
   - If NO → checkpoint required

5. **Apply Gate 4 (Evidence)**
   - Record evidence in VERIFICATION.md
   - List changed files, justification, gates applied, invariants checked

6. **Commit**
   - If all gates pass (or checkpoints approved), commit changes

---

## Checkpoint Decision Flow

```
Change detected
    ↓
Apply Gates 1-3
    ↓
All pass? ——Yes——→ Record evidence (Gate 4) → Commit
    ↓
   No
    ↓
STOP → Prepare checkpoint response
    ↓
User reviews → Approve/Reject/Modify
    ↓
If approved → Record evidence → Commit
```

---

## Gate Enforcement Responsibility

| Gate | Enforced By | When |
|---|---|---|
| Gate 1 (Path) | Verifier | After each task/phase |
| Gate 2 (Agent-file) | Verifier | After each task/phase |
| Gate 3 (Diff-shape) | Verifier | After each task/phase |
| Gate 4 (Evidence) | Verifier | After each task/phase |

**Note:** Executing agents (Coder, Planner, etc.) should self-apply gates before committing. Verifier double-checks during phase verification.

---

## P0 Preservation Success Criteria

A change preserves P0 if:

1. ✅ All gates pass (or checkpoint-approved exceptions documented)
2. ✅ P0 smoke checks still pass after the change
3. ✅ Baseline invariants remain true
4. ✅ Evidence is recorded

---

## Examples

### ✅ PASS: Adding new planning doc

**Change:** Create `.planning/baseline/CAPABILITY_PROBE.md`

**Gate results:**
- Gate 1: ✅ Path is `.planning/` (allowed)
- Gate 2: ✅ No agent files modified
- Gate 3: ✅ Additive (new file)
- Gate 4: ✅ Evidence recorded

**Outcome:** PASS → Commit

---

### ❌ CHECKPOINT: Modifying agent file

**Change:** Edit `.github/agents/orchestrator.agent.md` to add skill loading section

**Gate results:**
- Gate 1: ❌ Path is `.github/agents/` (requires checkpoint in Phase 1)
- Gate 2: ⚠️ Agent file modified (requires checkpoint)

**Outcome:** STOP → Checkpoint → User approval required

---

### ❌ CHECKPOINT: Non-additive refactor

**Change:** Rewrite `.planning/ROADMAP.md` with different structure

**Gate results:**
- Gate 1: ✅ Path is `.planning/` (allowed)
- Gate 2: ✅ No agent files
- Gate 3: ❌ Non-additive (major rewrite, not extension)

**Outcome:** STOP → Checkpoint → User approval required

---

**Last updated:** 2026-02-18
