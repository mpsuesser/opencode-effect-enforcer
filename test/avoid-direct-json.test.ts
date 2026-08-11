import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-direct-json",
  tag: "prefer-schema-json",
  shouldMatch: [
    "const data = JSON.parse(str)",
    "const text = JSON.stringify(obj)",
    "JSON.parse(response.body)",
    "const output = JSON.stringify(data, null, 2)"
  ],
  shouldNotMatch: [
    "const json = 'some string'",
    "// JSON.parse should not be used",
    "const parseJson = Schema.parseJson",
    "import { parseJson } from 'effect/Schema'",
    // String / template / comment content
    'const doc = "prefer Schema.fromJsonString over JSON.parse"',
    "const tmpl = `avoid JSON.stringify in domain`",
    "/* use Schema codecs instead of JSON.parse */",
    // Schema codecs and other APIs
    "Schema.fromJsonString(User)",
    "Schema.fromJsonString(Schema.Unknown)",
    // Method with similar name on a different object
    "json.parse(data)",
    "myCodec.stringify(value)"
  ]
})
