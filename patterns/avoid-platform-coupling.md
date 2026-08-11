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
              - regex: '["'']@effect/platform-(?:bun|node)(?:/[^"'']*)?["'']'
        - pattern: require($SPEC)
        - pattern: import($SPEC)
constraints:
    SPEC:
        regex: '^["'']@effect/platform-(?:bun|node)(?:/[^"'']*)?["'']$'
level: warning
suggestSkills:
    - effect-platform-layers
---

# Avoid Platform Coupling in Bindings

```haskell
-- Transformation
concrete :: @effect/platform-bun    -- tied to Bun runtime
abstract :: effect services         -- portable across runtimes

-- Pattern
bad  :: packages/*/binding/
bad  = import { BunServices } from "@effect/platform-bun"
bad  = Layer.provide(BunServices.layer)        -- hardwired platform

good :: packages/*/binding/
good = Layer.provide(platformLayer)          -- no platform coupling
good = -- runtime provides ChildProcessSpawner, FileSystem, etc.
```

Binding packages wrap external systems (CLIs, APIs, databases) and must be platform-agnostic. They should depend on abstract services from `effect` and its unstable namespaces, such as `FileSystem`, `Path`, `HttpClient`, and `ChildProcessSpawner`, but never on `@effect/platform-bun` or `@effect/platform-node` concrete implementations.

Platform-specific layers (`BunServices.layer`, `NodeServices.layer`) belong in the runtime or CLI entry point, not in bindings. The runtime provides concrete implementations of abstract Effect services there.
