---
action: context
tool: (edit|write)
event: after
name: avoid-direct-json
description: Consider using Schema.fromJsonString instead of direct JSON methods
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
fromJsonString :: Schema a → Schema String a
unknownJson    :: Schema String unknown
encodeJson     :: Schema a → a → String
```

```haskell
-- Pattern
bad :: String → IO User
bad json = JSON.parse json        -- returns Any, throws on invalid

good :: String → Either ParseError User
good json = Schema.decodeUnknownSync(Schema.fromJsonString(User)) json

unknownJson = Schema.fromJsonString(Schema.Unknown)

-- Bidirectional
data User = Schema.Class "User"
  { id   :: Schema.Number
  , name :: Schema.String
  }

decode :: String → Either ParseError User
decode = Schema.decodeUnknownSync(Schema.fromJsonString(User))

encode :: User → String
encode = Schema.encodeSync(Schema.fromJsonString(User))
```

`JSON.parse` returns `any` and throws on invalid input. `Schema.fromJsonString(...)` provides typed, validated JSON parsing and encoding. Use `Schema.fromJsonString(Schema.Unknown)` when the JSON shape is intentionally unknown; `Schema.UnknownFromJsonString` is internal in current Effect v4. Direct JSON methods remain reasonable at narrow logging/debugging boundaries.
