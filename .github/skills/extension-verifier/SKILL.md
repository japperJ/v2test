---
name: extension-verifier
description: Verify controlled extension-loop changes in this repo (EDR ↔ registry ↔ wiring ↔ P0 smoke checks) and record auditable evidence in a phase VERIFICATION.md file.
argument-hint: "[phase] [extension name] [EDR path] [wiring option A|B]"
user-invokable: true
disable-model-invocation: true
---

# extension-verifier — JP Dynamic Agent System controlled extension verification

## When to use

Invoke this skill (`/extension-verifier`) when verifying any change that:

- adds or changes a skill or agent (any `.github/skills/**` or `.github/agents/**` modification),
- modifies `.planning/extensions/**` governance artifacts (EDR, registry, wiring contract, decision rules), or
- is completing a phase whose success criteria require extension-loop evidence.

This skill is the authoritative runbook for confirming the full governance loop was followed and for producing the VERIFICATION.md evidence required to close a phase.

---

## Required inputs

Before beginning, confirm you have access to:

1. **Phase number** (e.g., `4`)
2. **Extension name and ID** (e.g., `extension-verifier`, `ext-skill-extension-verifier`)
3. **EDR path** (e.g., `.planning/extensions/edr/EDR-20260218-0002-extension-verifier.md`)
4. **Declared operational wiring option** (`A` = plan-driven, or `B` = agent-file index)
5. **List of changed files / commits** for the phase (from `git log --oneline` or `git diff --name-only`)

---

## Procedure (checklist)

Work through each gate in order. Record PASS/FAIL and evidence for each.

---

### Gate 1 — Governance alignment (EDR exists and is approved)

- [ ] The EDR file exists at the declared path.
- [ ] EDR frontmatter `status` is `approved` (not `proposed` or `rejected`).
- [ ] EDR `kind` matches the implemented extension type (`skill` or `agent`).
- [ ] EDR `proposed_name` matches the actual directory name (`.github/skills/<name>/` or `.github/agents/<name>.agent.md`).
- [ ] EDR `additive_only: true` is set.
- [ ] EDR Section 8 (Gate A–D) is fully filled; Gate D verdict is **PASS**.
- [ ] EDR Approval table is populated with reviewer name, date, and `Approved` decision.
- [ ] EDR `approved_by` field (if present) matches the declared reviewer.

**Evidence to record:** EDR path, `status` field value, Gate D verdict line.

---

### Gate 2 — Registry correctness (declarative wiring)

Open `.planning/extensions/REGISTRY.yaml` and verify the entry for this extension:

- [ ] Entry exists with `id: ext-<kind>-<name>` (e.g., `ext-skill-extension-verifier`).
- [ ] `kind` matches the EDR (`skill` or `agent`).
- [ ] `name` matches the directory/file exactly (case-sensitive).
- [ ] `status: active` (only permitted if EDR is `approved` — check Gate 1 first).
- [ ] `edr` field points to the EDR file and the EDR exists on disk.
- [ ] `source_path` points to an existing directory/file on disk.
- [ ] `wiring_targets` includes at least one agent name.
- [ ] `created` and `updated` dates are populated.
- [ ] `last_updated` at the top of the file reflects today's date.

**Evidence to record:** registry `id`, `status`, `wiring_targets` values, `edr` path check result.

---

### Gate 3 — Operational wiring evidence (Layer 2)

Verify that the declared wiring option (from EDR Section 7b) was actually implemented:

#### Option A — Plan-driven references

- [ ] The relevant phase PLAN.md contains `@.github/skills/<name>/SKILL.md` in its Context section.
- [ ] The plan text includes an explicit instruction for the executing agent to invoke the skill (e.g., "invoke `/extension-verifier` when producing verification evidence").
- [ ] No `.github/agents/**` files were modified for this extension (Option A chosen to avoid Gate 2).

**Evidence to record:** plan file path, the `@` reference line, the invocation instruction line.

#### Option B — Additive agent-file Skill Index

- [ ] Target agent file(s) listed in `wiring_targets` have an `## Extensions (additive-only)` section appended at the end.
- [ ] The appended section contains `<!-- This section is append-only. Do not modify or delete existing lines. -->` marker.
- [ ] The skill is listed under `### Approved Skills` with a link and one-sentence purpose.
- [ ] `git diff` of each target agent file shows only additions (no deletions, no edits above the new section).
- [ ] Gate 2 checkpoint was obtained and recorded in STATE.md checkpoint log before the agent-file edit was applied.
- [ ] All P0 anchors verified post-edit (see Gate 4).

**Evidence to record:** agent file path(s), presence of additive section, diff shape (additions-only), checkpoint log entry.

---

### Gate 4 — P0 regression spot-checks

Run the following spot-checks from `.planning/baseline/P0_SMOKE_CHECKS.md`. Record the result of each command.

#### Check 4.1 — Agent files still exist (all 7)

```powershell
(Get-ChildItem ".github/agents/*.agent.md").Count
# Expected: 7
```

#### Check 4.2 — Orchestrator delegation contract intact

```powershell
(Select-String "Never implements directly" ".github/agents/orchestrator.agent.md").Count
(Select-String "NEVER implement anything yourself" ".github/agents/orchestrator.agent.md").Count
# Both expected: > 0
```

#### Check 4.3 — Verifier independence intact

```powershell
(Select-String "Do NOT trust SUMMARY.md" ".github/agents/verifier.agent.md").Count
# Expected: > 0
```

#### Check 4.4 — Planning taxonomy exists

```powershell
Test-Path ".planning/REQUIREMENTS.md"; Test-Path ".planning/ROADMAP.md"; Test-Path ".planning/STATE.md"
# Expected: True True True
```

#### Check 4.5 — No unexpected agent-file modifications (Option A only)

```powershell
git diff --name-only HEAD~1 HEAD | Select-String "\.github/agents/"
# Expected: no output (if Option A chosen and no agent edits were made)
# NOTE: If Option B was chosen, verify the diff shows only additions.
```

**Evidence to record:** command output for each check, PASS/FAIL verdict per check, overall P0 status.

---

### Gate 5 — Tooling evidence (resolve "loaded vs. referenced vs. invoked" ambiguity)

These checks require human interaction with VS Code.

#### 5.1 — Loaded (Chat customization Diagnostics)

1. Open VS Code Chat panel.
2. Right-click the Chat input → select **"Customization Diagnostics"** (or open via Command Palette: `GitHub Copilot: Open Chat Diagnostics`).
3. Locate the `extension-verifier` skill in the diagnostics output.
4. Record the status: **loaded** / skipped / failed / not found. If not loaded, record the error.

**Expected:** `extension-verifier` shows status = loaded.

#### 5.2 — Referenced (registry + plan evidence)

Confirm wiring evidence was recorded in Gate 2 and Gate 3 above. Referenced = registry entry exists + Layer 2 plan reference exists.

#### 5.3 — Invoked (Chat Debug view)

1. Invoke `/extension-verifier` in VS Code Chat.
2. Open **Chat Debug view** (Command Palette: `GitHub Copilot: Open Chat Debug View`).
3. Inspect the System prompt or Context section for the skill's body content.
4. Record: skill body present / absent / partial.

**Expected:** skill content appears in context when invoked.

---

## Evidence output

Write the following structured evidence block to `.planning/phases/<phase>/VERIFICATION.md`:

```markdown
## Extension-Verifier Skill — Governance Checklist Results

**Date:** YYYY-MM-DD  
**Phase:** N  
**Extension:** extension-verifier (`ext-skill-extension-verifier`)  
**Wiring option declared:** A (plan-driven) | B (agent-file)

### Gate 1 — Governance alignment
| Check | Result |
|---|---|
| EDR exists | PASS / FAIL |
| EDR status = approved | PASS / FAIL |
| EDR Gate D = PASS | PASS / FAIL |
| EDR name matches directory | PASS / FAIL |

### Gate 2 — Registry correctness
| Check | Result |
|---|---|
| Registry entry exists | PASS / FAIL |
| status = active | PASS / FAIL |
| edr path valid | PASS / FAIL |
| source_path valid | PASS / FAIL |
| wiring_targets populated | PASS / FAIL |

### Gate 3 — Operational wiring
| Check | Result |
|---|---|
| Option A: plan @ reference | PASS / FAIL |
| Option A: invocation instruction | PASS / FAIL |
| No agent-file edits (Option A) | PASS / FAIL |

### Gate 4 — P0 smoke checks
| Check | Command | Result |
|---|---|---|
| 4.1 Agent files exist (7) | `(Get-ChildItem ...).Count` | PASS (N found) |
| 4.2 Orch delegation intact | `Select-String ...` | PASS |
| 4.3 Verifier independence intact | `Select-String ...` | PASS |
| 4.4 Planning taxonomy exists | `Test-Path ...` | PASS |
| 4.5 No unexpected agent edits | `git diff ...` | PASS |

**Overall P0 status:** PASS / FAIL

### Gate 5 — Tooling evidence
| Evidence | Status | Notes |
|---|---|---|
| Loaded (Diagnostics) | loaded / skipped / failed | |
| Referenced (registry + plan) | PASS | see Gates 2 + 3 |
| Invoked (Chat Debug view) | present / absent | |
```

---

## References

| Resource | Purpose |
|---|---|
| `.planning/extensions/DECISION_RULES.md` | Gates A–D definitions |
| `.planning/extensions/WIRING_CONTRACT.md` | Layer 1 + Layer 2 wiring options |
| `.planning/extensions/REGISTRY.yaml` | Canonical extension registry |
| `.planning/baseline/P0_SMOKE_CHECKS.md` | P0 regression spot-check commands |
| `.planning/baseline/P0_INVARIANTS.yaml` | P0 anchor definitions |
| `.planning/baseline/CHANGE_GATES.md` | Gates 1–4 definitions |
| VS Code Chat Diagnostics | `GitHub Copilot: Open Chat Diagnostics` command |
| VS Code Chat Debug View | `GitHub Copilot: Open Chat Debug View` command |
