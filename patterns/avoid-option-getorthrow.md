---
action: context
tool: (edit|write)
event: after
name: avoid-option-getorthrow
description: Avoid Option.getOrThrow - use Option.match or Option.getOrElse for safe unwrapping
glob: '**/*.{ts,tsx}'
detector: ast
pattern: $A.getOrThrow
level: warning
---

# Avoid `Option.getOrThrow`

```haskell
-- Transformation
getOrThrow :: Option a -> a            -- partial function, may throw

-- Instead
match      :: Option a -> { onNone, onSome } -> b   -- total, exhaustive
getOrElse  :: (() -> a) -> Option a -> a             -- total, with default
```

```haskell
-- Pattern
bad :: Option User -> User
bad opt = Option.getOrThrow opt           -- throws if None

good :: Option User -> String
good opt = Option.match opt
  { onNone: \_ -> "unknown"
  , onSome: \u -> u.name
  }

also_good :: Option User -> User
also_good opt = Option.getOrElse opt \_ -> defaultUser
```

`Option.getOrThrow` defeats the purpose of using Option. Always handle both cases explicitly.
