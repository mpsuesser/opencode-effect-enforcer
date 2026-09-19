---
action: context
tool: (edit|write)
event: after
name: prefer-redacted-config
description: Use Config.Redacted or Schema.Redacted for secret-like configuration values
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - pattern: Config.String($KEY)
        - pattern: Config.NonEmptyString($KEY)
        - all:
              - kind: pair
              - has:
                    field: key
                    regex: '(?i)(api[_-]?key|auth[_-]?token|token|secret|password|passwd|private[_-]?key|client[_-]?secret|database[_-]?url|db[_-]?url|connection[_-]?string|dsn)'
              - has:
                    field: value
                    regex: '^Schema\.(String|NonEmptyString)(\.|$)'
              - inside:
                    pattern: Config.schema($$$)
                    stopBy: end
constraints:
    KEY:
        regex: '(?i)^["''][^"'']*(api[_-]?key|auth[_-]?token|token|secret|password|passwd|private[_-]?key|client[_-]?secret|database[_-]?url|db[_-]?url|connection[_-]?string|dsn)[^"'']*["'']$'
level: warning
suggestSkills:
    - effect-config
---

# Prefer Redacted Config for Secrets

```haskell
-- Transformation
Config.String secretKey    :: String            -- easy to log accidentally
Config.Redacted secretKey  :: Redacted String   -- hidden from logs/toString
```

```typescript
// Bad
const apiKey = Config.String('API_KEY');
const token = Config.NonEmptyString('GITHUB_TOKEN');

// Good
const apiKey = Config.Redacted('API_KEY');
const token = Config.Redacted('GITHUB_TOKEN');
```

For structured config schemas, wrap secret-like string fields in `Schema.Redacted`:

```typescript
// Bad
const AppConfig = Config.schema(
	Schema.Struct({
		apiKey: Schema.String,
		password: Schema.NonEmptyString
	})
);

// Good
const AppConfig = Config.schema(
	Schema.Struct({
		apiKey: Schema.Redacted(Schema.String),
		password: Schema.Redacted(Schema.String)
	})
);
```

Secrets should remain redacted from the moment they enter the program. Use `Config.Redacted` for primitive config values and `Schema.Redacted(Schema.String)` for schema-based config fields.
