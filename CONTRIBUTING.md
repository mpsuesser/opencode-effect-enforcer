# Contributing to opencode-effect-enforcer

Thanks for your interest in contributing. This guide covers everything you need to get started.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.0

## Setup

```sh
git clone https://github.com/mpsuesser/opencode-effect-enforcer.git
cd opencode-effect-enforcer
bun install
```

## Development Workflow

```sh
bun run check       # lint + format + typecheck (auto-fix)
bun run test        # run all tests
```

Run a single test file or by name:

```sh
bunx vitest run test/avoid-any.test.ts
bunx vitest run -t "throw-in-effect-gen"
```

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`.
2. Add or update tests for any changed behavior.
3. New patterns must have a co-located `.test.ts` file.
4. Make sure checks pass:
    ```sh
    bun run check && bun run test
    ```
5. Open a pull request with a clear description of the change.

## Code Style

See [AGENTS.md](./AGENTS.md) for detailed formatting, import ordering, naming conventions, and Effect patterns used in this project. The key points:

- Tabs, single quotes, semicolons, no trailing commas
- `const` + arrow functions for all exports
- Effect modules over native JS equivalents
- `import type` for type-only imports
- Explicit `.ts` extensions in all relative imports

## Adding a New Pattern

1. Create a `.md` file in `patterns/` with YAML frontmatter
2. Create a `.test.ts` in `test/` using the test harness from `test/pattern-test-harness.ts`
3. Run the test: `bunx vitest run test/your-pattern.test.ts`

## Reporting Issues

Use the [GitHub issue templates](https://github.com/mpsuesser/opencode-effect-enforcer/issues/new/choose) for bug reports and feature requests.
