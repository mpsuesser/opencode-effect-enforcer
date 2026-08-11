---
action: context
tool: (edit|write)
event: after
name: prefer-arr-sort
description: Use Arr.sort with explicit Order instead of native Array.prototype.sort
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    pattern: $A.sort($$$)
    not:
        pattern: Arr.sort($$$)
level: warning
---

# Use `Arr.sort` with Explicit `Order`

```haskell
-- Transformation
native  :: [a] -> (a -> a -> Number) -> [a]   -- mutates in place, untyped comparator
arrSort :: [a] -> Order a -> [a]               -- pure, typed, composable

-- Pattern
bad :: [User] -> [User]
bad users = users.sort((a, b) => a.name.localeCompare(b.name))
  -- mutates original, comparator is untyped

good :: [User] -> [User]
good users = Arr.sort(users, byName)
  where byName = Order.mapInput(Order.String, (u: User) => u.name)
  -- pure copy, typed ordering, composable
```

```haskell
-- Composing orders
byNameThenAge :: Order User
byNameThenAge = Order.combine(
  Order.mapInput(Order.String, _.name),
  Order.mapInput(Order.Number, _.age)
)

sorted :: [User] -> [User]
sorted = Arr.sort byNameThenAge

-- Reverse
descending :: [User] -> [User]
descending = Arr.sort (Order.reverse byName)
```

Native `.sort()` mutates the array in place and uses an untyped comparator. `Arr.sort` from `effect/Array` returns a new sorted array using a composable, typed `Order`.

References: EF-38 in effect-first-development.md
