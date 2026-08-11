import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-yield-ref",

  shouldMatch: [
    "const value = yield* ref",
    "yield* deferred",
    "yield* fiber",
    "yield* latch",
    "yield* userRef",
    "yield* completionDeferred",
    "yield* workerFiber",
    "yield* startLatch"
  ],
  shouldNotMatch: [
    "yield* Ref.get(ref)",
    "yield* Deferred.await(deferred)",
    "yield* Fiber.join(fiber)",
    "yield* Latch.await(latch)",
    "yield* Effect.gen(function* () {})",
    "yield* Stream.run(stream)",
    "yield* Layer.build(layer)",
    // Method / property access on the bare name should NOT match.
    // The old regex incorrectly flagged these because `\b` matches the
    // `.` boundary. AST patterns match only bare yields of these names.
    "const value = yield* ref.get()",
    "const value = yield* deferred.await()",
    "const value = yield* fiber.join()",
    "const value = yield* latch.await()",
    "yield* Ref.get(userRef)",
    "yield* Deferred.await(completionDeferred)",
    "yield* Fiber.join(workerFiber)",
    "yield* Latch.await(startLatch)",
    // Other variable names not in the set
    "yield* reference",
    "yield* preference",
    "yield* someEffect",
    // String / template / comment content
    "const msg = 'avoid yield* ref directly'",
    'const doc = "use Ref.get instead of yield* ref"',
    "const tmpl = `avoid yield* deferred`",
    "// yield* ref is removed in v4",
    "/* do not yield* fiber */ const x = 1"
  ]
})
