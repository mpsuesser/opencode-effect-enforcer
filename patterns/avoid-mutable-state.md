---
action: context
tool: (edit|write)
event: before
name: avoid-mutable-state
description: Prefer Ref over let bindings for mutable state in Effect services
glob: '**/*.ts'
pattern: \blet\s+\w+\s*[=:]
level: info
---

# Prefer `Ref` Over `let` for Mutable State

```haskell
-- Transformation
let x = v; x = v'       :: mutable binding   -- not fiber-safe
Ref.make(v) >>= Ref.set :: Ref a -> Effect a -- fiber-safe, composable
```

```haskell
-- Pattern
bad :: Mutable let
bad = let counter = 0
bad = counter += 1

good :: Ref
good = const counterRef = yield* Ref.make(0)
good = yield* Ref.update(counterRef, (n) => n + 1)
```

Mutable `let` bindings in Effect services break referential transparency and are unsafe across fibers. Use `Ref` for all mutable state — it provides atomic updates, fiber safety, and composability.

## When `let` Is Acceptable

- Loop counters in non-effectful pure functions
- Local temporaries in synchronous helpers
- Destructuring reassignment in narrow scopes

The `info` level reflects that `let` has legitimate uses — this pattern surfaces it for review, not as an error.
