---
action: context
tool: (edit|write)
event: after
name: avoid-node-imports
description: Use @effect/platform abstractions instead of node: imports — catch-all for modules without a dedicated rule
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - kind: import_statement
              - regex: '["'']node:[^"'']+["'']'
              - not:
                    regex: '["'']node:(?:fs(?:/promises)?|path|os|child_process|https?)["'']'
        - all:
              - pattern: require($SPEC)
              - not:
                    regex: 'node:(?:fs(?:/promises)?|path|os|child_process|https?)'
        - all:
              - pattern: import($SPEC)
              - not:
                    regex: 'node:(?:fs(?:/promises)?|path|os|child_process|https?)'
constraints:
    SPEC:
        regex: '^["'']node:[^"'']+["'']$'
level: warning
suggestSkills:
    - effect-platform-abstraction
---

# Use @effect/platform Instead of `node:` Imports

This is the **catch-all** rule for `node:*` imports that don't have a more specific pattern. Modules with a dedicated rule are excluded here to avoid duplicate diagnostics:

| `node:` module          | Dedicated rule                  |
| ----------------------- | ------------------------------- |
| `fs`, `fs/promises`     | `use-filesystem-service`        |
| `path`                  | `use-path-service`              |
| `os`                    | `use-temp-file-scoped`          |
| `child_process`         | `use-command-executor-service`  |
| `http`, `https`         | `use-http-client-service`       |

Everything else (`node:stream`, `node:url`, `node:readline`, `node:crypto`, `node:net`, …) falls under this rule.

```haskell
-- Transformation
import "node:*"     :: Node -> IO a        -- platform-coupled, untestable

-- Instead
@effect/platform   :: Effect a R          -- platform-agnostic, testable
```

```haskell
-- Pattern (catch-all examples — covered modules are routed to their dedicated rule)
bad :: Node -> IO
bad = do
  stream <- "node:stream"                  -- → use Stream from effect
  url    <- "node:url"                     -- → URL is a Schema codec
  rl     <- "node:readline"                -- → use Terminal service

good :: Effect a (Stream | Terminal | …)
good = do
  stream <- Stream.fromReadableStream      -- platform-agnostic
  term   <- Terminal.Terminal              -- via @effect/platform
```

**Platform module mappings (full):**

| `node:` import       | Effect Platform                                                       |
| -------------------- | --------------------------------------------------------------------- |
| `node:fs`            | `FileSystem.FileSystem`                                               |
| `node:fs/promises`   | `FileSystem.FileSystem`                                               |
| `node:path`          | `Path.Path`                                                           |
| `node:os`            | `FileSystem.makeTempFileScoped` / `Path.Path` / platform layer        |
| `node:child_process` | `ChildProcessSpawner` + `ChildProcess` from `effect/unstable/process` |
| `node:http`          | `HttpClient.HttpClient`                                               |
| `node:https`         | `HttpClient.HttpClient`                                               |
| `node:stream`        | `Stream` from effect                                                  |
| `node:readline`      | `Terminal.Terminal`                                                   |
| `node:crypto`        | `Crypto` from `effect/unstable/crypto` or a wrapped Effect service    |

**Exceptions:**

- Build scripts and tooling config (`vite.config.ts`, `build.ts`, etc.)
- Platform-specific layers that implement Effect platform services
