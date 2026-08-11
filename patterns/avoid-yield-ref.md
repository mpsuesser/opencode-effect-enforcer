---
action: context
tool: (edit|write)
event: after
name: avoid-yield-ref
description: Do not yield* Ref/Deferred/Fiber/Latch directly — use explicit method calls
glob: '**/*.ts'
detector: ast
rule:
    pattern: yield* $RESOURCE
constraints:
    RESOURCE:
        regex: '(^ref$|Ref$|^deferred$|Deferred$|^fiber$|Fiber$|^latch$|Latch$)'
level: warning
suggestSkills:
    - effect-schema-v4
---

# Do Not `yield*` Ref, Deferred, Fiber, or Latch Directly

```haskell
-- Transformation
yield* ref       :: Ref a -> a          -- removed in v4
Ref.get(ref)     :: Ref a -> Effect a   -- correct, explicit
yield* deferred  :: Deferred a -> a     -- removed in v4
Deferred.await   :: Deferred a -> Effect a  -- correct, explicit
yield* fiber     :: Fiber a -> a        -- removed in v4
Fiber.join       :: Fiber a -> Effect a -- correct, explicit
```

```haskell
-- Pattern
bad :: Direct yield
bad = const value = yield* ref
bad = yield* deferred
bad = yield* fiber
bad = yield* latch

good :: Explicit method
good = const value = yield* Ref.get(ref)
good = yield* Deferred.await(deferred)
good = yield* Fiber.join(fiber)
good = yield* Latch.await(latch)
```

In Effect v4, yielding `Ref`, `Deferred`, `Fiber`, and `Latch` directly is removed. Use explicit method calls (`Ref.get`, `Deferred.await`, `Fiber.join`, `Latch.await`) for clarity and forward compatibility.
