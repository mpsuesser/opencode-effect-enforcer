---
action: context
tool: (edit|write)
event: after
name: avoid-direct-tag-checks
description: Avoid direct _tag property checks; use exported refinements/predicates
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - pattern: $A._tag === $B
        - pattern: $A._tag !== $B
        - pattern: switch ($A._tag) { $$$ }
level: warning
suggestSkills:
    - effect-pattern-matching
---

# Avoid Direct `_tag` Property Checks

```haskell
-- Transformation
directCheck :: Event → Bool
directCheck e = e._tag == "FactRecorded"   -- narrows, but not exhaustive

-- Instead
$is   :: Tag → Event → Bool                -- from TaggedEnum
$match :: { Tag₁: h₁, Tag₂: h₂ } → Event → a  -- exhaustive matching
```

```haskell
-- Pattern
bad :: Event → Effect ()
bad e
  | e._tag == "FactRecorded" = handleFact e    -- manual check, fragile
  | otherwise                = pure ()

good :: Event → Effect ()
good = $match
  { FactRecorded:  handleFact
  , QuestionAsked: handleQuestion
  }                                            -- exhaustive, type-safe

-- Or with predicates
data Event = FactRecorded | QuestionAsked
  deriving TaggedEnum

isFactRecorded :: Event → Bool
isFactRecorded = $is "FactRecorded"

-- Refactoring-safe: rename tag in one place
```

TypeScript correctly narrows literal `_tag` checks. Prefer exported guards and
matching helpers for consistent semantics and exhaustiveness as variants evolve.
For schema-first models use union `.guards`, `.match`, or `Schema.is`; class
variants can also use `instanceof`. `Schema.toTaggedUnion` supports discriminator
keys beyond `_tag`. In rc.112, `.matchOrElse` adds partial matching with a typed
fallback. For trusted `Data.taggedEnum` values use `$is` / `$match`; `$is` checks
only the tag and is not structural validation of unknown input.
