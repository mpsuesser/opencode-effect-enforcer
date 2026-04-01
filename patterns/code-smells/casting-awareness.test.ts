import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'casting-awareness',
	tag: 'type-awareness',
	shouldMatch: [
		// Real type assertions
		'const x = foo as string',
		'return bar as User',
		'data as MyType',
		'value as number',
		'(response as Response)',
		'input as Record<string, unknown>',
		'event.target as HTMLInputElement'
	],
	shouldNotMatch: [
		// as const (acceptable narrowing)
		'const x = foo as const',
		'as const',
		"const colors = ['red', 'blue'] as const",
		"{ status: 'pending' as const }",
		"it.each(['a', 'b'] as const)('test', (v) => {})",

		// Namespace imports (import * as ...)
		"import * as Option from 'effect/Option'",
		"import * as Schema from 'effect/Schema'",
		"import * as Arr from 'effect/Array'",
		"export * as utils from './utils'",

		// No `as` keyword at all
		'Schema.decode',
		'function isUser(x: unknown): x is User { return true }',
		'const value = 42',

		// `as` embedded inside words (word boundary prevents match)
		'if (x.has value) {}',
		'const alias = getSomething()',
		'type alias = string',
		'class Foo extends Base {}',
		'const wasDeleted = true',
		'const hasBeen = check()',
		'const atlas = loadMap()',
		'const lastUpdated = Date.now()'
	]
});
