import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "require-effect-concurrency",
  tag: "ef-27-explicit-concurrency",
  shouldMatch: [
    "Effect.forEach(items, processItem)",
    "Effect.forEach(processItem)",
    "Effect.forEach(items, processItem, { discard: true })",
    "items.pipe(Effect.forEach(processItem))",
    "items.pipe(Effect.forEach(processItem, { discard: true }))",
    "Effect.forEach(items, (item) => Effect.succeed({ concurrency: item }))",
    "Effect.all(tasks)",
    "Effect.all(tasks, { discard: true })",
    "Effect.validate(inputs, validateInput)",
    "Effect.validate(validateInput)",
    "Effect.validate(inputs, validateInput, { discard: true })",
    "Effect.validate(validateInput, { discard: true })",
    "Effect.all(tasks, { concurrency: 'inherit' })",
    'Effect.forEach(items, processItem, { concurrency: "inherit" })',
    "Effect.forEach(processItem, { concurrency: 'inherit', discard: true })",
    "Effect.validate(inputs, validateInput, { concurrency: 'inherit' })",
    'Effect.validate(validateInput, { "concurrency": "inherit" })'
  ],
  shouldNotMatch: [
    "Effect.forEach(items, processItem, { concurrency: 1 })",
    "Effect.forEach(items, processItem, { concurrency: 4, discard: true })",
    "Effect.forEach(processItem, { concurrency: 1 })",
    "items.pipe(Effect.forEach(processItem, { concurrency: 1 }))",
    "Effect.all(tasks, { concurrency: 1 })",
    'Effect.all(tasks, { concurrency: "unbounded" })',
    "Effect.all(tasks, { concurrency })",
    'Effect.all(tasks, { concurrency: 2, label: "inherit" })',
    "Effect.validate(inputs, validateInput, { concurrency: 1 })",
    "Effect.validate(inputs, validateInput, { concurrency: 4, discard: true })",
    "Effect.validate(validateInput, { concurrency: 1 })",
    "Arr.forEach(items, processItem)",
    "Stream.runForEach(stream, processItem)",
    "const concurrency = 4",
    "// Effect.forEach(items, processItem)",
    'const doc = "Effect.all(tasks)"'
  ]
})
