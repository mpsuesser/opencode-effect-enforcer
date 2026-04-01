import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'prefer-schema-class',
	tag: 'ef-3-schema-class',
	shouldMatch: [
		'const User = Schema.Struct({ id: Schema.String })',
		'Schema.Struct({',
		'export const Input = Schema.Struct ({ name: Schema.String })',
		'const payload = Schema.Struct(\n  { query: Schema.String }\n)'
	],
	shouldNotMatch: [
		'class User extends Schema.Class<User>("User")({',
		'Schema.String',
		'Schema.Array(Schema.String)',
		'// Schema.Struct should not be used',
		'import * as Schema from "effect/Schema"'
	]
});
