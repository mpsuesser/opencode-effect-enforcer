[![npm version](https://img.shields.io/npm/v/opencode-effect-enforcer.svg)](https://www.npmjs.com/package/opencode-effect-enforcer)

# opencode-effect-enforcer

An [OpenCode](https://opencode.ai) plugin that enforces **Effect v4** development patterns in real time. It watches every tool call your coding agent makes — edits, writes, bash commands — and catches code smells, blocks dangerous patterns, and nudges your agent toward idiomatic Effect code before mistakes land in your codebase.

Ships with **44 code smell detectors**, **39 loadable Effect skills**, and **comprehensive guidance docs** that get injected into every session. Designed for teams and individuals who want their AI coding agent to write Effect v4 the way it should be written.

## Table of Contents

- [What This Plugin Does](#what-this-plugin-does)
- [Installation](#installation)
- [How It Works](#how-it-works)
    - [Pattern Detection Engine](#pattern-detection-engine)
    - [Skill Gate](#skill-gate)
    - [Guidance Injection](#guidance-injection)
    - [Reference Clone](#reference-clone)
- [Code Smell Patterns](#code-smell-patterns)
    - [Full Pattern List](#full-pattern-list)
    - [Action Levels](#action-levels)
    - [Pattern Anatomy](#pattern-anatomy)
- [Effect Skills](#effect-skills)
- [Configuration](#configuration)
- [Development](#development)
- [License](#license)

## What This Plugin Does

When your coding agent writes or edits code in an OpenCode session, this plugin:

1. **Detects code smells** — 44 pattern definitions catch common anti-patterns like `as any`, `throw` inside `Effect.gen`, raw `try/catch`, direct `node:fs` imports, `JSON.parse` usage, mutable state, and more. Each pattern triggers a context hint, a warning, or a hard block depending on severity.

2. **Enforces skill loading** — Before the agent can write any Effect code, it must have loaded at least 7 of the 39 bundled `effect-*` skills. This prevents the agent from guessing at Effect v4 APIs (which differ substantially from v3) and forces it to read the actual documentation first.

3. **Injects session guidance** — On the first message of every session (and after context compaction), the plugin injects two documents: a progressive disclosure guide that teaches the agent how to use the local Effect v4 reference, and a comprehensive Effect-first development guide covering 39 laws and conventions with code examples.

4. **Maintains a local Effect v4 reference** — On startup and periodically during sessions, the plugin ensures a shallow clone of the Effect v4 source code exists at `.references/effect-v4/` in your project. This gives the agent a local copy of Effect source, schema docs, migration guides, and HTTP API docs to read from directly, rather than hallucinating APIs.

## Installation

Install the package:

```bash
npm install opencode-effect-enforcer
# or
bun add opencode-effect-enforcer
# or
pnpm add opencode-effect-enforcer
```

Then add it to your OpenCode config:

```jsonc
// opencode.json
{
	"$schema": "https://opencode.ai/config.json",
	"plugin": ["opencode-effect-enforcer"]
}
```

That's it. The plugin activates automatically on the next OpenCode session.

## How It Works

The plugin registers hooks on four OpenCode lifecycle events: `config`, `chat.message`, `tool.execute.before`, and `tool.execute.after`. Here's what each one does.

### Pattern Detection Engine

The core of the plugin is a pattern matching engine that loads definitions from markdown files in `patterns/code-smells/`. Each definition is a `.md` file with YAML frontmatter specifying the detection rules.

On every `tool.execute.before` and `tool.execute.after` event, the engine:

1. Loads all pattern definitions (cached after first read)
2. Filters to patterns matching the current tool name, event timing, and file glob
3. Tests the tool's content (code being written, command being run) against each pattern's regex or AST rule
4. Groups matches by action: `deny` patterns throw an error to block the tool call, `ask` patterns inject a warning, and `context` patterns inject informational hints

Patterns support two detectors:

- **Regex** (default) — tests content against a regular expression
- **AST** — uses [@ast-grep/napi](https://ast-grep.github.io/) to match structural code patterns with optional `inside` constraints (e.g., "match `throw` only inside `Effect.gen`")

### Skill Gate

The plugin tracks which `effect-*` skills have been loaded per session. When the agent attempts to write or edit a file containing Effect code (detected via regex matching `\bEffect\b` or Effect import statements), the plugin checks the count of loaded skills.

If fewer than 7 Effect skills have been loaded, the write is blocked with an error message telling the agent how many more skills it needs to load. This is enforced in the `tool.execute.before` hook for the `write` and `edit` tools.

The threshold (7) is defined in `src/constants.ts` as `MIN_EFFECT_SKILLS`. The rationale: Effect v4 is a large ecosystem with significant API changes from v3. Without sufficient context, agents reliably produce incorrect code. Loading skills forces the agent to internalize the actual v4 API surface before writing.

### Guidance Injection

On the first message in each session, the plugin injects two documents as synthetic prompts:

- **Progressive disclosure guidance** (`docs/progressive-disclosure-guidance.md`) — Tells the agent to load skills before writing code, and points it to the `.references/effect-v4/` local clone for API disambiguation. Key reference paths include `LLMS.md`, `MIGRATION.md`, `SCHEMA.md`, `HTTPAPI.md`, and the actual Effect source in `packages/effect/src/`.

- **Effect-first development guide** (`docs/effect-first-development.md`) — A comprehensive document defining 39 laws and conventions (EF-1 through EF-39) for Effect-first development. Covers error handling, Option usage, Schema decoding, canonical imports, Effect module usage over native equivalents, Match-based branching, service design, observability, configuration, concurrency, and more. Includes copy-paste templates and a 45-point review checklist.

Both documents are re-injected after context compaction events to ensure they remain available even in long sessions.

### Reference Clone

On plugin initialization and periodically during tool calls, the plugin ensures a shallow git clone of `Effect-TS/effect-smol` exists at `.references/effect-v4/` in your project directory. The clone targets the git tag matching your project's installed Effect version (detected from `node_modules/effect/package.json`, falling back to `4.0.0-beta.43`).

The clone is:

- **Shallow** (`--depth 1`) to minimize disk usage
- **Atomic** (clones to a `.cloning` temp directory, then renames into place)
- **Concurrent-safe** (a shared promise prevents duplicate clone operations)
- **Silent on failure** (a failed clone never blocks the agent)

This gives the agent direct read access to Effect v4 source code, which is critical for answering API questions accurately.

## Code Smell Patterns

### Full Pattern List

The plugin ships with 44 pattern definitions. Each detects a specific anti-pattern and provides an explanation with Effect-idiomatic alternatives.

| Pattern                        | What It Catches                                                     |
| ------------------------------ | ------------------------------------------------------------------- |
| `avoid-any`                    | `as any` and `as unknown as` type assertions                        |
| `avoid-data-tagged-error`      | Deprecated `Data.TaggedError` usage (use `Schema.TaggedErrorClass`) |
| `avoid-direct-json`            | Raw `JSON.parse` / `JSON.stringify` (use Schema JSON codecs)        |
| `avoid-direct-tag-checks`      | Manual `._tag === "..."` checks (use `Match` or `catchTag`)         |
| `avoid-expect-in-if`           | `expect()` inside if-blocks in tests                                |
| `avoid-fs-promises`            | `fs/promises` imports (use Effect FileSystem service)               |
| `avoid-mutable-state`          | `let` declarations (prefer `const` + Effect Ref)                    |
| `avoid-native-fetch`           | Native `fetch()` calls (use Effect HTTP modules)                    |
| `avoid-node-imports`           | Direct `node:` imports (use `@effect/platform` abstractions)        |
| `avoid-non-null-assertion`     | Non-null assertions `!` (use Option/Schema)                         |
| `avoid-object-type`            | `object` type usage (use Schema or specific types)                  |
| `avoid-option-getorthrow`      | `Option.getOrThrow` (defeats the purpose of Option)                 |
| `avoid-platform-coupling`      | Direct platform-specific imports in domain code                     |
| `avoid-process-env`            | Direct `process.env` access (use Effect Config)                     |
| `avoid-react-hooks`            | React hooks in Effect code (use Effect React patterns)              |
| `avoid-schema-suffix`          | Schema constants named with `Schema` suffix                         |
| `avoid-sync-fs`                | Synchronous `fs` operations (use Effect FileSystem)                 |
| `avoid-try-catch`              | `try/catch` blocks (use `Effect.try` or typed errors)               |
| `avoid-ts-ignore`              | `@ts-ignore` (use `@ts-expect-error` with a comment)                |
| `avoid-untagged-errors`        | Untagged `new Error()` (use Schema.TaggedErrorClass)                |
| `avoid-yield-ref`              | Direct `yield* ref` (removed in v4, use `Ref.get(ref)`)             |
| `casting-awareness`            | Broad type casting patterns                                         |
| `context-tag-extends`          | Old `Context.Tag` extends pattern (use ServiceMap.Service)          |
| `effect-catchall-default`      | Blanket `Effect.catchAll` (use targeted `catchTag`)                 |
| `effect-promise-vs-trypromise` | `Effect.promise` vs `Effect.tryPromise` guidance                    |
| `effect-run-in-body`           | `Effect.runSync`/`runPromise` outside entry points                  |
| `imperative-loops`             | `for`/`for...of` loops (use `Arr.map`/`Effect.forEach`)             |
| `prefer-arr-sort`              | Native `.sort()` (use `Arr.sort` with `Order`)                      |
| `prefer-effect-fn`             | Effect-returning functions not using `Effect.fn`                    |
| `prefer-match-over-switch`     | `switch` statements (use `Match` for exhaustive branching)          |
| `prefer-option-over-null`      | `\| null` / `\| undefined` in types (use Option)                    |
| `prefer-schema-class`          | `Schema.Struct` usage (prefer `Schema.Class`)                       |
| `stream-large-files`           | Large file reads without streaming                                  |
| `throw-in-effect-gen`          | `throw` inside `Effect.gen` (use `yield* Effect.fail()`)            |
| `tsc-suggest-scripts`          | Raw `tsc` commands (use project scripts)                            |
| `use-clock-service`            | Direct `Date.now()` (use Effect Clock service)                      |
| `use-console-service`          | `console.log` in Effect code (use Effect logging)                   |
| `use-filesystem-service`       | Direct `fs` imports (use FileSystem service)                        |
| `use-path-service`             | Direct `path` imports (use Effect Path service)                     |
| `use-random-service`           | `Math.random()` (use Effect Random service)                         |
| `use-servicemap-service`       | Old Context.Tag service pattern (use ServiceMap.Service)            |
| `use-temp-file-scoped`         | Temp files without scoped cleanup                                   |
| `vm-in-wrong-file`             | ViewModel code in wrong file location                               |
| `yield-in-for-loop`            | `yield*` inside `for` loops (use `Effect.forEach`)                  |

### Action Levels

Each pattern specifies an action that determines what happens when it matches:

- **`context`** — Injects an informational hint into the session. The agent sees the explanation and can decide how to proceed. Most patterns use this level.
- **`ask`** — Injects a warning. Stronger than context but does not block the operation.
- **`deny`** — Throws an error that blocks the tool call entirely. Reserved for the most critical patterns where the code would be fundamentally broken.

Patterns also have a severity level (`critical`, `high`, `medium`, `warning`, `info`) used for sorting when multiple patterns match simultaneously. The highest-severity `deny` or `ask` pattern takes precedence.

### Pattern Anatomy

Each pattern is a markdown file with YAML frontmatter:

```yaml
---
name: throw-in-effect-gen
description: Do not throw inside Effect.gen - use yield* Effect.fail() instead
event: before
tool: (edit|write)
glob: '**/*.{ts,tsx}'
detector: ast
pattern: throw $ERR
inside: Effect.gen($$$ARGS)
action: context
level: error
suggestSkills:
    - effect-error-handling
---
```

The body after the frontmatter contains the explanation shown to the agent, typically including Haskell-style type signatures illustrating the transformation and a prose explanation of why the pattern is problematic.

**Frontmatter fields:**

| Field           | Required | Description                                                       |
| --------------- | -------- | ----------------------------------------------------------------- |
| `name`          | Yes      | Unique identifier for the pattern                                 |
| `pattern`       | Yes      | Regex string or AST pattern to match                              |
| `description`   | No       | Short description of what the pattern catches                     |
| `detector`      | No       | `regex` (default) or `ast`                                        |
| `event`         | No       | `before` or `after` (when to check, default: `after`)             |
| `tool`          | No       | Regex matching tool names (default: `.*`)                         |
| `glob`          | No       | Picomatch glob for file path filtering                            |
| `action`        | No       | `context`, `ask`, or `deny` (default: `context`)                  |
| `level`         | No       | `critical`, `high`, `medium`, `warning`, `info` (default: `info`) |
| `inside`        | No       | AST-only: parent pattern constraint                               |
| `suggestSkills` | No       | Array of skill names to suggest loading                           |

## Effect Skills

The plugin bundles 39 skills covering the Effect v4 ecosystem. Skills are registered via the `config` hook and become available through OpenCode's standard skill loading mechanism. The agent must load at least 7 before writing Effect code.

| Skill                           | Domain                        |
| ------------------------------- | ----------------------------- |
| `effect-ai-chat`                | AI chat integration           |
| `effect-ai-language-model`      | AI language model abstraction |
| `effect-ai-prompt`              | AI prompt construction        |
| `effect-ai-provider`            | AI provider patterns          |
| `effect-ai-streaming`           | AI streaming responses        |
| `effect-ai-tool`                | AI tool definition            |
| `effect-atom-state`             | Atomic state management       |
| `effect-batching`               | Request batching              |
| `effect-cli`                    | CLI application patterns      |
| `effect-command-executor`       | Shell command execution       |
| `effect-concurrency-testing`    | Concurrency test patterns     |
| `effect-config`                 | Configuration loading         |
| `effect-context-witness`        | Context/dependency witnesses  |
| `effect-domain-modeling`        | Domain model design           |
| `effect-domain-predicates`      | Domain predicate patterns     |
| `effect-error-handling`         | Typed error handling          |
| `effect-filesystem`             | FileSystem service usage      |
| `effect-http-api`               | HTTP API definition           |
| `effect-layer-design`           | Layer composition             |
| `effect-managed-runtime`        | Runtime management            |
| `effect-mcp-server`             | MCP server patterns           |
| `effect-observability`          | Logging, metrics, tracing     |
| `effect-optics`                 | Optics/lenses                 |
| `effect-path`                   | Path service usage            |
| `effect-pattern-matching`       | Match-based branching         |
| `effect-platform-abstraction`   | Platform-agnostic code        |
| `effect-platform-layers`        | Platform layer composition    |
| `effect-react-composition`      | React + Effect composition    |
| `effect-react-vm`               | React ViewModel patterns      |
| `effect-rpc-cluster`            | RPC and cluster patterns      |
| `effect-schema-composition`     | Schema composition techniques |
| `effect-schema-v4`              | Schema v4 API reference       |
| `effect-service-implementation` | Service implementation        |
| `effect-sql`                    | SQL database patterns         |
| `effect-stream`                 | Stream processing             |
| `effect-testing`                | Effect test patterns          |
| `effect-typeclass-design`       | Typeclass design patterns     |
| `effect-wide-events`            | Wide event instrumentation    |
| `effect-workflow`               | Workflow orchestration        |

## Configuration

The plugin works out of the box with no configuration. All behavior is determined by the pattern definitions and constants in the source.

Key constants (defined in `src/constants.ts`):

| Constant            | Value                                | Purpose                                             |
| ------------------- | ------------------------------------ | --------------------------------------------------- |
| `MIN_EFFECT_SKILLS` | `7`                                  | Minimum skills required before writing Effect code  |
| `WRITE_TOOLS`       | `write`, `edit`                      | Tool names that trigger the skill gate              |
| `EFFECT_CODE_RE`    | `/\bEffect\b\|from\s+['"]effect.../` | Regex that identifies content as Effect code        |
| `GITHUB_REPO`       | `Effect-TS/effect-smol`              | Repository cloned for local reference               |
| `DEFAULT_VERSION`   | `4.0.0-beta.43`                      | Fallback Effect version for the reference clone tag |

## Development

```bash
# Install dependencies (bun is pinned to 1.3.11)
bun install

# Type-check, lint, and format (auto-fixes)
bun run check

# Build
bun run build

# Run all tests
bun run test

# Run a single test file
bunx vitest run patterns/code-smells/avoid-any.test.ts

# Run tests matching a name pattern
bunx vitest run -t "throw-in-effect-gen"
```

### Adding a New Pattern

1. Create a `.md` file in `patterns/code-smells/` with YAML frontmatter defining the detection rules
2. Create a co-located `.test.ts` file using the test harness:

```ts
import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'my-pattern-name',
	shouldMatch: ['code that should trigger the pattern'],
	shouldNotMatch: ['code that should not trigger it']
});
```

3. Run the test: `bunx vitest run patterns/code-smells/my-pattern-name.test.ts`

The test harness exports `testPattern`, `testBashPattern`, `testWritePattern`, and `testFilePathPattern` depending on what kind of pattern you're testing.

## License

MIT
