---
action: context
tool: (edit|write)
event: after
name: use-http-client-service
description: Use Effect HttpClient instead of node:http / node:https
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - kind: import_statement
              - regex: '["''](?:node:)?https?["'']'
        - pattern: require($SPEC)
        - pattern: import($SPEC)
constraints:
    SPEC:
        regex: '^["''](?:node:)?https?["'']$'
level: warning
suggestSkills:
    - effect-http-api
    - effect-platform-abstraction
---

# Use Effect HttpClient Instead of `node:http` / `node:https`

```haskell
-- Transformation
import "node:http"  :: Node → IO Request          -- low-level, callback-based
import "node:https" :: Node → IO Request          -- same problem with TLS

-- Instead
HttpClient          :: Request → Effect Response  -- typed, composable, testable
HttpClientRequest   :: Request builder            -- pure value, no side effects
HttpClientResponse  :: Response codec helpers     -- schema-validated JSON, streams, etc.
```

```haskell
-- Pattern
bad :: URL → IO Response
bad url = http.get url (cb)                       -- callback, untyped errors

good :: URL → Effect Response (HttpClient | Scope)
good url = pipe
  (HttpClientRequest.get url)
  HttpClient.execute
  Effect.flatMap HttpClientResponse.json
  -- typed Response, error channel, retries, timeouts, layer-based testing
```

```haskell
-- Composable request building
request :: HttpClientRequest
request = pipe
  (HttpClientRequest.post "/api/users")
  (HttpClientRequest.bodyJson { name: "Alice" })
  (HttpClientRequest.setHeader "Authorization" "Bearer …")

-- With retry, timeout, tracing
resilient :: Effect Response (HttpClient | Scope)
resilient = pipe
  (HttpClient.execute request)
  (Effect.retry (Schedule.recurs 3))
  (Effect.timeout (Duration.seconds 10))

-- Provide platform layer at entry point
main = program
  & provide BunHttpClient.layer    -- or NodeHttpClient.layer
```

Direct `http` / `https` imports give you callback APIs, manual TLS plumbing, and no error channel. Use Effect's `HttpClient`, `HttpClientRequest`, and `HttpClientResponse` for typed errors, composable request building, declarative retry/timeout, and testability via layer substitution.

**Exceptions:**

- Platform-specific layers that implement `HttpClient.HttpClient`
- Build scripts and tooling that legitimately need raw Node HTTP

References: EF-9b in effect-first-development.md
