import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "effect-promise-vs-trypromise",
  tag: "use-effect-trypromise",
  shouldMatch: [
    // Phase D widened this rule — every reference to `Effect.promise`
    // is flagged, not just the `yield*`-form.
    "yield* Effect.promise(() => fetch(url))",
    "yield* Effect.promise(() => api.call())",
    "yield* Effect.promise(async () => await promise)",
    "yield* Effect.promise(() => Promise.resolve(data))",
    "const result = yield* Effect.promise(() => asyncFn())",
    "yield* Effect.promise(function() { return fetch() })",
    "yield* Effect.promise(() =>\n      fetchData()\n    )",
    "yield* Effect.promise( () => getData())",
    // Non-yield references — also part of the widened scope.
    "Effect.promise(() => fetch())",
    "const promise = Effect.promise",
    "const wrapper = (p) => Effect.promise(() => p)"
  ],
  shouldNotMatch: [
    "yield* Effect.tryPromise(() => fetch(url))",
    "yield* Effect.tryPromise({ try: () => fetch(), catch: e => new Error() })",
    "effectPromise(() => fetch())",
    "yield* promise(() => fetch())",
    "yield* Effect.tryPromise({ try: () => api.call(), catch: (e) => new FetchError(e) })",
    "yield* someOtherEffect",
    "const p = yield* getPromise()",
    // String / template / comment content
    'const hint = "use yield* Effect.tryPromise"',
    "const doc = `avoid yield* Effect.promise`",
    "// yield* Effect.promise bypasses typed errors",
    "/* yield* Effect.promise is a smell */ const x = 1"
  ]
})
