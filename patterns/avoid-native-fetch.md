---
action: context
tool: (edit|write)
event: after
name: avoid-native-fetch
description: Use Effect HTTP modules instead of native fetch
glob: '**/*.{ts,tsx}'
detector: ast
pattern: fetch($$$ARGS)
level: warning
suggestSkills:
    - effect-http-client
---

# Use Effect HTTP Modules Instead of Native `fetch`

```haskell
-- Transformation
fetch    :: String -> Promise Response       -- global side effect, untyped errors
HttpClient :: Request -> Effect Response E R  -- typed, composable, testable

-- Pattern
bad :: String -> Promise Response
bad url = fetch(url)                         -- untyped rejection, no retry/timeout
bad url = fetch(url, { method: "POST" })     -- scattered options

good :: String -> Effect User HttpError HttpClient
good url = pipe(
  HttpClient.get(url),
  Effect.flatMap(HttpClientResponse.schemaBodyJson(User))
)
```

```haskell
-- Composable request building
request :: Effect HttpClientRequest HttpBodyError
request = pipe(
  HttpClientRequest.post("/api/users"),
  HttpClientRequest.bodyJson({ name: "Alice" })
)

-- With retry, timeout, tracing
resilient :: Effect Response HttpError (HttpClient | Scope)
resilient = pipe(
  request,
  Effect.flatMap(HttpClient.execute),
  Effect.retry(Schedule.recurs(3)),
  Effect.timeout(Duration.seconds(10))
)

-- Platform layer at entry point
main = program.pipe(
  Effect.provide(BunHttpClient.layer)    -- or NodeHttpClient.layer
)
```

Native `fetch` produces untyped Promise rejections. Use `HttpClientRequest`, `HttpClientResponse`, and `HttpClient` from Effect for typed errors, composable request building, and testability via layer substitution.

Exception: an explicit low-level platform implementation that cannot use Effect HTTP. Keep it isolated, lift it with `Effect.tryPromise`, propagate the supplied `AbortSignal`, classify status before decoding, and decode unknown bodies with `Schema`.

References: EF-9b, Checklist #42 in effect-first-development.md
