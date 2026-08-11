---
action: context
tool: (edit|write)
event: after
name: avoid-direct-json
description: Consider using Schema.fromJsonString or Schema.UnknownFromJsonString instead of direct JSON methods
glob: '**/*.{ts,tsx}'
detector: ast
pattern: JSON.$M($$$)
level: info
suggestSkills:
    - effect-schema-composition
---

# Consider Schema JSON Codecs Instead of JSON Methods

```haskell
-- Transformation
jsonParse     :: String → Any           -- returns Any, can throw
jsonStringify :: a → String             -- no validation

-- Instead
fromJsonString       :: Schema a → Schema String a
UnknownFromJsonString :: Schema String unknown
encodeJson           :: Schema a → a → String
```

```haskell
-- Pattern
bad :: String → IO User
bad json = JSON.parse json        -- returns Any, throws on invalid

good :: String → Either ParseError User
good json = Schema.decodeUnknownSync(Schema.fromJsonString(UserSchema)) json

-- Bidirectional
data UserSchema = Schema.Struct
  { id   :: Schema.Number
  , name :: Schema.String
  }

decode :: String → Either ParseError User
decode = Schema.decodeUnknownSync(Schema.fromJsonString(UserSchema))

encode :: User → String
encode = Schema.encodeSync(Schema.fromJsonString(UserSchema))
```

`JSON.parse` returns `any` and throws on invalid input. `Schema.fromJsonString(...)` and `Schema.UnknownFromJsonString` provide typed, validated JSON parsing and encoding. Acceptable for simple logging/debugging.
