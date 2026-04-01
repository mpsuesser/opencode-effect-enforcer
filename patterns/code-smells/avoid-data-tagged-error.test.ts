import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'avoid-data-tagged-error',

	shouldMatch: [
		"class MyError extends Data.TaggedError('MyError')<{ message: string }> {}",
		"export class FooError extends Data.TaggedError('FooError')<{}>() {}",
		"Data.TaggedError('NotFound')"
	],
	shouldNotMatch: [
		"Schema.TaggedError<MyError>()('MyError', { message: Schema.String })",
		"const tagged = Data.tagged('Foo')",
		'Data.TaggedEnum'
	]
});
