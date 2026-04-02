---
action: context
tool: (edit|write)
event: before
name: context-tag-extends
description: Avoid class *Tag extends Context.Tag naming - use ServiceMap.Service instead
glob: '**/*.{ts,tsx}'
pattern: (class\s+\w+Tag\s+extends\s+Context\.Tag|Context\.GenericTag<\w+Service>|Context\.Tag\(|Effect\.Service<)
level: warning
suggestSkills:
    - effect-service-implementation
---

# Avoid `Context.Tag` and `Effect.Service` — Use `ServiceMap.Service`

```haskell
-- Anti-pattern: *Tag suffix = naming smell
class ParallelClientTag extends Context.Tag    -- removed in v4
data ParallelClientService = ...               -- separate *Service interface
-- two names for one concept = unnecessary coupling

-- Anti-pattern: Effect.Service (also removed in v4)
class ParallelClient extends Effect.Service<ParallelClient>()(...) -- removed

-- Fix: ServiceMap.Service (v4 API)
class ParallelClient extends ServiceMap.Service<ParallelClient>()(
  "@parallel/ParallelClient"
)
```

**`Context.Tag` and `Effect.Service` have been removed in Effect v4.** Use `ServiceMap.Service` for all service definitions — both concrete and interface-style.

```typescript
// Concrete service (single implementation)
export class ParallelClient extends ServiceMap.Service<ParallelClient>()(
	'@parallel/ParallelClient'
) {}

// Interface-style service (multiple implementations, config, infrastructure)
export class Clipboard extends ServiceMap.Service<Clipboard>()(
	'@Clipboard/Clipboard'
) {}
```

- **Never** use a `*Tag` suffix — name the service directly
- `ServiceMap.Service` replaces both `Effect.Service` and `Context.Tag`
