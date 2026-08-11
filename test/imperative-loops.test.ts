import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "imperative-loops",
  tag: "use-functional",
  shouldMatch: [
    "for (let i = 0; i < arr.length; i++)",
    "for (const item of items)",
    "for (let x in obj)",
    "for(let i=0;i<10;i++)",
    "for (const [key, value] of entries)",
    "for (let item of collection) { process(item) }",
    "for (let i = 0; i < 100; i++) { sum += i }",
    "for ( const item of items ) { }",
    "for (;;) { break }"
  ],
  shouldNotMatch: [
    "Array.forEach(item => process(item))",
    "items.map(x => x * 2)",
    "Array.filterMap(items, fn)",
    "describe(loops, () => {})",
    "transform(data)",
    "const result = items.reduce((acc, x) => acc + x, 0)",
    "const forEach = (arr) => {}",
    "pipe(items, Array.map(process))",
    "const perform = () => {}",
    // String / template / comment content mentioning `for (`
    "const code = 'for (const x of xs) {}'",
    "const tmpl = `for (let i = 0; i < n; i++)`",
    "it('should iterate for (const x of xs)', () => {})",
    "// for (const x of xs) is imperative",
    "/* for (;;) {} */ const x = 1",
    // Effect.forEach and similar higher-order operators
    "Effect.forEach(items, handle, { concurrency: 8 })",
    "Arr.forEach(items, handle)",
    // Method `forEach` on an array
    "items.forEach(x => handle(x))"
  ]
})
