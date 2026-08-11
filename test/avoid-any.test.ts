import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-any",
  tag: "do-not-use-any",
  shouldMatch: [
    "const x = foo as any",
    "value as unknown as Bar",
    "return data as any",
    "const result = (obj as any).property",
    "items as unknown as string[]"
  ],
  shouldNotMatch: [
    "const any = 5",
    "const isAny = true",
    "function hasAnyValue() {}",
    "type AnyValue = string | number",
    // String-literal content mentioning the flagged casts
    "const msg = 'use foo as any here'",
    'const doc = "never use x as unknown as Y"',
    "const tmpl = `avoid as any patterns`",
    // Block comment
    "/* do not use as any */ const x = 1",
    // `as const` is narrowing, not an escape hatch
    "const colors = ['red', 'blue'] as const"
  ]
})
