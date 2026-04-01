import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'throw-in-effect-gen',

	shouldMatch: [
		`Effect.gen(function* () { throw new Error("bad") })`,
		`Effect.gen(function* (_) { if (!user) throw new Error("not found"); })`
	],
	shouldNotMatch: [
		`Effect.gen(function* () { yield* Effect.fail(new MyError({ message: "not found" })) })`,
		`function notEffect() { throw new Error("ok here") }`,
		`Effect.tryPromise({ try: () => { throw new Error("caught by catch") }, catch: (e) => new MyError({ message: String(e) }) })`
	]
});
