---
name: effect-schema-composition
description: Master Effect Schema composition patterns including Schema.decodeTo, transformations, filters, and validation. Use this skill when working with complex schema compositions, multi-step transformations, or when you need to validate and transform data through multiple stages.
---

# Schema Composition Skill

Expert guidance for composing, transforming, and validating data with Effect Schema (v4).

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Full Schema API: `packages/effect/SCHEMA.md`
- Schema source: `packages/effect/src/Schema.ts`
- SchemaTransformation source: `packages/effect/src/SchemaTransformation.ts`
- Migration guide: `MIGRATION.md`
- Effect source: `packages/effect/src/`

## Core Concepts

### The Schema Type

Every schema in Effect has the type signature `Schema<Type, Encoded, Context>` where:

- **Type**: The validated, decoded output type (what you get after successful decoding)
- **Encoded**: The raw input type (what you provide for decoding)
- **Context**: External dependencies required for encoding/decoding (often `never`)

**Example:**

```typescript
import { Schema } from 'effect';

// Schema<number, string, never>
//        ^Type  ^Encoded ^Context
const NumberFromString = Schema.NumberFromString;
```

### Decoding vs Encoding

- **Decoding**: Transform `Encoded` → `Type` (e.g., string "123" → number 123)
- **Encoding**: Transform `Type` → `Encoded` (e.g., number 123 → string "123")

Effect Schema follows "parse, don't validate" — schemas transform data into the desired format, not just check validity.

## Schema.decodeTo — Chaining Transformations

Use `Schema.decodeTo` to chain schemas with **different types** at each stage. It connects the output type of one schema to the input type of another. This replaces the v3 `Schema.compose`.

**When to Use:**

- Multi-step transformations where each stage changes the type
- Connecting parsing and validation steps
- Building pipelines from `Encoded → Intermediate → Type`

**Example — Schema composition (no transformation):**

```typescript
import { Schema, SchemaTransformation } from 'effect';

// Convert meters → kilometers → miles via schema composition
const KilometersFromMeters = Schema.Finite.pipe(
	Schema.decode(
		SchemaTransformation.transform({
			decode: (meters) => meters / 1000,
			encode: (kilometers) => kilometers * 1000
		})
	)
);

const MilesFromKilometers = Schema.Finite.pipe(
	Schema.decode(
		SchemaTransformation.transform({
			decode: (kilometers) => kilometers * 0.621371,
			encode: (miles) => miles / 0.621371
		})
	)
);

// Compose the two schemas — no explicit transformation needed
const MilesFromMeters = KilometersFromMeters.pipe(
	Schema.decodeTo(MilesFromKilometers)
);
```

**Example — Boolean from String via Literal:**

```typescript
import { Schema, SchemaTransformation } from 'effect';

const BooleanFromString = Schema.Literals(['on', 'off']).pipe(
	Schema.decodeTo(
		Schema.Boolean,
		SchemaTransformation.transform({
			decode: (literal) => literal === 'on',
			encode: (bool) => (bool ? 'on' : 'off')
		})
	)
);
```

### Schema.pipe with .check() — Sequential Refinements

Use `.check()` to apply **filters and refinements** to the same type. It doesn't change the type, just adds validation constraints.

**When to Use:**

- Adding validation rules to an existing schema
- Chaining multiple filters on the same type
- Refining without transformation

**Example — Number Validation:**

```typescript
import { Schema } from 'effect';

const PositiveInt = Schema.Number.check(
	Schema.isInt(),
	Schema.isGreaterThan(0)
);

// Type: Schema<number, number, never>
// Both Type and Encoded are `number`
```

**Example — String Validation:**

```typescript
import { Schema } from 'effect';

const ValidEmail = Schema.String.check(
	Schema.isTrimmed(),
	Schema.isLowercased(),
	Schema.isMinLength(5),
	Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
);
```

### Key Differences

| Aspect          | Schema.decodeTo            | .check()                   |
| --------------- | -------------------------- | -------------------------- |
| **Purpose**     | Chain transformations      | Apply refinements          |
| **Type Change** | Changes type at each stage | Type stays the same        |
| **Example**     | `string → number`          | `number → positive number` |
| **Use Case**    | Multi-step parsing         | Validation constraints     |

## Built-in Filters (Checks)

Filters add validation constraints without changing the schema's type. Apply them with `.check()`.

### String Filters

```typescript
import { Schema } from 'effect';

// Length constraints
Schema.String.check(Schema.isMaxLength(5));
Schema.String.check(Schema.isMinLength(5));
Schema.String.check(Schema.isNonEmpty()); // non-empty string
Schema.String.check(Schema.isLengthBetween(2, 4));

// Pattern matching
Schema.String.check(Schema.isPattern(/^[a-z]+$/));
Schema.String.check(Schema.isStartsWith('prefix'));
Schema.String.check(Schema.isEndsWith('suffix'));
Schema.String.check(Schema.isIncludes('substring'));

// Case and whitespace validation
Schema.String.check(Schema.isTrimmed()); // No leading/trailing whitespace
Schema.String.check(Schema.isLowercased()); // All lowercase
Schema.String.check(Schema.isUppercased()); // All uppercase
Schema.String.check(Schema.isCapitalized()); // First letter capitalized

// String formats
Schema.String.check(Schema.isUUID());
Schema.String.check(Schema.isULID());
Schema.String.check(Schema.isBase64());
Schema.String.check(Schema.isBase64Url());
```

### Number Filters

```typescript
import { Schema } from 'effect';

// Range constraints
Schema.Number.check(Schema.isGreaterThan(5));
Schema.Number.check(Schema.isGreaterThanOrEqualTo(5));
Schema.Number.check(Schema.isLessThan(5));
Schema.Number.check(Schema.isLessThanOrEqualTo(5));
Schema.Number.check(Schema.isBetween({ minimum: -2, maximum: 2 }));

// Type constraints
Schema.Number.check(Schema.isInt()); // integer
Schema.Number.check(Schema.isInt32()); // 32-bit integer
Schema.Number.check(Schema.isFinite()); // not Infinity/NaN
Schema.Number.check(Schema.isMultipleOf(5));

// Sign constraints (use comparison filters)
Schema.Number.check(Schema.isGreaterThan(0)); // positive (> 0)
Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)); // non-negative (>= 0)
Schema.Number.check(Schema.isLessThan(0)); // negative (< 0)
Schema.Number.check(Schema.isLessThanOrEqualTo(0)); // non-positive (<= 0)
```

### Array Filters

```typescript
import { Schema } from 'effect';

Schema.Array(Schema.Number).check(Schema.isMinLength(2));
Schema.Array(Schema.Number).check(Schema.isMaxLength(5));
Schema.Array(Schema.Number).check(Schema.isLengthBetween(2, 5));
```

### Combining Multiple Filters

Pass multiple filters to a single `.check()` call:

```typescript
import { Schema } from 'effect';

const schema = Schema.String.check(Schema.isMinLength(3), Schema.isTrimmed());
```

With `{ errors: "all" }`, all filters are evaluated and multiple issues can be reported at once.

## Custom Filters

Define custom validation logic using `Schema.makeFilter()`:

```typescript
import { Schema } from 'effect';

const LongString = Schema.String.check(
	Schema.makeFilter(
		(s) => s.length >= 10 || 'a string at least 10 characters long'
	)
);
```

### Filter Return Types

The filter predicate can return:

| Return Type                            | Meaning                                      |
| -------------------------------------- | -------------------------------------------- |
| `true` or `undefined`                  | Validation passes                            |
| `false`                                | Validation fails (no error message)          |
| `string`                               | Validation fails with error message          |
| `SchemaIssue.Issue`                    | Validation fails with a structured issue     |
| `{ path, issue }`                      | Validation fails at a nested path            |
| `ReadonlyArray<Schema.FilterIssue>`    | Reports multiple filter issues together      |

### Filter Annotations

Add metadata to filters for better error messages:

```typescript
import { Schema } from 'effect';

const LongString = Schema.String.check(
	Schema.makeFilter(
		(s) => s.length >= 10 || 'a string at least 10 characters long',
		{
			title: 'LongString',
			description: 'A string with at least 10 characters'
		}
	)
);
```

### Filter Groups

Group filters into a reusable unit with `Schema.makeFilterGroup`:

```typescript
import { Schema } from 'effect';

const isInt32 = Schema.makeFilterGroup(
	[
		Schema.isInt(),
		Schema.isBetween({ minimum: -2147483648, maximum: 2147483647 })
	],
	{
		title: 'isInt32',
		description: 'a 32-bit integer'
	}
);

Schema.Number.check(isInt32);
```

### Error Paths for Form Validation

Associate errors with specific fields using `path` in `makeFilter`:

```typescript
import { Schema } from 'effect';

const Password = Schema.Trimmed.check(Schema.isMinLength(2));

const MyForm = Schema.Struct({
	password: Password,
	confirm_password: Password
}).check(
	Schema.makeFilter((input) => {
		if (input.password !== input.confirm_password) {
			return {
				path: ['confirm_password'],
				issue: 'Passwords do not match'
			};
		}
	})
);
```

### Effectful Filters

Use `SchemaGetter.checkEffect` for async validation inside a `Schema.decode` transformation:

```typescript
import {
	Effect,
	Option,
	Result,
	Schema,
	SchemaGetter,
	SchemaIssue
} from 'effect';

async function validateUsername(username: string) {
	return Promise.resolve(username === 'gcanti');
}

const ValidUsername = Schema.String.pipe(
	Schema.decode({
		decode: SchemaGetter.checkEffect((username) =>
			Effect.promise(() =>
				validateUsername(username).then((valid) =>
					valid
						? undefined
						: new SchemaIssue.InvalidValue(Option.some(username), {
								title: 'Invalid username'
							})
				)
			)
		),
		encode: SchemaGetter.passthrough()
	})
);
```

## Built-in Transformations

Transformations are first-class reusable objects in v4. Apply them with `Schema.decode` (same source/target type) or `Schema.decodeTo` (different types).

### String Transformations

```typescript
import { Schema, SchemaTransformation } from 'effect';

// Whitespace and case transformations (applied with Schema.decode)
Schema.String.pipe(Schema.decode(SchemaTransformation.trim()));
Schema.String.pipe(Schema.decode(SchemaTransformation.toLowerCase()));
Schema.String.pipe(Schema.decode(SchemaTransformation.toUpperCase()));

// Capitalize / Uncapitalize require decodeTo with a checked target
Schema.String.pipe(
	Schema.decodeTo(
		Schema.String.check(Schema.isCapitalized()),
		SchemaTransformation.capitalize()
	)
);
Schema.String.pipe(
	Schema.decodeTo(
		Schema.String.check(Schema.isLowercased()),
		SchemaTransformation.toLowerCase()
	)
);

// Pre-built transformation schemas
Schema.Trimmed; // Schema<string, string> — trimmed string
Schema.NonEmptyString; // Schema<string, string> — non-empty
```

### Number Transformations

```typescript
import { Schema, SchemaTransformation } from 'effect';

// Parse numbers from strings (built-in)
Schema.NumberFromString; // "123" → 123
Schema.FiniteFromString; // "123" → 123 (finite only)

// Custom inline
Schema.Finite.pipe(
	Schema.decode(
		SchemaTransformation.transform({
			decode: (meters) => meters / 1000,
			encode: (km) => km * 1000
		})
	)
);
```

### Duration Transformations

```typescript
import { Schema, SchemaTransformation } from 'effect';

// Built-in duration parsing, including "Infinity" and "-Infinity"
Schema.DurationFromString; // "1 second" → Duration.Duration

const DurationFromString = Schema.String.pipe(
	Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromString)
);
```

### Split (manual implementation)

`Schema.split` was removed in v4. Implement it manually:

```typescript
import { Schema, SchemaTransformation } from 'effect';

function split(separator: string) {
	return Schema.String.pipe(
		Schema.decodeTo(
			Schema.Array(Schema.String),
			SchemaTransformation.transform({
				decode: (s) => s.split(separator) as ReadonlyArray<string>,
				encode: (as) => as.join(separator)
			})
		)
	);
}
```

## Custom Transformations

### SchemaTransformation.transform — Simple Transformations

Use `SchemaTransformation.transform` when the transformation always succeeds:

```typescript
import { Schema, SchemaTransformation } from 'effect';

const BooleanFromString = Schema.Literals(['on', 'off']).pipe(
	Schema.decodeTo(
		Schema.Boolean,
		SchemaTransformation.transform({
			decode: (literal) => literal === 'on',
			encode: (bool) => (bool ? 'on' : 'off')
		})
	)
);
```

### SchemaTransformation.transformOrFail — Transformations That Can Fail

Use `SchemaTransformation.transformOrFail` when transformation might fail:

```typescript
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

### SchemaTransformation.transformOptional — Optional Key Transforms

Use `SchemaTransformation.transformOptional` for optional key transformations:

```typescript
import { Option, Schema, SchemaTransformation } from 'effect';

const OptionFromNonEmptyString = Schema.optionalKey(Schema.String).pipe(
	Schema.decodeTo(
		Schema.Option(Schema.NonEmptyString),
		SchemaTransformation.transformOptional({
			decode: (oe) =>
				Option.isSome(oe) && oe.value !== ''
					? Option.some(Option.some(oe.value))
					: Option.some(Option.none()),
			encode: (ot) => Option.flatten(ot)
		})
	)
);
```

## Streamlined Effect Patterns

### Direct flatMap with Schema.decodeUnknownEffect

`Schema.decodeUnknownEffect(schema)` returns a function that can be passed directly to `Effect.flatMap`:

```typescript
import { Effect, Schema } from 'effect';

declare const self: Effect.Effect<unknown, unknown, unknown>;
declare const schema: Schema.Schema<unknown, unknown, never>;
declare const toError: (e: unknown) => unknown;

// Streamlined
self.pipe(
	Effect.flatMap(Schema.decodeUnknownEffect(schema)),
	Effect.mapError(toError)
);
```

### Extract Schema Factories

Create reusable schema factories for common patterns:

```typescript
import { Effect, Schema } from 'effect';

declare const toAssertionError: (e: unknown) => Error;

const createGreaterThanSchema = (n: number) =>
	Schema.Number.check(Schema.isGreaterThan(n));

export const beGreaterThan =
	(n: number) =>
	<E, R>(self: Effect.Effect<number, E, R>) =>
		self.pipe(
			Effect.flatMap(
				Schema.decodeUnknownEffect(createGreaterThanSchema(n))
			),
			Effect.mapError(toAssertionError)
		);
```

## Decoding and Encoding

### Decoding APIs

| API                    | Return Type                          | Use Case                        |
| ---------------------- | ------------------------------------ | ------------------------------- |
| `decodeUnknownSync`    | `Type` (throws on error)             | Sync decoding, immediate error  |
| `decodeUnknownOption`  | `Option<Type>`                       | Sync decoding, no error details |
| `decodeUnknownExit`    | `Exit<Type, SchemaError>`            | Sync decoding, error handling   |
| `decodeUnknownPromise` | `Promise<Type>`                      | Async decoding                  |
| `decodeUnknownEffect`  | `Effect<Type, SchemaError, Context>` | Full Effect-based decoding      |

**Example:**

```typescript
import { Schema } from 'effect';

const Person = Schema.Struct({
	name: Schema.String,
	age: Schema.Number
});

// Sync with error throwing
const person1 = Schema.decodeUnknownSync(Person)({ name: 'Alice', age: 30 });

// Sync with Exit
const result = Schema.decodeUnknownExit(Person)({ name: 'Alice', age: 30 });

// Effect-based (required for async schemas)
const asyncResult = Schema.decodeUnknownEffect(Person)({
	name: 'Alice',
	age: 30
});
```

### Encoding APIs

| API                 | Return Type                             | Use Case                        |
| ------------------- | --------------------------------------- | ------------------------------- |
| `encodeSync`        | `Encoded` (throws on error)             | Sync encoding, immediate error  |
| `encodeOption`      | `Option<Encoded>`                       | Sync encoding, no error details |
| `encodeUnknownExit` | `Exit<Encoded, SchemaError>`            | Sync encoding, error handling   |
| `encodePromise`     | `Promise<Encoded>`                      | Async encoding                  |
| `encodeEffect`      | `Effect<Encoded, SchemaError, Context>` | Full Effect-based encoding      |

## Struct and Object Schemas

### Basic Struct

```typescript
import { Schema } from 'effect';

const Person = Schema.Struct({
	name: Schema.String,
	age: Schema.Number
});

// Type: { readonly name: string; readonly age: number }
```

### Optional Fields

```typescript
import { Schema } from 'effect';

const User = Schema.Struct({
	username: Schema.String,
	email: Schema.optional(Schema.String), // key?: string | undefined
	bio: Schema.optionalKey(Schema.String) // key?: string (exact)
});
```

### Nullable Fields

```typescript
import { Schema } from 'effect';

const Data = Schema.Struct({
	value: Schema.NullOr(Schema.String)
});

// Type: { readonly value: string | null }
```

### Partial and Required (via mapFields)

```typescript
import { Schema, Struct } from 'effect';

const User = Schema.Struct({
	username: Schema.String,
	email: Schema.optional(Schema.String)
});

// Make all fields optional (allows undefined)
const PartialUser = User.mapFields(Struct.map(Schema.optional));

// Make all fields optional (exact — key can be absent)
const ExactPartialUser = User.mapFields(Struct.map(Schema.optionalKey));

// Make all fields required
const RequiredUser = PartialUser.mapFields(Struct.map(Schema.requiredKey));
```

### Picking and Omitting (via mapFields)

```typescript
import { Schema, Struct } from 'effect';

const Recipe = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	ingredients: Schema.Array(Schema.String)
});

const JustTheName = Recipe.mapFields(Struct.pick(['name']));
const NoIDRecipe = Recipe.mapFields(Struct.omit(['id']));
```

### Extending Structs (via mapFields or fieldsAssign)

```typescript
import { Schema, Struct } from 'effect';

const Dog = Schema.Struct({
	name: Schema.String,
	age: Schema.Number
});

// Method 1: Using mapFields + Struct.assign
const DogWithBreed = Dog.mapFields(Struct.assign({ breed: Schema.String }));

// Method 2: Using fieldsAssign (more succinct)
const DogWithBreed2 = Dog.pipe(Schema.fieldsAssign({ breed: Schema.String }));

// Method 3: Spreading fields (still works)
const DogWithBreed3 = Schema.Struct({
	...Dog.fields,
	breed: Schema.String
});
```

## Advanced Composition Patterns

### Combining Arrays and Transformations

```typescript
import { Schema, SchemaTransformation } from 'effect';

const ReadonlySetFromArray = <A, I, R>(
	itemSchema: Schema.Schema<A, I, R>
): Schema.Schema<ReadonlySet<A>, ReadonlyArray<I>, R> =>
	Schema.Array(itemSchema).pipe(
		Schema.decodeTo(
			Schema.ReadonlySet(Schema.toType(itemSchema)),
			SchemaTransformation.transform({
				decode: (items) => new Set(items),
				encode: (set) => Array.from(set.values())
			})
		)
	);

const schema = ReadonlySetFromArray(Schema.String);
// Schema<ReadonlySet<string>, readonly string[], never>
```

### Multi-Stage Transformations

```typescript
import { Schema, SchemaTransformation } from 'effect';

const CentsFromDollars = Schema.Number.pipe(
	Schema.decodeTo(
		Schema.Number,
		SchemaTransformation.transform({
			decode: (dollars) => dollars * 100,
			encode: (cents) => cents / 100
		})
	)
);
```

### Optional Field Transformations

v4 replaces `optionalToRequired`, `optionalToOptional`, and `requiredToOptional` with `Schema.decodeTo` + `SchemaGetter.transformOptional`:

```typescript
import { Option, Predicate, Schema, SchemaGetter } from 'effect';

// optionalKey → required with default (null for missing)
const schema = Schema.Struct({
	a: Schema.optionalKey(Schema.String).pipe(
		Schema.decodeTo(Schema.NullOr(Schema.String), {
			decode: SchemaGetter.transformOptional(
				Option.orElseSome(() => null)
			),
			encode: SchemaGetter.transformOptional(
				Option.filter((value) => value !== null)
			)
		})
	)
});
```

### Decoding Defaults

`Schema.withDecodingDefaultKey` / `Schema.withDecodingDefault` take defaults on the **Encoded** side. For `Schema.FiniteFromString`, that means a string default such as `'1'`.

`Schema.withDecodingDefaultTypeKey` / `Schema.withDecodingDefaultType` take defaults on the decoded **Type** side, such as `1`. Default effects may require services and may fail with `Schema.SchemaError`.

```typescript
import { Effect, Schema } from 'effect';

const schema = Schema.Struct({
	encodedDefault: Schema.FiniteFromString.pipe(
		Schema.withDecodingDefault(Effect.succeed('1'))
	),
	typeDefault: Schema.FiniteFromString.pipe(
		Schema.withDecodingDefaultType(Effect.succeed(1))
	),
	typeKeyDefault: Schema.FiniteFromString.pipe(
		Schema.withDecodingDefaultTypeKey(Effect.succeed(10))
	)
});

Schema.decodeUnknownSync(schema)({});
// { encodedDefault: 1, typeDefault: 1, typeKeyDefault: 10 }
Schema.decodeUnknownSync(schema)({ encodedDefault: '2' });
// { encodedDefault: 2, typeDefault: 1, typeKeyDefault: 10 }
```

## Common Patterns

### Email Validation

```typescript
import { Schema } from 'effect';

const Email = Schema.String.check(
	Schema.isLowercased(),
	Schema.isTrimmed(),
	Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
);
```

### UUID Validation

```typescript
import { Schema } from 'effect';

const UserId = Schema.String.check(Schema.isUUID()).pipe(
	Schema.brand('UserId')
);
```

### Clamping Numbers

```typescript
import { Schema } from 'effect';

const Percentage = Schema.Number.check(
	Schema.isBetween({ minimum: 0, maximum: 100 })
).pipe(Schema.brand('Percentage'));
```

### Template Literal Parsing

```typescript
import { Schema } from 'effect';

// Parse Bearer tokens
const authTemplate = Schema.TemplateLiteral([
	'Bearer ',
	Schema.String.pipe(Schema.brand('Token'))
]);

const AuthToken = Schema.TemplateLiteralParser(authTemplate.parts);
// Decodes: "Bearer abc123" → ["Bearer ", "abc123"]
```

### Branded Types

```typescript
import { Schema } from 'effect';

const PositiveInt = Schema.Number.check(
	Schema.isInt(),
	Schema.isGreaterThan(0)
).pipe(Schema.brand('PositiveInt'));

// Type: number & Brand<"PositiveInt">
```

### Form Validation

```typescript
import { Schema } from 'effect';

const LoginForm = Schema.Struct({
	email: Schema.String.check(
		Schema.isLowercased(),
		Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
	),
	password: Schema.String.check(
		Schema.isMinLength(8),
		Schema.isPattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
	)
});
```

### API Response Parsing

```typescript
import { Schema } from 'effect';

const User = Schema.Struct({
	id: Schema.NumberFromString,
	name: Schema.String,
	email: Schema.String,
	createdAt: Schema.DateTimeUtcFromString
});

const UsersResponse = Schema.Struct({
	users: Schema.Array(User),
	total: Schema.Number
});
```

## Quality Checklist

When creating schemas, ensure:

- [ ] Use `Schema.decodeTo` for type transformations, `.check()` for refinements
- [ ] Apply filters with `.check(Schema.isXxx())` — not the old `.pipe(Schema.xxx())` pattern
- [ ] Use `SchemaTransformation.transform` for custom transformations as first-class objects
- [ ] Extract reusable schemas as constants or factory functions
- [ ] Use `Schema.decodeUnknownEffect` directly in `Effect.flatMap` (no wrapper lambda)
- [ ] Place error mapping outside `flatMap` for cleaner composition
- [ ] Add annotations (`title`, `description`) to custom filters via `Schema.makeFilter`
- [ ] Use `Schema.toType` when composing to avoid double decoding
- [ ] Handle async operations with `Schema.decodeUnknownEffect`, not sync alternatives
- [ ] Return detailed error paths for form validation
- [ ] Use branded types for domain-specific values
- [ ] Use `schema.mapFields(Struct.pick(...))` instead of `schema.pick(...)`
- [ ] Use `schema.mapFields(Struct.omit(...))` instead of `schema.omit(...)`
- [ ] Use `schema.annotate({...})` instead of `schema.annotations({...})`
- [ ] Use `Schema.revealCodec(schema)` instead of `Schema.asSchema(schema)`

## Key Principles

1. **Composition over custom logic** — Leverage `Schema.decodeTo` and `.check()` instead of manual validation
2. **Transformations are first-class** — Define with `SchemaTransformation.transform` and reuse across schemas
3. **Reusability** — Extract schemas as constants or factory functions
4. **Type safety** — Let Schema handle type inference and refinement
5. **Streamlined Effect chains** — Minimize lambda wrappers, use direct function passing
6. **Built-in filters first** — Use Effect's built-in `Schema.isXxx()` filters before creating custom ones
7. **Parse, don't validate** — Transform data into the desired format, not just check it
8. **Fail fast, fail clearly** — Provide detailed error messages with paths and context

## References

- Effect Schema is imported from `effect/Schema` or `{ Schema } from "effect"`
- `SchemaTransformation` is imported from `effect/SchemaTransformation` or `{ SchemaTransformation } from "effect"`
- `SchemaGetter` is imported from `effect/SchemaGetter` or `{ SchemaGetter } from "effect"`
- `SchemaIssue` is imported from `effect/SchemaIssue` or `{ SchemaIssue } from "effect"`
- `Struct` is imported from `{ Struct } from "effect"` for `mapFields` operations
- Schema API signature: `Schema<Type, Encoded, Context>`
- All schemas return `readonly` types by default
- Use `Schema.revealCodec(schema)` to view any schema as `Schema<Type, Encoded, Context>`
- Use `Schema.toType(schema)` to get the type-side schema (replaces v3 `Schema.typeSchema`)
- Access struct fields with `.fields` property
- Filters preserve schema type — `.check()` on a `Schema.Struct` returns a `Schema.Struct`
