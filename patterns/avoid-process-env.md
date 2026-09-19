---
action: context
tool: (edit|write)
event: after
name: avoid-process-env
description: Avoid process.env - use Effect Config.* for environment variable access
glob: '**/*.{ts,tsx}'
detector: ast
pattern: process.env
level: warning
suggestSkills:
    - effect-config
---

# Avoid `process.env`

```haskell
-- Transformation
processEnv :: String -> IO (Maybe String)    -- side effect, untyped, untestable

-- Instead
Config.String :: String -> Config String     -- typed, composable, testable
Config.withDefault :: a -> Config a -> Config a
Config.Redacted :: String -> Config Redacted -- for sensitive values
```

```haskell
-- Pattern
bad :: Effect String
bad = Effect.sync \_ -> process.env.API_KEY    -- raw side effect

good :: Effect String ConfigError
good = Config.Redacted "API_KEY"               -- typed, redacted

better :: Effect String ConfigError
better = Config.Int("PORT")
  & Config.withDefault "3000"
  & Config.map Number.parse                    -- with transformation
```

`process.env` is a raw side effect with no type safety. Use `Config.*` for validated, composable, testable configuration.

Exception: `xdg/core` and similar platform abstraction layers that ARE the env variable bridge.
