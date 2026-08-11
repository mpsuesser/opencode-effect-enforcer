import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-mutable-state",

  shouldMatch: [
    "Layer.effect(Service, Effect.gen(function* () { let counter = 0; return Service.of({ next: () => Effect.sync(() => ++counter) }) }))",
    "Layer.effect(Service, Effect.gen(function* () { let value: string; return Service.of({ value: () => Effect.succeed(value) }) }))",
    "Layer.effect(Service, Effect.gen(function* () { let isReady = false; return Service.of({ isReady: Effect.sync(() => isReady) }) }))",
    "Layer.effect(Service, Effect.gen(function* () { let items: Array<string> = []; return Service.of({ items: Effect.sync(() => items) }) }))"
  ],
  shouldNotMatch: [
    "const counterRef = yield* Ref.make(0)",
    'const value = "hello"',
    "const isReady = true",
    "let counter = 0",
    "let value: string",
    'let fileContent = ""; for (const line of lines) { fileContent += line }',
    "for (let i = 0; i < items.length; i++) {}",
    "// let this be a comment",
    // String / template content mentioning `let`
    "const hint = 'use const, not let x = 1'",
    'const doc = "avoid let bindings"',
    "const tmpl = `prefer Ref over let x = 0`",
    // Block comment
    "/* let x = 1 is a smell */ const y = 1",
    // Identifiers that contain `let`
    "function letUserKnow() {}",
    "const outlet = makeOutlet()",
    "class Letter {}"
  ]
})
