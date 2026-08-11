import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "effect-run-in-body",
  tag: "effect-run-in-body",
  shouldMatch: [
    "Effect.runSync(effect)",
    "Effect.runPromise(effect)",
    "const result = Effect.runSync(getUser())",
    "await Effect.runPromise(fetchData())",
    "Effect.runSync(program)",
    "Effect.runPromise(workflow)",
    "return Effect.runSync(computation)",
    "const value = Effect.runSync(Effect.succeed(42))",
    "pipe(someEffect, Effect.runSync)",
    "Effect.runSync(\n      Effect.gen(function* () {\n        yield* doSomething\n      })\n    )",
    // Phase D added Effect.runFork — also a runtime escape hatch.
    "Effect.runFork(program)"
  ],
  shouldNotMatch: [
    "effectRunSync(program)",
    "runSync(effect)",
    "Effect.run(program)",
    "Effect.runCallback(program, cb)",
    "yield* someEffect",
    "const effect = createEffect()",
    "Effect.gen(function* () { yield* myEffect })",
    "pipe(effect1, Effect.flatMap(effect2))",
    "function runSync() {}",
    "function runPromise() {}",
    // String / template / comment content
    'const msg = "avoid Effect.runSync mid-body"',
    "const tip = 'use Effect.runPromise only at boundaries'",
    "const tmpl = `Effect.runSync(program) is a code smell`",
    "// Effect.runSync(program) escapes composition",
    "/* Effect.runPromise at entry points only */ const x = 1"
  ]
})
