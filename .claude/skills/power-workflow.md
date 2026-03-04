# Power Workflow — Claude Code Best Practices

## ⚠️ Golden Rules

1. **ALL code operations go through Claude Code CLI.** Never write code directly — always delegate to `claude` via terminal. This applies to: file creation, editing, refactoring, debugging, testing, committing. No exceptions.
2. **Never work alone.** Always use sub-agents. Split tasks across multiple Claude Code instances by domain. One agent architects, another implements, another reviews. Orchestrate like a conductor — you plan and coordinate, sub-agents execute.

## Core Loop: Plan → Execute → Verify

Every task, no exceptions.

1. **Plan** — Switch to Plan Mode (`shift+tab`) before coding. Analyze the full codebase, craft a step-by-step plan. Blueprints before building. A good plan completes the task in one shot.
2. **Execute** — Implement the plan. Use the strongest model available (opus > sonnet). Fewer corrections = net faster.
3. **Verify** — Self-check after every task. Run tests, build, lint. Fix what breaks before reporting done. This alone improves output quality 2-3x.

## MCP Servers — When to Use What

Connected MCP servers and their purposes:

| MCP Server | When to Use |
|------------|-------------|
| **context7** | Fetch up-to-date library docs before using unfamiliar APIs. Use `resolve-library-id` → `get-library-docs` before writing code with any third-party library. |
| **playwright** | Browser automation and E2E testing. Use for testing web UIs, scraping, or interacting with browser-based tools. |
| **serena** | Code intelligence — semantic code search, symbol resolution, cross-file references. Use when navigating large codebases or finding usages/definitions. |
| **figma** | Pull designs from Figma files. Use when implementing UI from a Figma design — get exact colors, spacing, component specs. |
| **supabase** | Manage Supabase projects — run SQL, manage tables, check logs. Use for any Supabase-backed project. |
| **Notion** | Read/update Notion pages and databases. Use when syncing project docs, pulling specs, or updating status pages. |
| **episodic-memory** | Search past Claude Code conversations. Use when you need context from previous sessions — "what did we decide about X?" |
| **superpowers-chrome** | Control Chrome browser directly. Use for live browser testing, filling forms, debugging frontend issues. |

### MCP Usage Patterns
```bash
# Load specific MCP config for a project
claude --mcp-config ./mcp-config.json

# Use only specific MCPs (ignore global ones)
claude --strict-mcp-config --mcp-config ./project-mcp.json
```

**Rule of thumb:** Always hit context7 before using a library you haven't touched recently. Docs change — your training data doesn't.

## Agents — Pick the Right One

### Task-Specific Agents
| Agent | Model | When to Use |
|-------|-------|-------------|
| `code-simplifier:code-simplifier` | opus | Reduce complexity — simplify convoluted functions, remove dead code |
| `feature-dev:code-architect` | sonnet | Design architecture before implementation — get structure right first |
| `feature-dev:code-explorer` | sonnet | Understand unfamiliar codebases — trace call paths, find patterns |
| `feature-dev:code-reviewer` | sonnet | Pre-commit review — catch bugs before PR |
| `pr-review-toolkit:code-reviewer` | opus | Deep PR review — security, correctness, edge cases |
| `pr-review-toolkit:code-simplifier` | opus | Simplify code in PR context |
| `pr-review-toolkit:silent-failure-hunter` | inherit | Find silently swallowed errors, missing error handling |
| `pr-review-toolkit:type-design-analyzer` | inherit | Review type design — generics, interfaces, discriminated unions |
| `superpowers-chrome:browser-user` | sonnet | Automate browser tasks — fill forms, navigate, screenshot |
| `episodic-memory:search-conversations` | haiku | Fast search through past sessions |
| `Explore` | haiku | Quick codebase exploration — cheap, fast reads |
| `Plan` | inherit | Dedicated planning mode — architecture and strategy |

### Usage
```bash
# Use a specific agent
claude --agent "feature-dev:code-architect"
claude --agent "pr-review-toolkit:code-reviewer"
claude --agent "Explore"

# Define custom agents inline
claude --agents '{"backend": {"description": "Backend specialist", "prompt": "You are a Node.js backend expert focused on Electron main process code"}}'
```

### Agent Strategy for Parallel Work
```
Instance 1: claude --agent "feature-dev:code-architect"   # Design phase
Instance 2: claude --agent "feature-dev:code-explorer"    # Research existing code
Instance 3: claude (default)                              # Implementation
Instance 4: claude --agent "pr-review-toolkit:code-reviewer"  # Review when done
```

## Plugins / Skills — What's Available

### Core Workflow Plugins
| Plugin | Purpose |
|--------|---------|
| **superpowers** | Enhanced planning, debugging, verification workflows |
| **feature-dev** | Architect → explore → implement → review pipeline |
| **code-review** | Structured code review with severity ratings |
| **commit-commands** | Smart atomic commits with conventional format |
| **pr-review-toolkit** | Deep PR analysis — 6 specialized review agents |
| **security-guidance** | Security audit patterns, vulnerability detection |
| **ralph-loop** | Iterative refinement loop — run → check → fix → repeat |

### Language & Framework Plugins
| Plugin | Purpose |
|--------|---------|
| **typescript-lsp** | TypeScript language server — type checking, autocomplete |
| **pyright-lsp** | Python type checking |
| **playwright** | Browser testing framework integration |
| **hookify** | Analyze conversation patterns, suggest improvements |

### External Service Plugins
| Plugin | Purpose |
|--------|---------|
| **context7** | Up-to-date library documentation |
| **figma** | Design-to-code from Figma |
| **supabase** | Database management |
| **Notion** | Doc syncing |
| **gitlab** | GitLab integration (needs auth) |
| **sentry** | Error tracking (needs auth) |
| **vercel** | Deployment management |

### AI/ML Plugins
| Plugin | Purpose |
|--------|---------|
| **huggingface-skills** | HF model training, datasets, evaluation, paper publishing |
| **episodic-memory** | Persistent memory across sessions |

## Parallel Instances

Run multiple Claude Code windows for different tasks/domains simultaneously.

- One instance per domain: backend, frontend, database, tests
- Each gets its own `workdir` scope — less confusion, better output
- Enable notifications: `claude config set --global preferredNotifChannel terminal_bell`
- Work on other things while Claude runs; check on notification sound

## Project Memory

Claude forgets between sessions. Files are memory.

### CLAUDE.md (auto-loaded)
At project root. Must include:
- Architecture overview
- Build/run/test commands
- Code conventions + forbidden patterns
- Key decisions and rationale

### Error Notepad (.claude/notes.md)
Record team rules, direction, and repeated mistakes. Reference from CLAUDE.md:
```
Read .claude/notes.md before starting any task.
```

### Session Continuity
Before ending: "Save current plan and progress to .claude/session-state.md"
Next session: "Read .claude/session-state.md and continue"

## Design-Driven Development

Before coding, write a design doc:
```markdown
# Feature: [Name]
## Problem
## Solution
## Architecture
## API / Interface
## Data Model
## Edge Cases
## Acceptance Criteria
```

Give Claude the design doc → codes with clarity → fewer revisions.

## Custom Commands (.claude/commands/)

Save recurring task sequences as slash commands:

```markdown
# .claude/commands/review.md
Review all staged changes (git diff --cached).
For each file: check bugs, security, naming, test coverage.
Output summary with severity ratings.
```

```markdown
# .claude/commands/test-and-fix.md
Run full test suite. For failures:
1. Analyze root cause
2. Fix code (not the test, unless test is wrong)
3. Re-run until all pass
```

```markdown
# .claude/commands/commit.md
Review changes, write conventional commit message, commit.
Split into atomic commits if changes span multiple concerns.
```

Usage: `/project:review`, `/project:test-and-fix`, `/project:commit`

## Model Selection

| Scenario | Model | Why |
|----------|-------|-----|
| Architecture, complex refactor, hard bugs | opus | Fewer corrections |
| Routine edits, bulk changes | sonnet | Speed matters more |
| Quick exploration, reads | haiku (via Explore agent) | Cheap, fast |

**Default to strongest.** Time saved from fewer corrections > slower response time.

## Quick Reference

| Action | Command |
|--------|---------|
| Plan mode | `shift+tab` or `--agent Plan` |
| Explore codebase cheap | `--agent Explore` |
| Deep code review | `--agent "pr-review-toolkit:code-reviewer"` |
| Architecture design | `--agent "feature-dev:code-architect"` |
| Fetch library docs | Use context7 MCP: `resolve-library-id` → `get-library-docs` |
| Search past sessions | Use episodic-memory MCP or `--agent "episodic-memory:search-conversations"` |
| Browser automation | Use playwright MCP or `--agent "superpowers-chrome:browser-user"` |
| Resume last session | `claude --continue` or `claude --resume` |
| One-shot task | `claude -p "task"` |
| Skip permissions | `--dangerously-skip-permissions` |
| Notifications | `claude config set --global preferredNotifChannel terminal_bell` |
