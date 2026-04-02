# Changelog

## 0.1.0 — Initial Release

OpenCode plugin that enforces Effect-first development patterns.

### Features

#### Pattern Detection Engine

Real-time code smell detection across tool calls with 44 pattern definitions.

- **Regex detector** — tests tool content against regular expressions
- **AST detector** — uses @ast-grep/napi for structural code pattern matching with `inside` constraints
- Three action levels: `context` (inform), `ask` (warn), `deny` (block)
- Five severity levels: `critical`, `high`, `medium`, `warning`, `info`
- File glob filtering via picomatch
- Tool name regex matching for targeted detection

#### Skill Gate

Enforces minimum Effect skill loading before the agent can write Effect code.

- Tracks loaded `effect-*` skills per session
- Blocks writes to Effect files until at least 7 skills are loaded
- Prevents agents from guessing at Effect v4 APIs

#### Guidance Injection

Injects Effect-first development guides into every session.

- Progressive disclosure guidance document
- Comprehensive Effect-first development guide (39 laws and conventions)
- Re-injected after context compaction events

#### Reference Clone

Maintains a local shallow clone of Effect v4 source code.

- Clones `Effect-TS/effect-smol` at the detected Effect version tag
- Atomic clone with `.cloning` temp directory
- Concurrent-safe with shared promise deduplication
- Silent on failure — never blocks the agent

#### 39 Effect Skills

Bundled skills covering the Effect v4 ecosystem: AI, batching, CLI, config, domain modeling, error handling, filesystem, HTTP API, layers, MCP, observability, optics, pattern matching, platform abstraction, React integration, RPC, Schema v4, SQL, streams, testing, workflows, and more.
