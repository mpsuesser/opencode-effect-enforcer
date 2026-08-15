# opencode-effect-enforcer

An OpenCode V2 plugin that makes Effect v4 guidance available where the model
needs it and reviews completed TypeScript writes against a tested Effect pattern
catalog.

This is the OpenCode port of
[`pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness). Its skills,
guidance, pattern definitions, and pattern detector cases were copied directly
from the latest Pi harness source. The host adapter is intentionally smaller:
there is no Effect Mode or persistence layer because OpenCode can enable and
disable plugins itself.

## What It Does

- Registers all 54 bundled `effect-*` skills with OpenCode's native skill
  catalog.
- Injects the four bundled Effect-first guidance documents into model system
  context.
- Observes successful `write`, `edit`, and `apply_patch` tool calls.
- Runs all 46 ast-grep and regex patterns against newly added text.
- Appends severity-ordered remediation guidance to the completed tool result so
  the model reviews the finding immediately.
- Keeps pattern findings advisory. A failed inspection never fails or blocks the
  underlying write.

## Install

OpenCode V2 is currently beta, and its plugin API may change. This package pins
the compatible `@opencode-ai/plugin` prerelease.

For local development, add the package directory to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-effect-enforcer/src/index.ts"]
}
```

After publication, use the package name:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-effect-enforcer"]
}
```

Verify that OpenCode loaded it:

```sh
opencode2 api get /api/plugin
```

### Disable For An Agent

Set `opencode-effect-enforcer: false` in the agent's `request.body`. The plugin
consumes this setting before requests are built, so it is not sent to the model
provider. For a Markdown agent:

```md
---
description: Handles non-code research
mode: subagent
request:
  body:
    opencode-effect-enforcer: false
---

Research the requested topic without modifying code.
```

The equivalent `opencode.jsonc` agent is:

```jsonc
{
  "agents": {
    "researcher": {
      "description": "Handles non-code research",
      "mode": "subagent",
      "request": {
        "body": {
          "opencode-effect-enforcer": false,
        },
      },
    },
  },
}
```

For an opted-out agent, the plugin does not inject Effect guidance, advertise
or allow its `effect-*` skills, or run post-write pattern enforcement.

The exported plugin ID is `opencode.effect-enforcer`. Disable it without
removing the package entry by adding a later selector:

```jsonc
{
  "plugins": ["opencode-effect-enforcer", "-opencode.effect-enforcer"]
}
```

## Layout

```text
src/        OpenCode V2 adapter and portable pattern engine
skills/     54 source skills, including supporting assets
guidance/   4 source guidance documents
patterns/   46 source pattern definitions
test/       copied per-pattern cases plus cross-cutting matcher tests
```

There is no generated `dist` tree. OpenCode imports the TypeScript entrypoint,
and npm publishes these authoritative source directories directly.

## Development

```sh
bun install
bun run check
bun run test
```

`bun run test` includes a bidirectional inventory test: every pattern must have
one same-named detector test, and every detector test must have a pattern.

## Pattern Semantics

Patterns run after successful writes. For edits and patches, the plugin captures
the original files and computes changed spans from the actual final output. A
pre-existing violation outside added text is therefore not reported as a new
finding. Full-file writes and newly created files treat the complete resulting
file as changed.

The matcher supports:

- TypeScript, TSX, JavaScript, and JSX ast-grep detectors
- Full ast-grep rule objects and constraints
- Regex detectors with comment filtering
- Include and ignore globs
- Severity ordering and skill suggestions

## License

MIT
