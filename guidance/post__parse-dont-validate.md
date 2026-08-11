# Parse, don’t validate

Alexis King’s mantra for type-driven design, condensed.

## Partial functions to total functions

Consider `head :: [a] -> a` — return the first element of a list. It can’t be implemented totally; `[]` has no element to return. Two ways to fix it.

### Weaken the result

```haskell
head :: [a] -> Maybe a
head (x:_) = Just x
head []    = Nothing
```

Easy to implement, but every call site must handle `Nothing` — even when the caller has already proved the list non-empty:

```haskell
getConfigurationDirectories :: IO [FilePath]
getConfigurationDirectories = do
  configDirsString <- getEnv "CONFIG_DIRS"
  let configDirsList = split ',' configDirsString
  when (null configDirsList) $
    throwIO $ userError "CONFIG_DIRS cannot be empty"
  pure configDirsList

main :: IO ()
main = do
  configDirs <- getConfigurationDirectories
  case head configDirs of
    Just cacheDir -> initializeCache cacheDir
    Nothing -> error "should never happen; already checked configDirs is non-empty"
```

That `Nothing` branch is dead code we can’t statically prove dead. If `getConfigurationDirectories` ever stops checking, the “impossible” silently becomes possible.

### Strengthen the argument

Instead of `[a]`, take `NonEmpty a`:

```haskell
head :: NonEmpty a -> a
head (x:|_) = x
```

`head` is now total. The non-empty check happens exactly once, at the boundary:

```haskell
getConfigurationDirectories :: IO (NonEmpty FilePath)
getConfigurationDirectories = do
  configDirsString <- getEnv "CONFIG_DIRS"
  let configDirsList = split ',' configDirsString
  case nonEmpty configDirsList of
    Just nonEmptyConfigDirsList -> pure nonEmptyConfigDirsList
    Nothing -> throwIO $ userError "CONFIG_DIRS cannot be empty"

main :: IO ()
main = do
  configDirs <- getConfigurationDirectories
  initializeCache (head configDirs)
```

If the upstream check is removed, the return type changes and `main` stops type-checking. The knowledge is preserved in the type system.

## Parsing vs validation

Two almost-identical functions distinguished only by their return type:

```haskell
validateNonEmpty :: [a] -> IO ()
validateNonEmpty (_:_) = pure ()
validateNonEmpty [] = throwIO $ userError "list cannot be empty"

parseNonEmpty :: [a] -> IO (NonEmpty a)
parseNonEmpty (x:xs) = pure (x:|xs)
parseNonEmpty [] = throwIO $ userError "list cannot be empty"
```

`validateNonEmpty` checks then throws the knowledge away. `parseNonEmpty` returns a refined type that carries the proof forward. **A parser is just a function from less-structured input to more-structured output, with a notion of failure.** Once parsing is done, downstream code never has to re-check.

## The danger of validation: shotgun parsing

From *The Seven Turrets of Babel: A Taxonomy of LangSec Errors*:

> Shotgun parsing is a programming antipattern whereby parsing and input-validating code is mixed with and spread across processing code—throwing a cloud of checks at the input, and hoping, without any systematic justification, that one or another would catch all the “bad” cases.
>
> Shotgun parsing necessarily deprives the program of the ability to reject invalid input instead of processing it. Late-discovered errors in an input stream will result in some portion of invalid input having been processed, with the consequence that program state is difficult to accurately predict.

Validation-based code can’t tell you whether all the checks really happened up front, so every call site must assume failure is possible everywhere. Parsing stratifies the program: invalid input is rejected in one phase; execution can’t fail for the same reason.

## In practice

Focus on the datatypes.

1. **Use a data structure that makes illegal states unrepresentable.** If `[(k, v)]` allows duplicate keys and you don’t want them, take `Map k v` instead. Refactor upward until you reach either the value’s origin or a point where the looser shape is genuinely needed; insert the parsing step there.
2. **Push the burden of proof upward as far as possible, but no further.** Parse at the system boundary. When a branch later needs a more precise shape, parse the moment that branch is selected. Use sum types so the datatype reflects control flow.

Write functions on the data representation you *wish* you had, not the one you were given.

Additional rules of thumb:

- Let datatypes drive your code, not the reverse. Don’t reach for a `Bool` field because it’s convenient — pick the representation that makes the invariant obvious, and let the type checker chase down the call sites.
- Treat functions that return `m ()` with suspicion. If the only point of the effect is raising an error, there’s usually a return value worth preserving.
- Parse in multiple passes when you need to. Context-sensitive parsing — using already-parsed input to decide how to parse the rest — is fine; that’s not shotgun parsing.
- Avoid denormalized representations, especially mutable ones; duplicated state is trivially representable illegal state. Where denormalization is unavoidable, keep it behind an abstraction boundary owned by one small module.
- When the type system can’t directly express the invariant (e.g. “this integer is in range”), use an abstract `newtype` with a smart constructor so a validator presents a parser-shaped API.

Treat `error "impossible"` calls and undocumented invariants as radioactive: handle with care, and at minimum leave a comment recording the invariant.
