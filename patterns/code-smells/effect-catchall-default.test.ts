import { testPattern } from '../../test/pattern-test-harness.ts';

testPattern({
	name: 'effect-catchall-default',
	shouldMatch: [
		'Effect.catch(() => Effect.succeed(defaultValue))',
		'Effect.catch((_) => Effect.succeed(defaultUser))',
		'Effect.catch(e => Effect.succeed({}))',
		'Effect.catch(() => succeed(null))',
		'Effect.catch(_ => sync(() => defaultValue))',
		'pipe(effect, Effect.catch(() => Effect.succeed(0)))',
		'Effect.catch((error) => Effect.succeed(fallback))',
		'Effect.catch(() => Effect.sync(() => defaultUser))',
		'Effect.catch(() =>\n      Effect.succeed(defaultValue)\n    )',
		'Effect.catch((error) => succeed(fallback))',
		'Effect.catch(()=> Effect.succeed(null))'
	],
	shouldNotMatch: [
		"Effect.catchTag('NotFound', () => Effect.succeed(default))",
		'Effect.catch(() => Effect.fail(error))',
		'Effect.catch(() => processError())',
		'catchAllDefect(() => Effect.succeed(default))',
		'effect.catch',
		'const catch = () => succeed(default)',
		"Effect.catch(() => pipe(log('error'), Effect.flatMap(() => Effect.fail(error))))",
		"catchTag('NotFound', () => createDefaultUser())",
		"Effect.catch(() => Effect.gen(function*() { yield* log('error'); return yield* Effect.fail(error) }))"
	]
});
