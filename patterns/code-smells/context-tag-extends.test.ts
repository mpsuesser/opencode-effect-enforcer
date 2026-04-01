import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'context-tag-extends',
	shouldMatch: [
		'class MyServiceTag extends Context.Tag',
		'class FooTag extends Context.Tag<FooTag>() { }',
		'export class ParallelClientTag extends Context.Tag',
		'Context.GenericTag<ParallelService>',
		'Context.GenericTag<MyClientService>'
	],
	shouldNotMatch: [
		'Context.GenericTag<ParallelClient>',
		'const MyClient = Context.GenericTag<MyClient>()',
		'interface MyService { }',
		'class MyClass extends BaseClass { }',
		"Tag = 'value'"
	]
});
