import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "casting-awareness",
  tag: "type-awareness",
  shouldMatch: [
    // Real type assertions
    "const x = foo as string",
    "return bar as User",
    "data as MyType",
    "value as number",
    "(response as Response)",
    "input as Record<string, unknown>",
    "event.target as HTMLInputElement",

    // Chained assertions — each leg is its own `as` expression
    "const x = foo as unknown as Foo",
    "data as unknown as MyType",

    // Assertion used as a call argument / subexpression
    "handle(e.target as HTMLButtonElement)",
    "const arr = (value as ReadonlyArray<string>).slice()"
  ],
  shouldNotMatch: [
    // as const (distinct AST node: `as_expression` vs. `as_const` in TS grammar)
    "const x = foo as const",
    "as const",
    "const colors = ['red', 'blue'] as const",
    "{ status: 'pending' as const }",
    "it.each(['a', 'b'] as const)('test', (v) => {})",
    "function f(x = { a: 1 } as const) {}",

    // Namespace imports / re-exports — tolerate any whitespace between `*` and `as`
    // (the previous regex only handled a single space; multi-space and newline
    // variants were false positives).
    "import * as Option from 'effect/Option'",
    "import * as Schema from 'effect/Schema'",
    "import * as Arr from 'effect/Array'",
    "export * as utils from './utils'",
    "import *  as Option from 'effect/Option'",
    "import *\tas Option from 'effect/Option'",
    "import *\n  as Option from 'effect/Option'",

    // Import / export bindings using `as` — these are rename specifiers,
    // not type assertions. The previous regex flagged every one.
    "import { foo as bar } from 'x'",
    "import { foo as bar, baz as qux } from 'x'",
    "import type { Foo as Bar } from 'x'",
    "import Default, { foo as bar } from 'x'",
    "export { foo as bar } from './x'",
    "export { foo as default } from './x'",
    "export type { Foo as Bar } from './x'",

    // String and template literal contents — `stripComments` intentionally
    // preserves string bodies, so a regex over stripped source would fire.
    "const msg = 'foo as bar'",
    'const msg = "foo as bar"',
    "const msg = `foo as bar`",
    "throw new Error('expected x as y')",
    "const m = 'don\\'t treat foo as bar'",

    // No `as` keyword at all
    "Schema.decode",
    "function isUser(x: unknown): x is User { return true }",
    "const value = 42",

    // `as` embedded inside identifiers (word boundary / AST scoping prevents match)
    "if (x.has value) {}",
    "const alias = getSomething()",
    "type alias = string",
    "class Foo extends Base {}",
    "const wasDeleted = true",
    "const hasBeen = check()",
    "const atlas = loadMap()",
    "const lastUpdated = Date.now()",

    // `satisfies` is a distinct operator, not an `as` expression
    "const x = { a: 1 } satisfies MyType",

    // Block comment mentioning `as` — stripped before regex, also not in AST
    "/*\n foo as Bar\n*/\nconst x = 1"
  ]
})
