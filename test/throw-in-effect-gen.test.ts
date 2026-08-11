import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "throw-in-effect-gen",

  shouldMatch: [
    `Effect.gen(function* () { throw new Error("bad") })`,
    `Effect.gen(function* (_) { if (!user) throw new Error("not found"); })`,
    `Effect.fn('User.load')(function* () { throw new Error("bad") })`,
    `Effect.fn(function* () { throw new Error("bad") })`,
    `Effect.fnUntraced(function* () { throw new Error("bad") })`
  ],
  shouldNotMatch: [
    `Effect.gen(function* () { yield* Effect.fail(new MyError({ message: "not found" })) })`,
    `function notEffect() { throw new Error("ok here") }`,
    `Effect.fn('User.load')(function* () { yield* Effect.fail(new MyError({ message: "not found" })) })`,
    `Effect.tryPromise({ try: () => { throw new Error("caught by catch") }, catch: (e) => new MyError({ message: String(e) }) })`
  ]
})
