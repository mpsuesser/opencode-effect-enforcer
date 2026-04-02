---
name: effect-optics
description: Use Effect Optic for composable, type-safe access and immutable updates to nested data structures. Covers Iso, Lens, Prism, Optional, and Traversal — when to use each, how to compose them, and practical patterns for deep updates, tagged unions, and filtered collections.
---

You are an Effect TypeScript expert specializing in functional optics for immutable data access and transformation.

## Effect Source Reference

The Effect v4 source is available at `.references/effect-v4/` in your project root.
Browse and read files there directly to look up APIs, types, and implementations.

Key reference files:

- `packages/effect/OPTIC.md` — full guide with examples
- `packages/effect/src/Optic.ts` — API surface and JSDoc

## Core Import

```ts
import { Optic } from 'effect';
```

All optic types and constructors live under `Optic`. Supporting types come from `Result`, `Option`, and `Schema` as needed.

## Optic Type Hierarchy

Strongest to weakest — composing two optics produces the weaker kind:

```
Iso > Lens | Prism > Optional
```

| Optic         | get         | set/replace                 | Use case                                                  |
| ------------- | ----------- | --------------------------- | --------------------------------------------------------- |
| **Iso**       | Always      | Always (no original needed) | Lossless two-way conversion (e.g. Celsius <-> Fahrenheit) |
| **Lens**      | Always      | Always (needs original `S`) | Always-present field in a struct                          |
| **Prism**     | May fail    | Always (no original needed) | Union variant, validated subset                           |
| **Optional**  | May fail    | May fail                    | General case — both reading and writing can fail          |
| **Traversal** | Zero+ items | Zero+ items                 | Multiple elements in an array/collection                  |

**Traversal** is modeled as `Optional<S, ReadonlyArray<A>>` — not a separate optic kind. Use `.forEach()` and `.modifyAll()` to operate on individual elements.

## Starting an Optic Chain

Always begin with `Optic.id<S>()` — the identity Iso on type `S`:

```ts
import { Optic } from 'effect';

type State = { user: { name: string; age: number } };

const _age = Optic.id<State>().key('user').key('age');
```

## Builder Methods (Chainable)

These are called on any optic instance to drill deeper or narrow focus:

### `.key(k)` — Lens into a struct/tuple field

Always-present field. Returns a Lens (from a Lens) or Optional (from an Optional). Does NOT work on union types.

```ts
type S = { readonly a: { readonly b: number } };
const _b = Optic.id<S>().key('a').key('b');

_b.get({ a: { b: 42 } }); // 42
_b.replace(99, { a: { b: 42 } }); // { a: { b: 99 } }
```

Tuples use numeric keys:

```ts
type S = readonly [string, number];
const _0 = Optic.id<S>().key(0);
_0.get(['hello', 42]); // "hello"
```

### `.optionalKey(k)` — Lens that removes key on `undefined`

Like `.key()` but setting `undefined` removes the key from the struct (or splices from a tuple):

```ts
type S = { readonly a?: number };
const _a = Optic.id<S>().optionalKey('a');

_a.replace(2, {}); // { a: 2 }
_a.replace(undefined, { a: 1 }); // {}
```

### `.at(k)` — Optional into a record/array index

For records or arrays where the key/index might not exist. Both get and set can fail. Always returns an Optional.

```ts
type Env = { [key: string]: number };
const _x = Optic.id<Env>().at('x');

_x.replace(2, { x: 1 }); // { x: 2 }
// getResult fails if "x" is absent
```

```ts
type S = ReadonlyArray<number>;
const _0 = Optic.id<S>().at(0);

_0.replace(3, [1, 2]); // [3, 2]
```

### `.tag(variant)` — Prism into a tagged union variant

Narrows focus to the variant with the matching `_tag`. No-ops on non-matching variants:

```ts
type Shape =
	| { readonly _tag: 'Circle'; readonly radius: number }
	| { readonly _tag: 'Rect'; readonly width: number };

const _radius = Optic.id<Shape>().tag('Circle').key('radius');

_radius.replace(10, { _tag: 'Circle', radius: 5 }); // { _tag: "Circle", radius: 10 }
_radius.replace(10, { _tag: 'Rect', width: 5 }); // { _tag: "Rect", width: 5 } (unchanged)
```

### `.pick(keys)` / `.omit(keys)` — Lens into a subset of struct keys

```ts
type S = { readonly a: number; readonly b: number; readonly c: number };

const _ac = Optic.id<S>().pick(['a', 'c']);
_ac.replace({ a: 4, c: 5 }, { a: 1, b: 2, c: 3 }); // { a: 4, b: 2, c: 5 }

const _ac2 = Optic.id<S>().omit(['b']);
// same result
```

### `.notUndefined()` — Filter out `undefined`

```ts
const _defined = Optic.id<number | undefined>().notUndefined();
// getResult succeeds on 42, fails on undefined
```

### `.check(...checks)` — Validate with Schema checks

Adds Schema validation. `getResult` fails when any check fails; `set` passes through unchanged:

```ts
import { Optic, Schema } from 'effect';

const _pos = Optic.id<number>().check(Schema.isGreaterThan(0));
// getResult succeeds on 5, fails on -1
```

### `.refine(guard)` — Narrow by type guard

```ts
type B = { readonly _tag: 'b'; readonly b: number };
type S = { readonly _tag: 'a'; readonly a: string } | B;

const _b = Optic.id<S>().refine((s: S): s is B => s._tag === 'b', {
	expected: `"b" tag`
});
```

### `.forEach(f)` — Traverse array elements

Available when focus is `ReadonlyArray<A>`. The callback receives an `Iso<A, A>` to drill into each element:

```ts
import { Optic, Schema } from 'effect';

type S = { readonly a: ReadonlyArray<number> };

const _positive = Optic.id<S>()
	.key('a')
	.forEach((item) => item.check(Schema.isGreaterThan(0)));

_positive.modifyAll((n) => n + 1)({ a: [1, -2, 3] });
// { a: [2, -2, 4] }
```

### `.compose(optic)` — Compose with another optic

```ts
import { Optic, Option } from 'effect';

type State = { value: Option.Option<number> };

const _inner = Optic.id<State>().key('value').compose(Optic.some());
// Optional<State, number>
```

## Reading Values

| Method          | Returns             | When to use                          |
| --------------- | ------------------- | ------------------------------------ |
| `.get(s)`       | `A`                 | Lens/Iso only — always succeeds      |
| `.getResult(s)` | `Result<A, string>` | Any optic — explicit success/failure |

```ts
const _a = Optic.id<{ a: number }>().key('a');
_a.get({ a: 1 }); // 1
_a.getResult({ a: 1 }); // Result.succeed(1)
```

For traversals, use `Optic.getAll`:

```ts
const getPositive = Optic.getAll(_positive);
getPositive({ a: [3, -1, 5] }); // [3, 5]
```

## Writing Values

| Method                 | Behavior                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `.replace(a, s)`       | Returns new `S` with focused value replaced. Silently returns original on focus failure. |
| `.replaceResult(a, s)` | Returns `Result<S, string>` — explicit failure.                                          |
| `.modify(f)`           | Returns `(s: S) => S`. On focus failure, returns `s` unchanged.                          |
| `.modifyAll(f)`        | Traversal only. Maps `f` over each focused element.                                      |
| `.set(a)`              | Prism/Iso only — builds `S` from `A` without needing original.                           |

```ts
// replace
_age.replace(31, state);

// modify (returns a function)
const inc = _age.modify((n) => n + 1);
inc(state);

// modifyAll (traversal)
const doubled = _positive.modifyAll((n) => n * 2);
doubled({ items: [1, -2, 3] }); // { items: [2, -2, 6] }
```

## Constructors

For custom optics beyond the builder chain:

```ts
// Iso — lossless two-way conversion
const fahrenheit = Optic.makeIso<number, number>(
	(c) => (c * 9) / 5 + 32, // get: Celsius -> Fahrenheit
	(f) => ((f - 32) * 5) / 9 // set: Fahrenheit -> Celsius
);

// Lens — always-present focus, needs original for replace
const _first = Optic.makeLens<readonly [string, number], string>(
	(pair) => pair[0],
	(s, pair) => [s, pair[1]]
);

// Prism — focus may not exist, set doesn't need original
const numeric = Optic.makePrism<string, number>((s) => {
	const n = Number(s);
	return Number.isNaN(n) ? Result.fail('not a number') : Result.succeed(n);
}, String);

// Prism from Schema checks
const posInt = Optic.fromChecks<number>(
	Schema.isGreaterThan(0),
	Schema.isInt()
);

// Optional — both reading and writing can fail
const atKey = (key: string) =>
	Optic.makeOptional<Record<string, number>, number>(
		(s) =>
			Object.hasOwn(s, key)
				? Result.succeed(s[key])
				: Result.fail(`Key "${key}" not found`),
		(a, s) =>
			Object.hasOwn(s, key)
				? Result.succeed({ ...s, [key]: a })
				: Result.fail(`Key "${key}" not found`)
	);
```

## Built-in Prisms

```ts
// Option
Optic.some<A>(); // Prism<Option<A>, A> — focus on Some
Optic.none<A>(); // Prism<Option<A>, undefined> — focus on None

// Result
Optic.success<A, E>(); // Prism<Result<A, E>, A>
Optic.failure<A, E>(); // Prism<Result<A, E>, E>

// Record <-> entries
Optic.entries<A>(); // Iso<Record<string, A>, ReadonlyArray<readonly [string, A]>>
```

## Schema Integration

Generate optics from Schema definitions with `Schema.toIso`:

```ts
import { Schema } from 'effect';

const schema = Schema.Struct({
	a: Schema.String,
	b: Schema.Number
});

const _b = Schema.toIso(schema).key('b');
_b.replace(2, { a: 'a', b: 1 }); // { a: "a", b: 2 }
```

Works with class-based schemas too:

```ts
class Person extends Schema.Class<Person>('Person')({
	name: Schema.String,
	age: Schema.Number
}) {}

const _name = Schema.toIso(Person).key('name');
_name.replace('Bob', new Person({ name: 'Alice', age: 30 }));
// Person { name: "Bob", age: 30 }
```

## Practical Patterns

### Deep nested update (define once, reuse everywhere)

```ts
import { Optic, String } from 'effect';

interface Street {
	readonly num: number;
	readonly name: string;
}
interface Address {
	readonly city: string;
	readonly street: Street;
}
interface Company {
	readonly name: string;
	readonly address: Address;
}
interface Employee {
	readonly name: string;
	readonly company: Company;
}

const _streetName = Optic.id<Employee>()
	.key('company')
	.key('address')
	.key('street')
	.key('name');

// Reuse with different transforms
const capitalize = _streetName.modify(String.capitalize);
const upper = _streetName.modify((s) => s.toUpperCase());
```

### Tagged union — safe variant access

```ts
type Shape =
	| { readonly _tag: 'Circle'; readonly radius: number }
	| {
			readonly _tag: 'Rect';
			readonly width: number;
			readonly height: number;
	  };

const _circleRadius = Optic.id<Shape>().tag('Circle').key('radius');
const _rectArea = Optic.id<Shape>().tag('Rect').pick(['width', 'height']);

// replace is a no-op on non-matching variants
_circleRadius.replace(10, { _tag: 'Rect', width: 5, height: 3 });
// { _tag: "Rect", width: 5, height: 3 } — unchanged
```

### Traversal with filtering

```ts
import { Optic, Schema } from 'effect';

type S = {
	readonly todos?: ReadonlyArray<{
		readonly title?: string;
		readonly description: string;
	}>;
};

const _titles = Optic.id<S>()
	.key('todos')
	.notUndefined()
	.forEach((item) => item.key('title').notUndefined());

const shout = _titles.modifyAll((t) => t.toUpperCase());

shout({
	todos: [
		{ title: 'milk', description: 'buy milk' },
		{ description: 'buy bread' }
	]
});
// { todos: [{ title: "MILK", description: "buy milk" }, { description: "buy bread" }] }
```

### Record traversal via entries

```ts
import { Optic, Schema } from 'effect';

const _positiveValues = Optic.entries<number>().forEach((entry) =>
	entry.key(1).check(Schema.isGreaterThan(0))
);

const inc = _positiveValues.modifyAll((n) => n + 1);
inc({ a: 0, b: 3, c: -1 }); // { a: 0, b: 4, c: -1 }
```

### Debugging focus failures

Use `getResult` to see explicit success/failure:

```ts
import { Optic, Result } from 'effect';

type S = { readonly a?: number };
const _a = Optic.id<S>().at('a');

const result = _a.getResult({});
Result.match(result, {
	onSuccess: (value) => `value: ${value}`,
	onFailure: () => 'no focus'
});
// "no focus"
```

## Quick Reference Table

| Data shape                             | Builder method                                      |
| -------------------------------------- | --------------------------------------------------- |
| Always-present field                   | `.key("field")`                                     |
| Optional field (keep `undefined`)      | `.key("field")`                                     |
| Optional field (remove on `undefined`) | `.optionalKey("field")`                             |
| Union case by `_tag`                   | `.tag("Variant")`                                   |
| Record/array index (may be absent)     | `.at(key)`                                          |
| Filter + update collection items       | `.forEach(el => el.check(...))` / `.notUndefined()` |
| Subset of struct keys                  | `.pick([...])` / `.omit([...])`                     |
| Narrow by type guard                   | `.refine(guard)`                                    |
| Option.Some                            | `.compose(Optic.some())`                            |
| Result.Success                         | `.compose(Optic.success())`                         |

## Known Limitations

- Only works with **plain JavaScript objects** and collections (structs, records, tuples, arrays). Class instances cause runtime errors on `replace`/`modify` (unless generated via `Schema.toIso` on a class schema).
- `.key()`, `.optionalKey()`, `.at()`, `.pick()`, `.omit()` do NOT work on union types (compile error). Use `.tag()` or `.refine()` first to narrow.
- No-op updates may still allocate a new root — do not rely on reference identity to detect no-ops.
- `replace` silently returns the original `S` when the optic cannot focus. Use `replaceResult` for explicit failure detection.

## Anti-Patterns

### WRONG: Repeating paths instead of defining an optic once

```ts
// Bad — duplicated navigation
const upper = {
	...state,
	user: {
		...state.user,
		profile: {
			...state.user.profile,
			name: state.user.profile.name.toUpperCase()
		}
	}
};
const lower = {
	...state,
	user: {
		...state.user,
		profile: {
			...state.user.profile,
			name: state.user.profile.name.toLowerCase()
		}
	}
};
```

### RIGHT: Define the optic once, reuse for different transforms

```ts
const _name = Optic.id<S>().key('user').key('profile').key('name');
const upper = _name.modify((n) => n.toUpperCase())(state);
const lower = _name.modify((n) => n.toLowerCase())(state);
```
