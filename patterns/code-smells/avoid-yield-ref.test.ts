import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'avoid-yield-ref',

	shouldMatch: [
		'const value = yield* ref',
		'yield* deferred',
		'yield* fiber',
		'yield* latch'
	],
	shouldNotMatch: [
		'yield* Ref.get(ref)',
		'yield* Deferred.await(deferred)',
		'yield* Fiber.join(fiber)',
		'yield* Latch.await(latch)',
		'yield* Effect.gen(function* () {})',
		'yield* Stream.run(stream)',
		'yield* Layer.build(layer)'
	]
});
