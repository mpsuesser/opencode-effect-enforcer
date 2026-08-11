---
action: context
tool: (edit|write)
event: after
name: context-tag-extends
description: Use Context.Service for all service definitions — avoid Context.Tag, Effect.Service, and the legacy ServiceMap.* APIs
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - pattern: 'class $A extends Context.Tag'
        - pattern: 'class $A extends Context.Tag<$$$>() { $$$ }'
        - pattern: 'Context.GenericTag<$$$>'
        - pattern: 'Context.Tag($$$)'
        - pattern: 'Effect.Service<$$$>()'
        - pattern: 'ServiceMap.Service'
        - pattern: 'ServiceMap.Reference'
        - pattern: 'ServiceMap.make'
        - pattern: 'ServiceMap.get'
        - pattern: 'ServiceMap.add'
        - pattern: 'ServiceMap.mergeAll'
level: warning
suggestSkills:
    - effect-service-implementation
---

# Use `Context.Service` for All Service Definitions

`Context.Service` is the single canonical service-definition API in Effect v4 (beta.46+). Three legacy spellings exist and must all be replaced:

| Legacy API                  | Era       | Replacement                |
| --------------------------- | --------- | -------------------------- |
| `Context.Tag` / `GenericTag` | pre-v4    | `Context.Service`          |
| `Effect.Service`            | early v4  | `Context.Service`          |
| `ServiceMap.Service` / `.*` | beta.43    | `Context.Service` / `Context.*` |

```haskell
-- Anti-pattern: *Tag suffix + Context.Tag — removed in v4
class ParallelClientTag extends Context.Tag
data ParallelClientService = ...
-- two names for one concept = unnecessary coupling

-- Anti-pattern: Effect.Service — also removed in v4
class ParallelClient extends Effect.Service<ParallelClient>()(...)

-- Anti-pattern: ServiceMap.* — removed before v4 beta.46 stabilized
class MyService extends ServiceMap.Service<MyService>()("@app/MyService", { ... })

-- Fix: Context.Service (beta.46 API)
class ParallelClient extends Context.Service<ParallelClient>()(
  "@parallel/ParallelClient"
)
```

```typescript
// Concrete service (single implementation)
export class ParallelClient extends Context.Service<ParallelClient>()(
	'@parallel/ParallelClient'
) {}

// Interface-style service (multiple implementations, config, infrastructure)
export class Clipboard extends Context.Service<Clipboard>()(
	'@Clipboard/Clipboard'
) {}
```

When migrating from `ServiceMap`, also update the corresponding module accessors:

- `ServiceMap.get` → `Context.get`
- `ServiceMap.make` → `Context.make`
- `ServiceMap.add` → `Context.add`
- `ServiceMap.mergeAll` → `Context.mergeAll`
- `effect/ServiceMap` import → `effect/Context`

## Design Rules

- **Never** use a `*Tag` suffix — name the service directly
- `Context.Service` gives you service identity and lookup; it does not replace explicit layer design
- Export `layer` to expose the real dependency graph
- Export `defaultLayer` only when there are unsatisfied requirements to wire
- Capture dependencies in `Layer.effect` via `yield*`, not hidden module globals
- Access services with `yield* MyService` or `MyService.use(...)`

This pattern subsumes the legacy `use-context-service` pattern — the `ServiceMap.*` family is now folded in here so there's a single, comprehensive entry point for v4 service-definition migration.
