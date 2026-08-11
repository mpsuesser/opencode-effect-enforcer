---
action: context
tool: (edit|write)
event: after
name: avoid-platform-coupling
description: Binding packages should not import platform-specific packages like @effect/platform-bun
glob: 'packages/*/binding/**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - kind: import_statement
              - regex: '["'']@effect/platform-bun(?:/[^"'']*)?["'']'
        - pattern: require($SPEC)
        - pattern: import($SPEC)
constraints:
    SPEC:
        regex: '^["'']@effect/platform-bun(?:/[^"'']*)?["'']$'
level: warning
suggestSkills:
    - effect-platform-layers
---

# Avoid Platform Coupling in Bindings

```haskell
-- Transformation
concrete :: @effect/platform-bun    -- tied to Bun runtime
abstract :: @effect/platform        -- portable across runtimes

-- Pattern
bad  :: packages/*/binding/
bad  = import { BunContext } from "@effect/platform-bun"
bad  = Layer.provide(BunContext.layer)        -- hardwired platform

good :: packages/*/binding/
good = Layer.provide(platformLayer)          -- no platform coupling
good = -- runtime provides CommandExecutor, FileSystem, etc.
```

Binding packages wrap external systems (CLIs, APIs, databases) and must be platform-agnostic. They should depend on `@effect/platform` (abstract interfaces like `ChildProcessSpawner`, `HttpClient`, `FileSystem`) but never on `@effect/platform-bun` or `@effect/platform-node` (concrete implementations).

Platform-specific layers (`BunContext.layer`, `NodeContext.layer`) belong in the runtime or CLI entry point, not in bindings. The terminal runtime merges `BunContext.layer` and provides `CommandExecutor` to all services automatically.
