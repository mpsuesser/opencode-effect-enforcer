---
action: context
tool: (edit|write)
event: after
name: prefer-option-over-null
description: Consider using Option instead of union with null or undefined
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - kind: literal_type
              - regex: '^null$'
              - inside:
                    kind: union_type
                    stopBy: neighbor
        - all:
              - kind: literal_type
              - regex: '^undefined$'
              - inside:
                    kind: union_type
                    stopBy: neighbor
level: info
---

# Consider `Option` Instead of `| null` / `| undefined`

```haskell
-- Transformation
nullable :: T | Null              -- scattered null checks
undef    :: T | Undefined         -- same problem, different keyword
option   :: Option T              -- composable, chainable

-- Option operations
map      :: (a → b) → Option a → Option b
flatMap  :: (a → Option b) → Option a → Option b
filter   :: (a → Bool) → Option a → Option a
getOrElse :: a → Option a → a
```

```haskell
-- Pattern
bad :: Id → User | Null
bad id = users.get id             -- caller must check null

good :: Id → Option User
good id = Option.fromNullable (users.get id)

-- Composition
findEmail :: Id → Option Email
findEmail = good >=> (_.email >>> Option.fromNullable)
```

`Option<T>` provides chainable operations. Use `| null` or `| undefined` only at external boundaries (JSON, DOM, third-party libs).

Both `| null` and `| undefined` carry the same modelling cost — every consumer needs a defensive check, and `Option`'s combinators (`map`, `flatMap`, `filter`, `getOrElse`, `match`) replace those checks with a single composable shape. `| null | undefined` is the worst of both; convert it at the boundary with `Option.fromNullishOr`.
