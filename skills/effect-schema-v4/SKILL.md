---
name: effect-schema-v4
description: Authoritative reference for Effect Schema v4 API changes and migration patterns from v3. Use this skill when writing Schema code to avoid v3 patterns, when migrating existing v3 Schema code, or when unsure about current Schema API names.
---

You are an Effect TypeScript expert. This skill is a **migration reference** — it documents the key v4 Schema API changes so you don't accidentally use v3 patterns.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Full Schema API: `packages/effect/SCHEMA.md`
- Migration guide: `migration/schema.md`
- SchemaTransformation module: `packages/effect/src/SchemaTransformation.ts`
- SchemaGetter module: `packages/effect/src/SchemaGetter.ts`

## 1. Key Renames (find-and-replace safe)

| v3                            | v4                                  | Notes                                     |
| ----------------------------- | ----------------------------------- | ----------------------------------------- |
| `annotations(ann)`            | `annotate(ann)`                     |                                           |
| `compose(schemaB)`            | `decodeTo(schemaB)` or `decodeTo(schemaB, transformation)` | Transformation is optional; omitted uses passthrough composition |
| `typeSchema(schema)`          | `toType(schema)`                    |                                           |
| `asSchema(schema)`            | `revealCodec(schema)`               |                                           |
| `equivalence()`               | `toEquivalence()`                   |                                           |
| `arbitrary()`                 | `toArbitrary()`                     |                                           |
| `pretty()`                    | `toFormatter()`                     |                                           |
| `parseJson()`                 | `UnknownFromJsonString`             | No-arg version is now a standalone schema |
| `parseJson(schema)`           | `fromJsonString(schema)`            | With-schema version                       |
| `TaggedError`                 | `TaggedErrorClass`                  | Class name change                         |
| `BigIntFromSelf`              | `BigInt`                            |                                           |
| `SymbolFromSelf`              | `Symbol`                            |                                           |
| `URLFromSelf`                 | `URL`                               |                                           |
| `DateFromSelf`                | `Date`                              | All `*FromSelf` drop the suffix           |
| `DurationFromSelf`            | `Duration`                          |                                           |
| `OptionFromSelf`              | `Option`                            |                                           |
| `EitherFromSelf`              | `Result`                            | Also renamed from Either to Result        |
| `RedactedFromSelf`            | `Redacted`                          | Expects `Redacted` values; JSON encoding is allowed by default |
| `Redacted`                    | `RedactedFromValue`                 | Raw value → `Redacted`; encoding is allowed by default |
| `ChunkFromSelf`               | `Chunk`                             | `*FromSelf` suffix removed                |
| `ReadonlyMapFromSelf`         | `ReadonlyMap`                       | `*FromSelf` suffix removed                |
| `ReadonlySetFromSelf`         | `ReadonlySet`                       | `*FromSelf` suffix removed                |
| `HashMapFromSelf`             | `HashMap`                           | `*FromSelf` suffix removed                |
| `HashSetFromSelf`             | `HashSet`                           | `*FromSelf` suffix removed                |
| `BigDecimalFromSelf`          | `BigDecimal`                        | `*FromSelf` suffix removed                |
| `CauseFromSelf`               | `Cause`                             | `*FromSelf` suffix removed                |
| `ExitFromSelf`                | `Exit`                              | `*FromSelf` suffix removed                |
| `RegExpFromSelf`              | `RegExp`                            | `*FromSelf` suffix removed                |
| `encodedSchema(schema)`       | `toEncoded(schema)`                 |                                           |
| `decodingFallback` annotation | `catchDecoding(...)`                | Annotation replaced by combinator         |
| `Literal(null)`               | `Null`                              | Standalone schema for null                |
| `standardSchemaV1`            | `toStandardSchemaV1`                |                                           |
| `nonEmptyString`              | `isNonEmpty()`                      | Now used with `.check()`                  |
| `disableValidation`           | `disableChecks`                     | In `MakeOptions` for Class constructors   |

### Parser/Codec Function Renames

All parsing functions were renamed to clarify whether they return an `Effect` or an `Exit`:

| v3                    | v4                    |
| --------------------- | --------------------- |
| `decodeUnknown`       | `decodeUnknownEffect` |
| `decode`              | `decodeEffect`        |
| `decodeUnknownEither` | `decodeUnknownExit`   |
| `decodeEither`        | `decodeExit`          |
| `encodeUnknown`       | `encodeUnknownEffect` |
| `encode`              | `encodeEffect`        |
| `encodeUnknownEither` | `encodeUnknownExit`   |
| `encodeEither`        | `encodeExit`          |

Note: `decodeUnknownSync` and `encodeSync` are **unchanged** — they still exist on `Schema`.

**Redacted encoding:** `Schema.Redacted` and `Schema.RedactedFromValue` encode by default. Opt out with `Schema.Redacted(schema, { disallowJsonEncode: true })` for JSON encoding or `Schema.RedactedFromValue(schema, { disallowEncode: true })` for all encoding.

## 2. Variadic → Array Arguments

Several APIs that accepted variadic args now take arrays:

```ts
// v3
Schema.Literal('a', 'b');
Schema.Union(A, B);
Schema.Tuple(A, B);
Schema.TemplateLiteral(A, B);

// v4
Schema.Literals(['a', 'b']); // Note: single Literal("a") still exists
Schema.Union([A, B]); // Array form is the canonical v4 signature
Schema.Tuple([A, B]);
Schema.TemplateLiteral([A, B]);
```

### Record: Object → Positional Args

```ts
// v3
Schema.Record({ key: Schema.String, value: Schema.Number });

// v4
Schema.Record(Schema.String, Schema.Number);
```

## 3. Filter → Check Migration

The `.pipe(Schema.filter(...))` pattern is replaced by `.check()` with `is*` prefixed validators:

```ts
// v3
Schema.String.pipe(Schema.minLength(5));
Schema.Number.pipe(Schema.int());
Schema.Number.pipe(Schema.greaterThan(0));

// v4
Schema.String.check(Schema.isMinLength(5));
Schema.Number.check(Schema.isInt());
Schema.Number.check(Schema.isGreaterThan(0));
```

### Complete Filter Rename Table

| v3 filter                 | v4 check                          |
| ------------------------- | --------------------------------- |
| `greaterThan(n)`          | `isGreaterThan(n)`                |
| `greaterThanOrEqualTo(n)` | `isGreaterThanOrEqualTo(n)`       |
| `lessThan(n)`             | `isLessThan(n)`                   |
| `lessThanOrEqualTo(n)`    | `isLessThanOrEqualTo(n)`          |
| `between(min, max)`       | `isBetween({ minimum, maximum })` |
| `int()`                   | `isInt()`                         |
| `multipleOf(n)`           | `isMultipleOf(n)`                 |
| `finite`                  | `isFinite()`                      |
| `minLength(n)`            | `isMinLength(n)`                  |
| `maxLength(n)`            | `isMaxLength(n)`                  |
| `length(n)`               | `isLengthBetween(n, n)`           |
| `pattern(regex)`          | `isPattern(regex)`                |
| `nonEmptyString`          | `isNonEmpty()`                    |

### Removed Filters (no v4 equivalent)

`positive`, `negative`, `nonNegative`, `nonPositive` — build these yourself:

```ts
// v4: replace removed convenience filters
const isPositive = Schema.isGreaterThan(0);
const isNonNegative = Schema.isGreaterThanOrEqualTo(0);
const isNegative = Schema.isLessThan(0);
const isNonPositive = Schema.isLessThanOrEqualTo(0);
```

### Custom Filters

```ts
// v3: inline predicate filter
Schema.String.pipe(Schema.filter((s) => s.length > 0));

// v4: use makeFilter
Schema.String.check(Schema.makeFilter((s) => s.length > 0));

// v3: refinement filter
Schema.Option(Schema.String).pipe(Schema.filter(Option.isSome));

// v4: use refine for type-narrowing predicates
Schema.Option(Schema.String).pipe(Schema.refine(Option.isSome));
```

### String Transforms (not filters)

```ts
// v4: string transformations use SchemaTransformation + .decode()
import { Schema, SchemaTransformation } from 'effect';

Schema.String.pipe(Schema.decode(SchemaTransformation.trim()));
Schema.String.pipe(Schema.decode(SchemaTransformation.toLowerCase()));
Schema.String.pipe(Schema.decode(SchemaTransformation.toUpperCase()));
```

## 4. Transform Migration

`Schema.transform` and `Schema.transformOrFail` no longer exist as standalone functions. Use `Schema.decodeTo` with `SchemaTransformation`:

### Pure Transform

```ts
// v3
const BoolFromString = Schema.transform(
	Schema.Literal('on', 'off'),
	Schema.Boolean,
	{
		strict: true,
		decode: (literal) => literal === 'on',
		encode: (bool) => (bool ? 'on' : 'off')
	}
);

// v4
import { Schema, SchemaTransformation } from 'effect';

const BoolFromString = Schema.Literals(['on', 'off']).pipe(
	Schema.decodeTo(
		Schema.Boolean,
		SchemaTransformation.transform({
			decode: (literal) => literal === 'on',
			encode: (bool) => (bool ? 'on' : 'off')
		})
	)
);
```

### Fallible Transform

```ts
// v3
const NumberFromString = Schema.transformOrFail(Schema.String, Schema.Number, {
	strict: true,
	decode: (input, _, ast) => {
		const parsed = parseFloat(input);
		if (isNaN(parsed)) {
			return ParseResult.fail(
				new ParseResult.Type(ast, input, 'Not a number')
			);
		}
		return ParseResult.succeed(parsed);
	},
	encode: (input) => ParseResult.succeed(input.toString())
});

// v4
import {
	Effect,
	Number,
	Option,
	Schema,
	SchemaGetter,
	SchemaIssue
} from 'effect';

const NumberFromString = Schema.String.pipe(
	Schema.decodeTo(Schema.Number, {
		decode: SchemaGetter.transformOrFail((s) =>
			Option.match(Number.parse(s), {
				onNone: () =>
					Effect.fail(
						new SchemaIssue.InvalidValue(Option.some(s))
					),
				onSome: (n) => Effect.succeed(n)
			})
		),
		encode: SchemaGetter.String()
	})
);
```

### Literal Transforms

```ts
// v3
Schema.transformLiteral(0, 'a');
Schema.transformLiterals([0, 'a'], [1, 'b']);

// v4
Schema.Literal(0).transform('a');
Schema.Literals([0, 1]).transform(['a', 'b']);
```

## 5. Schema.Data Removal

`Schema.Data` is **removed** in v4. No replacement needed — `Equal.equals` now does deep structural comparison on plain objects by default.

```ts
// v3: needed Schema.Data for structural equality
const PersonData = Schema.Data(Schema.Struct({ name: Schema.String }));

// v4: just use the struct directly — equality works out of the box
const Person = Schema.Struct({ name: Schema.String });
```

## 6. Structural Operations via mapFields

`pick`, `omit`, `partial`, `required`, and `extend` are now expressed through `mapFields`:

```ts
import { Schema, Struct } from 'effect';

const base = Schema.Struct({
	a: Schema.String,
	b: Schema.Number,
	c: Schema.Boolean
});

// pick
base.mapFields(Struct.pick(['a']));

// omit
base.mapFields(Struct.omit(['b']));

// partial (allows undefined)
base.mapFields(Struct.map(Schema.optional));

// partial exact (key can be absent, no undefined)
base.mapFields(Struct.map(Schema.optionalKey));

// partial subset
base.mapFields(Struct.mapPick(['a'], Schema.optional));

// required
base.mapFields(Struct.map(Schema.requiredKey));

// extend (add fields)
base.mapFields(Struct.assign({ d: Schema.Date }));
// or:
base.pipe(Schema.fieldsAssign({ d: Schema.Date }));
```

### attachPropertySignature → mapFields + tagDefaultOmit

```ts
// v3
Circle.pipe(Schema.attachPropertySignature('kind', 'circle'));

// v4
Circle.mapFields((fields) => ({
	...fields,
	kind: Schema.tagDefaultOmit('circle')
}));
```

## 7. Optional Keys: optionalKey vs optional

v4 distinguishes between two kinds of optional struct fields:

| API                     | TypeScript type               | Meaning                                     |
| ----------------------- | ----------------------------- | ------------------------------------------- |
| `Schema.optionalKey(S)` | `readonly a?: T`              | Key may be absent (exact optional)          |
| `Schema.optional(S)`    | `readonly a?: T \| undefined` | Key may be absent OR explicitly `undefined` |
| `Schema.mutableKey(S)`  | `a: T`                        | Writable (removes `readonly`)               |

Use `Schema.withDecodingDefaultKey` / `Schema.withDecodingDefault` when the default is on the schema **Encoded** side. For transformed schemas (for example `Schema.FiniteFromString`), that means the default is the pre-decoded input such as `'1'`.

Use `Schema.withDecodingDefaultTypeKey` / `Schema.withDecodingDefaultType` when the default is on the decoded **Type** side, such as `1` for `Schema.FiniteFromString`.

Defaults are `Effect` values: they may require services and may fail with `Schema.SchemaError`.

```ts
import { Effect, Schema, SchemaGetter } from 'effect';

const User = Schema.Struct({
	name: Schema.String.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed('anonymous'))
	),
	role: Schema.String.pipe(
		Schema.withDecodingDefault(Effect.succeed('viewer'))
	),
	retriesEncoded: Schema.FiniteFromString.pipe(
		Schema.withDecodingDefault(Effect.succeed('1'))
	),
	retriesType: Schema.FiniteFromString.pipe(
		Schema.withDecodingDefaultType(Effect.succeed(1))
	),
	quotaTypeKey: Schema.FiniteFromString.pipe(
		Schema.withDecodingDefaultTypeKey(Effect.succeed(10))
	)
});

const fallback = SchemaGetter.withDefault(Effect.succeed('viewer'));
```

### Beta.46 Additions

- `Schema.makeEffect(input, options?)` on schemas and schema-backed classes returns an `Effect` that fails with `Schema.SchemaError`.
- `Schema.resolveInto` was renamed to `Schema.resolveAnnotations`.
- `Schema.resolveAnnotationsKey(schema)` returns key-level annotations.
- `Schema.annotateEncoded({...})` annotates the encoded side of a transformed schema; use `Schema.annotate({...})` for the decoded Type side.
- `Schema.asClass(schema)` turns any schema into an extendable class with static helpers.
- New built-in schemas:
    - `Schema.DateFromString`
    - `Schema.BigIntFromString`
    - `Schema.BigDecimalFromString`
    - `Schema.TimeZoneNamedFromString`
    - `Schema.TimeZoneFromString`
    - `Schema.DateTimeZonedFromString`
    - `Schema.DurationFromString`
    - `Schema.StringFromBase64`
    - `Schema.StringFromBase64Url`
    - `Schema.StringFromHex`
    - `Schema.StringFromUriComponent`

```ts
import { Effect, Schema } from 'effect';

class UserName extends Schema.asClass(Schema.NonEmptyString) {
	static readonly decodeUnknownSync = Schema.decodeUnknownSync(this);
}

const name = UserName.decodeUnknownSync('alice');

const resolved = Schema.resolveAnnotations(
	Schema.String.annotate({ description: 'Display name' })
);

const resolvedKey = Schema.resolveAnnotationsKey(
	Schema.String.annotateKey({ description: 'Primary user id' })
);

const annotatedEncoded = Schema.NumberFromString.pipe(
	Schema.annotateEncoded({ description: 'Numeric string input' })
);

const duration = Schema.DurationFromString;

const parsed = Schema.String.makeEffect('alice');
```

## 8. New Modules

### SchemaTransformation

Bidirectional transformation pairs (decode + encode getters). Key exports:

- `transform({ decode, encode })` — pure bidirectional transform
- `passthrough()` — identity (no conversion)
- `trim()`, `toLowerCase()`, `toUpperCase()`, `capitalize()` — string transforms
- `numberFromString`, `bigintFromString` — parsing transforms
- `durationFromString` — string ↔ `Duration.Duration` transform
- `optionFromNullOr()`, `optionFromOptionalKey()` — Option wrapping
- `fromJsonString` — JSON string codec
- `Middleware` class — wraps the full parsing Effect pipeline (for fallbacks, retries)

```ts
import { Schema, SchemaTransformation } from 'effect';

// Basic usage: always pipe through Schema.decodeTo
const Cents = Schema.Number.pipe(
	Schema.decodeTo(
		Schema.Number,
		SchemaTransformation.transform({
			decode: (dollars) => dollars * 100,
			encode: (cents) => cents / 100
		})
	)
);

const DurationFromString = Schema.String.pipe(
	Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromString)
);
```

### SchemaGetter

Single-direction transform primitives. A `Getter<T, E, R>` is `Option<E> → Effect<Option<T>, Issue, R>`. Key exports:

- `transform(fn)` — pure map over present values
- `transformOrFail(fn)` — fallible map returning `Effect`
- `transformOptional(fn)` — full `Option<E> → Option<T>` control (for optional field transforms)
- `passthrough()` — identity getter
- `withDefault(effect)` — provide a default `Effect` for missing values
- `required()` — fail if value is missing
- `checkEffect(fn)` — effectful validation
- `String()`, `Number()`, `Boolean()`, `BigInt()`, `Date()` — coercion getters

```ts
import { Schema, SchemaGetter } from 'effect';

// Used as decode/encode args in Schema.decodeTo
const NumberFromString = Schema.String.pipe(
	Schema.decodeTo(Schema.Number, {
		decode: SchemaGetter.transform((s) => Number(s)),
		encode: SchemaGetter.transform((n) => String(n))
	})
);
```

## 9. Class Schemas

Classes still use the same pattern — `Schema.Class<Self>(tag)(fields)`:

```ts
import { Schema } from 'effect';

class User extends Schema.Class<User>('User')({
	name: Schema.String,
	email: Schema.String
}) {}

// With validation on the whole struct
class User2 extends Schema.Class<User2>('User2')(
	Schema.Struct({
		name: Schema.String,
		age: Schema.Number
	}).check(
		Schema.makeFilter(({ age }) => age >= 0, { title: 'non-negative age' })
	)
) {}

// Extending
class Admin extends User.extend<Admin>('Admin')({
	role: Schema.Literal('admin')
}) {}

// Branded
class UserId extends Schema.Class<UserId, { readonly brand: unique symbol }>(
	'UserId'
)({
	id: Schema.String
}) {}

// Recursive
class Category extends Schema.Class<Category>('Category')(
	Schema.Struct({
		name: Schema.String,
		children: Schema.Array(
			Schema.suspend((): Schema.Codec<Category> => Category)
		)
	})
) {}
```

### MakeOptions: `disableChecks`

Class constructors, `make`, `makeEffect`, and `makeOption` accept an optional second argument with `MakeOptions`:

```ts
interface MakeOptions {
	readonly parseOptions?: AST.ParseOptions | undefined;
	readonly disableChecks?: boolean | undefined;
}
```

When `disableChecks: true`, schema checks are skipped during construction. Constructor defaults (`withConstructorDefault`) are **still applied** even when checks are disabled. This was renamed from `disableValidation` in v3.

```ts
import { Effect, Schema } from 'effect';

class User extends Schema.Class<User>('User')({
	name: Schema.String,
	role: Schema.String.pipe(
		Schema.withConstructorDefault(Effect.succeed('viewer'))
	)
}) {}

// Normal construction — validates input
const user1 = new User({ name: 'Alice' });

// Skip checks — trusts the data, but still applies constructor defaults
const user2 = new User({ name: 'Alice' }, { disableChecks: true });

// Also available on make, makeEffect, and makeOption:
const user3 = User.make({ name: 'Alice' }, { disableChecks: true });
const user4 =
	yield* User.makeEffect({ name: 'Alice' }, { disableChecks: true });
const user5 = User.makeOption({ name: 'Alice' }, { disableChecks: true });
```

When a subclass `extend`s a parent, the parent constructor is automatically called with `disableChecks: true` after the child validates, avoiding double-validation.

### TaggedClass (auto `_tag` field)

```ts
class Cat extends Schema.TaggedClass<Cat>()('Cat', {
	lives: Schema.Number
}) {}
// new Cat({ lives: 9 }) → { _tag: "Cat", lives: 9 }
```

## 10. TaggedErrorClass

Renamed FROM `TaggedError` in v3. Pattern is unchanged:

```ts
import { Effect, Schema } from 'effect';

class HttpError extends Schema.TaggedErrorClass<HttpError>()('HttpError', {
	status: Schema.Number,
	message: Schema.String
}) {}

// Usage
const program = Effect.gen(function* () {
	yield* new HttpError({ status: 404, message: 'Not found' });
});

const recovered = program.pipe(
	Effect.catchTag('HttpError', (err) =>
		Effect.succeed(`Caught: ${err.status} ${err.message}`)
	)
);
```

## 11. Other Removed APIs

| v3 API                           | Status  | Replacement                           |
| -------------------------------- | ------- | ------------------------------------- |
| `validate*` (validateSync, etc.) | removed | `Schema.decode*` + `Schema.toType`    |
| `keyof`                          | removed | —                                     |
| non-empty array ensure helper    | not present | `Schema.NonEmptyArray(S)` or `Schema.Array(S).check(Schema.isMinLength(1))` |
| `withDefaults`                   | removed | —                                     |
| `fromKey`                        | removed | —                                     |
| `Data(schema)`                   | removed | Not needed (deep equality is default) |

## 12. Quick Decision Guide

**"I need to..."**

| Task                       | v4 Pattern                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| Validate a primitive       | `Schema.String.check(Schema.isMinLength(1))`                                                             |
| Transform between types    | `from.pipe(Schema.decodeTo(to, SchemaTransformation.transform({...})))`                                  |
| Make fields optional       | `struct.mapFields(Struct.map(Schema.optionalKey))`                                                       |
| Pick/omit fields           | `struct.mapFields(Struct.pick(["a"]))`                                                                   |
| Extend a struct            | `struct.mapFields(Struct.assign({ newField: Schema.X }))`                                                |
| Parse JSON string          | `Schema.UnknownFromJsonString` or `Schema.fromJsonString(schema)`                                        |
| Add default value          | `Schema.withDecodingDefault(Effect.succeed(encoded))` or `Schema.withDecodingDefaultType(Effect.succeed(type))` |
| Create tagged error        | `class E extends Schema.TaggedErrorClass<E>()("E", { ... }) {}`                                          |
| Rename fields              | `struct.pipe(Schema.encodeKeys({ oldName: "newName" }))`                                                 |
| Discriminated union        | `Schema.Union([TaggedClassA, TaggedClassB])`                                                             |
| Decode unknown safely      | `Schema.decodeUnknownSync(schema)(input)` (sync) or `Schema.decodeUnknownEffect(schema)(input)` (Effect) |
| Get Exit instead of Either | `Schema.decodeUnknownExit(schema)(input)`                                                                |
