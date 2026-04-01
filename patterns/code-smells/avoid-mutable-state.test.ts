import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'avoid-mutable-state',

	shouldMatch: [
		'let counter = 0',
		'let value: string',
		'let isReady = false',
		'let items: Array<string> = []'
	],
	shouldNotMatch: [
		'const counterRef = yield* Ref.make(0)',
		'const value = "hello"',
		'const isReady = true',
		'// let this be a comment'
	]
});
