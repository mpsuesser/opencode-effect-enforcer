import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-non-null-assertion",
  tag: "do-not-assert-non-null",
  shouldMatch: [
    'const value = map.get("key")!;',
    'const value = map.get("key")!.toString()',
    "user!.name",
    "items[0]!.id",
    "getValue()!;",
    "getValue()!.prop",
    "obj.prop!.nested",
    "arr[idx]!(",
    "arr[idx]![key]",
    "result!;",
    "result!['field']",
    // Previously classified as shouldNotMatch because the old regex
    // required a terminator char after `!`. The AST detector
    // correctly flags these bare non-null assertions.
    'const v = map.get("key")!',
    "foo(result!)",
    // Double bang
    "foo!.bar!"
  ],
  shouldNotMatch: [
    'const value = Option.fromNullishOr(map.get("key"))',
    "user?.name",
    "user?.contact?.email ?? defaultEmail",
    "const email = user?.email || 'none'",
    "if (user) { return user.name }",
    "// not! a non-null assertion",
    "value !== null",
    "!value",
    "!isValid",
    "const notBang = 'test'",
    // The `!` appears inside a string literal, not as an operator
    'throw new Error("nope!")',
    "const msg = 'do not use x!' "
  ]
})
