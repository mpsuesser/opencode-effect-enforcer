---
action: context
tool: (edit|write)
event: before
name: use-servicemap-service
description: Use ServiceMap.Service instead of removed Context.Tag or Effect.Service APIs
glob: '**/*.ts'
pattern: (Context\.Tag|Effect\.Service)\s*[<(]
level: warning
suggestSkills:
    - effect-service-implementation
---

# Use `ServiceMap.Service` Instead of `Context.Tag` / `Effect.Service`

```haskell
-- Transformation
Context.Tag    :: String -> Tag<S>         -- removed in Effect v4
Effect.Service :: String -> Tag<S>         -- removed in Effect v4
ServiceMap.Service :: <S>() -> String -> Service  -- correct, v4 API
```

```haskell
-- Pattern
bad :: Service definition
bad = const MyService = Context.Tag<MyService>()
bad = const MyService = Effect.Service<MyService>()

good :: Service definition
good = class MyService extends ServiceMap.Service<MyService>()(
  "@app/MyService",
  { ... }
)
```

Effect v4 removed `Context.Tag` and `Effect.Service`. Use `ServiceMap.Service` for all service definitions — it provides automatic layer construction, accessors, and proper dependency tracking.
