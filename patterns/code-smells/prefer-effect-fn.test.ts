import { testPattern } from '../../test/pattern-test-harness.ts';

testPattern({
	name: 'prefer-effect-fn',
	shouldMatch: [
		`ServiceMap.Service<MyService>()("MyService", { make: Effect.gen(function* () { return {} }) })`
	],
	shouldNotMatch: [
		`const program = Effect.gen(function* () { yield* Effect.log("hello") })`,
		`function doStuff() { return Effect.gen(function* () { return 42 }) }`
	]
});
