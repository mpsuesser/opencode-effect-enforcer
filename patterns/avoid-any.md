---
action: context
tool: (edit|write)
event: after
name: avoid-any
description: Avoid using 'as any' or 'as unknown as' type assertions
glob: '**/*.{ts,tsx}'
detector: ast
pattern:
    - '$A as any'
    - '$A as unknown'
level: warning
---

# Avoid `as any` Type Assertions

```haskell
-- Transformation
asAny      :: a → Any       -- erases type, defeats compiler
asUnknown  :: a → Unknown   -- same problem with extra steps

-- Instead
decode     :: Schema a → Unknown → Either ParseError a
guard      :: (a → Bool) → a → Maybe a
generics   :: ∀ a. Constraint a ⇒ a → F a
```

```haskell
-- Pattern
bad  :: Unknown → T
bad x = x `as` T                    -- trust me bro

good :: Unknown → Either ParseError T
good x = Schema.decode schemaT x    -- prove it
```

Using `as any` bypasses type checking entirely. The `as unknown as T` pattern is equivalent—casting through `unknown` still erases type information. Note: `as const` is acceptable—it narrows to literal types without erasing type safety.
