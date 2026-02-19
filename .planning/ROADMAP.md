# JP Dynamic Agent System — Roadmap

Scope: The JP Dynamic Agent System governance and extension lifecycle.

## Phase 0 — Baseline (COMPLETE ✅)

**Goal:** Establish the core agent team and P0 invariant baseline.

**Success criteria:**
- All 7 agent files exist at `.github/agents/*.agent.md`
- P0 invariants defined at `.planning/baseline/P0_INVARIANTS.yaml`
- Change gates defined at `.planning/baseline/CHANGE_GATES.md`

## Phase 1 — Extension Governance (COMPLETE ✅)

**Goal:** Establish controlled extension lifecycle (skills and agents).

**Success criteria:**
- `REGISTRY.yaml` operational as canonical extension registry
- `WIRING_CONTRACT.md` defines Layer 1 + Layer 2 wiring options
- `DECISION_RULES.md` defines Gates A–D for extension type selection
- `EDR_TEMPLATE.md` provides standard EDR format

## Phase 2 — Bootstrap Extensions (COMPLETE ✅)

**Goal:** Register and verify the two bootstrap skills that support future extension governance.

**Success criteria:**
- `ext-skill-extension-coordinator` — approved EDR, registry active, wiring evidenced
- `ext-skill-extension-verifier` — approved EDR, registry active, wiring evidenced
- `.planning/extensions/VERIFICATION.md` documents governance checklist results
- `P0_SMOKE_CHECKS.md` created at `.planning/baseline/`

## Phase 3 — Ongoing (ACTIVE)

**Goal:** Support project teams using the agent system on their own projects.

**Success criteria:**
- Agent team and governance artifacts remain P0-compliant
- New extensions follow the EDR governance loop
- Projects using the system maintain their own `.planning/<project>/` directories
