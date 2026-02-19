# JP Dynamic Agent System — Requirements

Scope: The JP Dynamic Agent System — a multi-agent orchestration framework for software development projects.

## Core Requirements

| ID | Requirement |
|---|---|
| REQ-001 | The system shall provide 7 specialized agents: Orchestrator, Researcher, Planner, Coder, Designer, Verifier, Debugger |
| REQ-002 | Agents shall be composable — the Orchestrator coordinates; implementation agents execute |
| REQ-003 | All changes to agent files shall be additive-only; existing content must not be modified without a gate checkpoint |
| REQ-004 | New skills and agents shall only be created via the controlled EDR governance loop |
| REQ-005 | Each registered extension shall have an approved EDR before `status: active` is set in the registry |
| REQ-006 | Every approved extension shall have verifiable Layer 2 wiring evidence (Option A or B) |
| REQ-007 | P0 invariants shall pass after any agent-file or planning-taxonomy change |
| REQ-008 | The Verifier agent shall verify outcomes independently — task completion ≠ goal achievement |
| REQ-009 | The Orchestrator shall never implement directly — only delegate |
| REQ-010 | All plans shall be executable by a single agent in a single session |

## Extension Requirements

| ID | Requirement |
|---|---|
| REQ-EXT-001 | Extension registry (`REGISTRY.yaml`) is the canonical source of truth for all approved skills and agents |
| REQ-EXT-002 | Registry entries require: id, kind, name, purpose, owner, status, scope, wiring_targets, edr path, source_path, created, updated |
| REQ-EXT-003 | EDR Gate D must be PASS before an EDR is approved |
