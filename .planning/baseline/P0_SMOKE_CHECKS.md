# P0 Smoke Checks

Authoritative commands for checking P0 invariants (from `P0_INVARIANTS.yaml`).
Run these after any change to `.github/agents/**` or `.planning/**`.

## Check 4.1 — Agent files exist (all 7)

```powershell
(Get-ChildItem ".github/agents/*.agent.md").Count
# Expected: 7
```

## Check 4.2 — Orchestrator delegation contract intact

```powershell
(Select-String "Never implements directly" ".github/agents/orchestrator.agent.md").Count
(Select-String "You coordinate work but NEVER implement anything yourself" ".github/agents/orchestrator.agent.md").Count
# Both expected: ≥ 1
```

## Check 4.3 — Verifier independence intact

```powershell
(Select-String "Do NOT trust SUMMARY.md" ".github/agents/verifier.agent.md").Count
# Expected: ≥ 1
```

## Check 4.4 — Planning taxonomy exists

```powershell
Test-Path ".planning/REQUIREMENTS.md"
Test-Path ".planning/ROADMAP.md"
Test-Path ".planning/STATE.md"
# Expected: all True
```

## Check 4.5 — No unexpected agent-file modifications (Option A wiring)

```powershell
git diff --name-only HEAD~1 HEAD | Select-String "\.github/agents/"
# Expected: no output (if Option A chosen and no agent modifications were made)
# NOTE: If Option B was chosen, verify the diff shows only additions (no deletions).
```

## Check 4.6 — Researcher boundary intact

```powershell
(Select-String "you never implement" ".github/agents/researcher.agent.md").Count
# Expected: ≥ 1
```

## Check 4.7 — Plans-are-prompts principle documented

```powershell
(Select-String "Plans are prompts" ".github/agents/orchestrator.agent.md").Count
# Expected: ≥ 1
```

## Running All Checks

Run as a block:

```powershell
Write-Host "=== P0 SMOKE CHECKS ===" -ForegroundColor Cyan

# 4.1
$agentCount = (Get-ChildItem ".github/agents/*.agent.md").Count
Write-Host "4.1 Agent files: $agentCount (expected 7) $(if ($agentCount -eq 7) { '✅' } else { '❌' })"

# 4.2
$orch1 = (Select-String "Never implements directly" ".github/agents/orchestrator.agent.md").Count
$orch2 = (Select-String "You coordinate work but NEVER implement anything yourself" ".github/agents/orchestrator.agent.md").Count
Write-Host "4.2 Orch delegation: $orch1/$orch2 (both expected ≥1) $(if ($orch1 -ge 1 -and $orch2 -ge 1) { '✅' } else { '❌' })"

# 4.3
$ver = (Select-String "Do NOT trust SUMMARY.md" ".github/agents/verifier.agent.md").Count
Write-Host "4.3 Verifier independence: $ver (expected ≥1) $(if ($ver -ge 1) { '✅' } else { '❌' })"

# 4.4
$r1 = Test-Path ".planning/REQUIREMENTS.md"
$r2 = Test-Path ".planning/ROADMAP.md"
$r3 = Test-Path ".planning/STATE.md"
Write-Host "4.4 Planning taxonomy: $r1/$r2/$r3 (all expected True) $(if ($r1 -and $r2 -and $r3) { '✅' } else { '❌' })"

# 4.6
$res = (Select-String "you never implement" ".github/agents/researcher.agent.md").Count
Write-Host "4.6 Researcher boundary: $res (expected ≥1) $(if ($res -ge 1) { '✅' } else { '❌' })"

# 4.7
$plans = (Select-String "Plans are prompts" ".github/agents/orchestrator.agent.md").Count
Write-Host "4.7 Plans-are-prompts: $plans (expected ≥1) $(if ($plans -ge 1) { '✅' } else { '❌' })"
```

## References

- [P0_INVARIANTS.yaml](P0_INVARIANTS.yaml) — invariant definitions
- [CHANGE_GATES.md](CHANGE_GATES.md) — gate trigger rules
- `.github/agents/` — agent files being checked
