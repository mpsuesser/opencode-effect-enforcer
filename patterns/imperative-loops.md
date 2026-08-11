---
action: context
tool: (edit|write)
event: after
name: imperative-loops
description: Use functional transformations instead of imperative loops (for / while / do-while)
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - kind: for_statement
        - kind: for_in_statement
        - kind: while_statement
        - kind: do_statement
level: warning
---

# Use Functional Transformations

```haskell
-- Array operations
map     :: [a] → (a → b) → [b]
filter  :: [a] → (a → Bool) → [a]
reduce  :: [a] → b → (b → a → b) → b
filterMap :: [a] → (a → Option b) → [b]   -- single pass

-- Record operations
Record.map        :: {k: a} → (a → b) → {k: b}
Record.filter     :: {k: a} → (a → Bool) → {k: a}
Record.filterMap  :: {k: a} → (a → Option b) → {k: b}

-- Effectful iteration
Effect.forEach :: [a] → (a → Effect b) → Effect [b]
```

```haskell
-- Bad: Imperative with mutations (any flavor of loop)
bad₁ :: [Number] → [Number]
bad₁ numbers = do
  result ← []
  for n in numbers do                       -- ✗ ForOf
    if n % 2 == 0 then result.push(n * n)
  return result

bad₂ :: Effect ()
bad₂ = do
  while (not done) do                       -- ✗ While
    yield* step

bad₃ :: Effect ()
bad₃ = do
  repeat                                    -- ✗ DoWhile
    yield* step
  until done

-- Good: Functional composition
good :: [Number] → [Number]
good numbers =
  filterMap numbers λn →
    if n % 2 == 0
    then Option.some(n * n)
    else Option.none()

goodEffect :: [Item] → Effect ()
goodEffect items = Effect.forEach items processItem { concurrency: 4 }
```

Imperative loops — `for`, `for ... in`, `for ... of`, `while`, `do ... while` — encourage mutation and break composition. Use `Arr.map` / `Arr.filter` / `Arr.filterMap` / `Arr.reduce` for pure transformations, and `Effect.forEach` for effectful iteration (with explicit `concurrency`).

Note: in tree-sitter TypeScript, `for ... of` and `for ... in` share the same AST kind (`for_in_statement`), so listing `for_in_statement` covers both.
