import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'use-servicemap-service',

	shouldMatch: [
		'const MyService = Context.Tag<MyService>()',
		'export const Foo = Context.Tag<Foo>("Foo")',
		'const Bar = Effect.Service<Bar>()',
		'export const Baz = Effect.Service<Baz>("Baz")'
	],
	shouldNotMatch: [
		'class MyService extends ServiceMap.Service<MyService>()("@app/MyService", {})',
		'const tag = "Context.Tag"',
		'// Context.Tag is deprecated',
		'Effect.ServiceMap'
	]
});
