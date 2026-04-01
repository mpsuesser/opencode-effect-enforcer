import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'prefer-arr-sort',
	tag: 'ef-38-arr-sort',
	shouldMatch: [
		'items.sort((a, b) => a - b)',
		'users.sort((a, b) => a.name.localeCompare(b.name))',
		'results.sort()',
		'const sorted = arr.sort((x, y) => x.id - y.id)',
		'data.sort ((a, b) => a.order - b.order)'
	],
	shouldNotMatch: [
		'Arr.sort(items, byName)',
		'const sortOrder = "asc"',
		'import { sort } from "effect/Array"',
		'sortedItems.map(x => x)',
		'const sortBy = Order.mapInput(Order.String, (x) => x.name)'
	]
});
