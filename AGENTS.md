# AGENTS.md — opencode-effect-enforcer

## Project Overview

OpenCode plugin that enforces Effect-first development patterns. Detects code
smells via pattern definitions (markdown + YAML frontmatter), enforces minimum
skill loading before Effect code writes, ensures a local Effect v4 source
reference clone, and ships 39 Effect skills + comprehensive docs.

## Build / Lint / Test Commands

```bash
# Package manager — always use bun (pinned to 1.3.11)
bun install

# Type-check + lint + format (auto-fixes)
bun run check            # runs: vp check --fix

# Build
bun run build            # runs: vp build

# Run all tests
bun run test             # runs: vitest run

# Run a single test file
bunx vitest run patterns/code-smells/avoid-any.test.ts

# Run tests matching a name pattern
bunx vitest run -t "avoid-any"

# Run tests in watch mode (not in scripts, but useful during dev)
bunx vitest patterns/code-smells/avoid-any.test.ts
```

Test timeout is 30 seconds. Pool is `forks` with `isolate: false`.
Tests live in `test/` (harness) and `patterns/code-smells/*.test.ts` (pattern tests).

## Project Structure

```
src/
  index.ts               # Public API re-exports
  plugin.ts              # Minimal default export for OpenCode plugin loader
  enforcer.ts            # Main plugin implementation (hooks, session state)
  patterns.ts            # Pattern engine: load, validate, match definitions
  frontmatter.ts         # YAML frontmatter parsing + body extraction
  constants.ts           # Shared constants (regexes, thresholds, URLs)
  functions/             # Standalone utility functions
    detectEffectVersion.ts
    ensureReferenceClone.ts
  text-imports.d.ts      # Ambient module declaration for *.md text imports
test/
  pattern-test-harness.ts  # Shared test builders (testPattern, testBashPattern, etc.)
patterns/code-smells/      # Pattern definitions (.md) + co-located tests (.test.ts)
skills/                    # 39 effect-* skill directories
docs/                      # Guidance documents injected into sessions
```

## Code Style

### Formatting (vite-plus fmt)

- **Indentation**: tabs (width 4). JSON files use 2-space indent.
- **Quotes**: single quotes for JS/TS.
- **Semicolons**: always.
- **Trailing commas**: none (last element has no comma).
- **Print width**: 80 columns.
- **Arrow parens**: always — `(x) => x`, not `x => x`.
- **Bracket spacing**: `{ foo }` not `{foo}`.
- **End of line**: LF.

### Imports

- Use **explicit `.ts` extensions** in all relative imports:
  `import { foo } from './bar.ts';`
- Use `import type` for type-only imports. Inline `type` in mixed imports:
  `import { type Foo, bar } from './module.ts';`
- **verbatimModuleSyntax** is enabled — never use `import` for types that
  should be `import type`.
- Effect subpath imports — import from `effect/Array`, `effect/Option`, etc.,
  not from the top-level `effect` barrel:
  ```ts
  import * as Arr from 'effect/Array';
  import * as Option from 'effect/Option';
  import * as Schema from 'effect/Schema';
  ```
- Node built-ins use the `node:` prefix: `import * as fs from 'node:fs';`
- **Import order**: (1) `import type` / third-party types, (2) node builtins,
  (3) third-party packages, (4) local imports. Blank line between groups.

### TypeScript

- **Strict mode** with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `useUnknownInCatchVariables`, `noImplicitReturns`, `noFallthroughCasesInSwitch`.
- **No `any`** — lint rule `@typescript-eslint/no-explicit-any: error`.
  Exception: test files and `src/helpers.ts`.
- **No non-null assertions** (`!`) — lint rule enforced.
  Exception: test files.
- **No `@ts-ignore`** — use `@ts-expect-error` with a comment when needed.
- Target is `ESNext`. Module is `Preserve` with `bundler` resolution.

### Naming Conventions

- **Functions / variables**: `camelCase` — `getPatterns`, `testRegex`, `readPattern`.
- **Types / interfaces**: `PascalCase` — `PatternDefinition`, `PatternEvent`.
- **Constants**: `UPPER_SNAKE_CASE` for true constants — `MIN_EFFECT_SKILLS`,
  `WRITE_TOOLS`, `EFFECT_CODE_RE`. PascalCase for Schema definitions.
- **Files**: `camelCase.ts` for functions, `kebab-case` only in pattern `.md` files.
- **Exported functions**: use `const` + arrow — `export const foo = (): void => { ... }`.
  Never use `function` declarations for exports.

### Code Patterns

- **Pure functions over classes.** No class definitions in this codebase.
  All logic uses `const` arrow functions and module-level state where needed.
- **Section dividers** — use box-drawing comments to separate logical sections:
  `// ─── Section Name ─────────────────────────────────────────`
- **JSDoc module comments** — every file starts with a `/** ... */` block
  describing the module's purpose.
- **Effect idioms** — use `Effect.gen(function* () { ... })` for effectful
  pipelines, `Schema.Struct` for data validation, `Option`/`Array`/`Order`
  from Effect rather than native equivalents.
- **Bun text imports** — markdown files are imported as strings via
  `import doc from '../file.md' with { type: 'text' };`

### Error Handling

- **Silent failures for non-critical paths.** Functions like pattern loading
  and file reading use try/catch with empty catch blocks — a missing pattern
  file should never crash the plugin.
- **Explicit `throw new Error(...)` for enforcement.** Blocking actions
  (`deny`) throw errors with descriptive messages.
- **No `throw` inside Effect.gen** — use `yield* Effect.fail(...)` instead
  (this is one of the enforced code smells).
- **`catch` blocks use empty destructuring** — `catch { }` not `catch (e) { }`,
  unless the error is used.

### Testing

- Test framework: **vitest** with **@effect/vitest** for Effect-aware matchers.
- Pattern tests use the shared harness from `test/pattern-test-harness.ts`.
  Each pattern `.md` has a co-located `.test.ts` in `patterns/code-smells/`.
- Harness exports: `testPattern`, `testBashPattern`, `testWritePattern`,
  `testFilePathPattern` — pick the one matching the pattern's tool/detector.
- Pattern test files are concise — typically under 25 lines. They call
  one harness function with `shouldMatch` / `shouldNotMatch` arrays.
- Test files may use `any` and non-null assertions — lint rules are relaxed.
- Effect test harness uses `BunServices.layer` to provide platform services.
- No `globals: true` — always import `describe`, `it`, `expect` explicitly
  from `@effect/vitest` (or `vitest` for non-Effect tests).

### Pattern Definitions

Pattern `.md` files use YAML frontmatter with these fields:
- `name` (required), `description`, `pattern` (required, regex or AST pattern)
- `detector`: `regex` (default) or `ast` (uses @ast-grep/napi)
- `event`: `before` or `after` (when to check)
- `tool`: regex matching tool names (e.g., `(edit|write)`, `bash`)
- `glob`: picomatch glob for file path filtering
- `action`: `context` (inform), `ask` (warn), `deny` (block)
- `level`: `critical`, `high`, `medium`, `warning`, `info`
- `suggestSkills`: array of skill names to suggest loading
- Body after frontmatter is the explanation shown to the agent.

When adding a new pattern, always create both the `.md` definition and a
co-located `.test.ts` file. Run the test to verify match/non-match behavior.
