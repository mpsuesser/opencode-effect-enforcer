import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "prefer-effect-fn",
  shouldMatch: [
    `export const layer = Layer.effect(Service, Effect.gen(function* () { const open = () => Effect.gen(function* () { return 1 }); return Service.of({ open }) }))`,
    `export const layer = Layer.effectContext(Effect.gen(function* () { const open = () => Effect.gen(function* () { return 1 }); return Context.make(Service, Service.of({ open })) }))`,
    `export const layer = Layer.succeed(Service, Service.of({ open: () => Effect.gen(function* () { return 1 }) }))`,
    `export const layer = Layer.effect(Service, Effect.gen(function* () { return Service.of({ open() { return Effect.gen(function* () { return 1 }) } }) }))`,
    `export const layer = Layer.effect(Service, Effect.gen(function* () { return Service.of({ open: function() { return Effect.gen(function* () { return 1 }) } }) }))`
  ],
  shouldNotMatch: [
    `const program = Effect.gen(function* () { yield* Effect.log("hello") })`,
    `function doStuff() { return Effect.gen(function* () { return 42 }) }`,
    `Context.Service<MyService>()("MyService", { make: Effect.gen(function* () { return {} }) })`,
    `const object = { open() { return Effect.gen(function* () { return 1 }) } }`,
    `export const layer = Layer.effect(Service, Effect.gen(function* () { const open = Effect.fn('Helix.open')(function* () { return 1 }); return Service.of({ open }) }))`
  ]
})
