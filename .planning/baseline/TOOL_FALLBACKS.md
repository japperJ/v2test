# Tool Fallback Documentation

This document defines explicit fallback strategies when optional tools are unavailable or when operating in reduced-capability mode.

## Principle

Workflow correctness must not depend on optional tools. Every dependency on an optional tool must have a documented fallback that produces equivalent (or acceptable lower-fidelity) results.

---

## Context7 / MCP Research Fallback

### When Context7 is unavailable

**Fallback approach:**
1. Use official documentation via web search or direct URL access
2. Prefer official sources in this priority:
   - Official docs website (e.g., react.dev, docs.python.org)
   - Official GitHub repository (README, docs/ folder)
   - Reputable community docs (MDN for web APIs, etc.)
3. Record all citations with full URLs in research outputs

**Quality impact:** Medium
- Context7 provides pre-processed, structured docs optimized for AI consumption
- Web docs are raw and may require more manual synthesis
- Result quality comparable with additional effort

**Verification approach:**
- All research claims must include verifiable citations
- Prefer multiple sources to confirm facts
- Flag uncertainty when sources conflict

**Example workflow:**

Without Context7:
```
Research Next.js App Router:
1. Visit https://nextjs.org/docs
2. Read App Router documentation
3. Record key findings with URL citations
4. Cross-reference with GitHub examples if needed
```

With Context7:
```
Research Next.js App Router:
1. Call Context7 with library ID 'nextjs'
2. Get structured documentation
3. Extract key findings
```

---

## Memory Tool Fallback

### When memory tool is unavailable

**Fallback approach:**
- Store **all** durable state in `.planning/` artifacts
- Use file-based evidence instead of memory persistence
- Treat every file as a source of truth that can be re-read

**Quality impact:** None
- `.planning/` artifacts are already the canonical source of truth
- Memory tool is a convenience for cross-session context, not a requirement
- GitHub Copilot Memory validates against repository citations anyway

**Files that replace memory:**

| Purpose | Memory equivalent | File location |
|---|---|---|
| Project state | Session memory | `.planning/STATE.md` |
| Phase progress | Session memory | `.planning/phases/*/SUMMARY.md`, `VERIFICATION.md` |
| Decisions | User memory | `.planning/STATE.md` checkpoint log |
| Architecture facts | Repo memory | `.planning/research/ARCHITECTURE.md`, `STACK.md` |
| Requirements | Repo memory | `.planning/REQUIREMENTS.md` |

**Example workflow:**

Without memory:
```
To resume work:
1. Read `.planning/STATE.md` for current position
2. Read relevant phase directory for context
3. Proceed with next task
```

With memory:
```
To resume work:
1. Recall from memory
2. Verify against `.planning/STATE.md`
3. Proceed with next task
```

---

## Terminal Execution Fallback

### When terminal execution is unavailable or disabled

**Fallback approach:**
1. Generate the command to be executed
2. Document it in the plan or verification checklist
3. Request user to execute manually
4. User provides output via screenshot or copy-paste
5. Record user-provided evidence in verification artifacts

**Quality impact:** Medium
- Adds manual step and latency
- Evidence is user-supplied (trust required)
- Cannot verify in real-time

**When to use:**
- Verification steps that require running tests
- Build commands
- CLI tool invocations
- Git operations (if needed)

**Example workflow:**

Without terminal:
```
Verification step: Check if tests pass

Agent: "Please run the following command and provide the output:
  `npm test`"

User: [runs command, pastes output]

Agent: [records result in VERIFICATION.md with note "User-verified: <timestamp>"]
```

With terminal:
```
Verification step: Check if tests pass

Agent: [runs `npm test` via terminal]
Agent: [records output in VERIFICATION.md]
```

---

## File Edit Fallback

### When file editing is disabled

**Fallback approach:**
1. Generate the exact file content or diff to be applied
2. Provide it to user in a copyable format (code block or diff)
3. User applies changes manually
4. User confirms completion
5. Read the file to verify changes were applied

**Quality impact:** High
- Requires manual intervention for every file change
- Error-prone (user might apply incorrectly)
- Latency increased significantly

**When to use:**
- Reduced-capability mode
- Permission-restricted environments

**Example workflow:**

Without file edit:
```
Task: Create config.json

Agent: "Please create `config.json` with the following content:

```json
{
  "version": "1.0.0",
  "enabled": true
}
```

User: [creates file manually]
User: "Done"

Agent: [reads file to verify]
```

With file edit:
```
Task: Create config.json

Agent: [creates file directly]
Agent: [continues to next task]
```

---

## Subagent Delegation Fallback

### When runSubagent is unavailable (Orchestrator only)

**Fallback approach:**
1. **Single-agent mode:** Orchestrator works in a consultative/planning role only
2. User manually routes to appropriate agents
3. Orchestrator provides routing recommendations rather than direct delegation

**Quality impact:** High
- Loses automated workflow orchestration
- User becomes the orchestrator
- Increased cognitive load on user

**When to use:**
- Environments where multi-agent coordination is disabled
- Debugging delegation issues
- Single-task focused work

**Example workflow:**

Without subagent delegation:
```
Orchestrator: "I recommend the following workflow:
1. Use @researcher to research Next.js patterns
2. Use @planner to create a roadmap
3. Use @coder to implement

Please invoke each agent as needed."

User: [manually switches to each agent]
```

With subagent delegation:
```
Orchestrator: [calls runSubagent(Researcher)]
Orchestrator: [calls runSubagent(Planner)]
Orchestrator: [calls runSubagent(Coder)]
```

---

## Web Access Fallback

### When web search is unavailable

**Fallback approach:**
1. Rely on training data (with timestamp caveats)
2. Use Context7 if available
3. Request user to provide specific documentation or information
4. Reduce scope to known/verified patterns only

**Quality impact:** Very High
- May miss recent updates
- Cannot verify current best practices
- Limited to training data cutoff

**Mitigation:**
- Always caveat with "as of training data (6-18 months stale)"
- Request user confirmation for critical technology choices
- Prefer well-established libraries with stable APIs

---

## Fallback Decision Matrix

Use this table to determine the appropriate fallback:

| Tool Unavailable | Fallback Strategy | Use When |
|---|---|---|
| Context7 | Web docs + manual citation | Always if Context7 missing |
| Memory | `.planning/` artifacts only | Always if memory missing |
| Terminal | User executes + provides output | Verification, testing, CLI tasks |
| File edit | User applies changes manually | All implementation tasks in reduced mode |
| Subagent delegation | Single-agent mode, user routes | Orchestration tasks |
| Web search | Training data + user input | Research tasks when web unavailable |

---

## Fallback Quality Assessment

| Capability | With Tool | With Fallback | Quality Delta |
|---|---|---|---|
| Research | High (structured) | Medium-High (manual synthesis) | Acceptable |
| State persistence | High (memory + files) | High (files only) | None |
| Verification | High (automated) | Medium (manual) | Acceptable with discipline |
| Implementation | High (automated) | Low (manual) | Significant - avoid if possible |
| Orchestration | High (automated) | Low (manual routing) | Significant - single-agent preferred |

---

## Recommendations

1. **Enable file edit and terminal execution** if planning to execute implementation phases
2. **Operate in standard mode without Context7 if needed** — fallback is robust
3. **Never depend on memory tool** — always use `.planning/` as source of truth
4. **Flag reduced-capability mode early** — set expectations for manual workflow

---

**Last updated:** (To be filled)
