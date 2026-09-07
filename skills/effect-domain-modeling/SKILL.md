---
name: effect-domain-modeling
description: Build schema-first Effect domain models with Schema.Class variants, tagged unions, branded values, legal state transitions, predicates, equivalence, and orders. Use when modeling domain entities, value objects, or discriminated unions.
---

# Effect Domain Modeling

Model the data representation the domain needs, parse into it at the boundary,
and preserve those guarantees in every transition. Prefer `Schema.Class` for
decoded shapes and union members. Load `effect-schema-v4` and
`effect-schema-composition` alongside this skill; use `effect-domain-predicates`
and `effect-typeclass-design` for reusable predicate/order APIs.

## Source Reference

Baseline: **Effect 4.0.0-rc.112**. In the Effect source reference, consult
`packages/effect/SCHEMA.md` and `packages/effect/src/{Schema,Match,DateTime,Order}.ts`.
Verify the installed version and source tag before applying newer APIs.

## Constructors Are Not Decoders

| Input / purpose | API | Failure |
| --- | --- | --- |
| Already typed constructor fields | `new Pending(fields)` / `Pending.make(fields)` | synchronous validation may throw |
| Effectful constructor validation/defaults | `Pending.makeEffect(fields)` | `SchemaIssue.Issue` |
| Unknown boundary data | `Schema.decodeUnknownEffect(Pending)(input)` | `Schema.SchemaError` |
| Typed encoded data | `Schema.decodeEffect(Pending)(encoded)` | `Schema.SchemaError` |
| Explicit synchronous boundary | `Schema.decodeUnknownSync(Pending)(input)` | throws `Schema.SchemaError` |

`Schema.tag` supplies a **constructor** default. A decoder does not synthesize
missing wire tags merely because the schema is tagged. `decodeSync` takes the
encoded type; it is not a replacement for `.make` or `new`. Add decoding defaults
only when the wire contract explicitly allows omission. Do not copy constructor
fields to a decoder and assume they have the same shape.

`Schema.Schema<T>` describes the decoded view. Use `Schema.Codec<T, E, RD, RE>`
when encoded values or service requirements matter; do not erase them with `any`.

## Complete Model: Task Lifecycle

This module demonstrates brands, class variants, exhaustive/partial matching,
schema guards, equivalence, orders, dual helpers, and legal transitions.

<!-- typecheck -->
```typescript
import { Effect } from 'effect';
import * as Arr from 'effect/Array';
import * as DateTime from 'effect/DateTime';
import { dual } from 'effect/Function';
import * as Order from 'effect/Order';
import * as Schema from 'effect/Schema';

/** Stable task identity, distinct from unrelated string identifiers. */
export const TaskId = Schema.NonEmptyString.pipe(Schema.brand('TaskId'));
export type TaskId = typeof TaskId.Type;

/** A task that can be started. */
export class Pending extends Schema.Class<Pending>('Pending')({
	kind: Schema.tag('pending'),
	id: TaskId,
	title: Schema.NonEmptyString,
	createdAt: Schema.DateTimeUtc
}) {}

/** A task with a recorded start time that can be completed. */
export class Active extends Schema.Class<Active>('Active')({
	kind: Schema.tag('active'),
	id: TaskId,
	title: Schema.NonEmptyString,
	createdAt: Schema.DateTimeUtc,
	startedAt: Schema.DateTimeUtc
}) {}

/** A terminal task retaining its start and completion times. */
export class Completed extends Schema.Class<Completed>('Completed')({
	kind: Schema.tag('completed'),
	id: TaskId,
	title: Schema.NonEmptyString,
	createdAt: Schema.DateTimeUtc,
	startedAt: Schema.DateTimeUtc,
	completedAt: Schema.DateTimeUtc
}) {}

/** Every supported lifecycle variant, discriminated by kind. */
export const Task = Schema.Union([Pending, Active, Completed]).pipe(
	Schema.toTaggedUnion('kind')
);
export type Task = typeof Task.Type;

/** Check the decoded model, not an unparsed JSON representation. */
export const isTask = Schema.is(Task);
/** Narrow a decoded task to the active variant. */
export const isActive = Task.guards.active;
/** Exhaustive matching with both data-first and data-last forms. */
export const match = Task.match;
/** Full domain-value equivalence, derived from the schema. */
export const equivalence = Schema.toEquivalence(Task);
const idEquivalence = Schema.toEquivalence(TaskId);
/** Identity comparison when full value equivalence is not intended. */
export const sameId = (left: Task, right: Task) => idEquivalence(left.id, right.id);

const phaseRank = Task.match({
	pending: () => 0,
	active: () => 1,
	completed: () => 2
});
/** Lifecycle order, then creation time. */
export const order = Order.combine(
	Order.mapInput(Order.Number, phaseRank),
	Order.mapInput(DateTime.Order, (task: Task) => task.createdAt)
);

/** Start only a pending task, retaining identity and creation time. */
export const start: {
	(at: DateTime.Utc): (self: Pending) => Active;
	(self: Pending, at: DateTime.Utc): Active;
} = dual(2, (self: Pending, at: DateTime.Utc) => new Active({
	id: self.id, title: self.title, createdAt: self.createdAt, startedAt: at
}));

/** Complete only an active task; do not mutate a discriminator in place. */
export const complete: {
	(at: DateTime.Utc): (self: Active) => Completed;
	(self: Active, at: DateTime.Utc): Completed;
} = dual(2, (self: Active, at: DateTime.Utc) => new Completed({
	id: self.id, title: self.title, createdAt: self.createdAt,
	startedAt: self.startedAt, completedAt: at
}));

/** Acquire runtime time at the effectful edge of a pure transition. */
export const startNow = Effect.fn('Task.startNow')(function* (self: Pending) {
	return start(self, yield* DateTime.now);
});

/** JSON boundary, including JSON codecs for DateTime fields. */
export const decodeTaskJson = Schema.decodeUnknownEffect(
	Schema.fromJsonString(Schema.toCodecJson(Task))
);

const summarize = Task.matchOrElse(
	{ completed: (task) => `Completed: ${task.title}` },
	(task) => `Waiting on ${task.kind}` // Pending | Active for toTaggedUnion
);
const sorted = Arr.sort([], order);
```

Transitions above encode lifecycle prerequisites, not a timestamp ordering law.
If the domain requires `completedAt >= startedAt >= createdAt`, express that as
a reusable schema check or a typed transition failure, with a meaningful decode
message. Never claim the invariant is enforced solely because fields use
`DateTime.Utc`.

## Tagged Union Choices and Partial Matching

- Class variants plus `Schema.Union([...]).pipe(Schema.toTaggedUnion('kind'))`
  support arbitrary discriminator keys and preserve class identity.
- `Schema.TaggedUnion({ Created: {...}, Deleted: {...} })` builds canonical
  `_tag` object variants with `cases`, `guards`, `isAnyOf`, `match`, and
  `matchOrElse`. Use it when plain internal object variants are intentional.
- `Data.TaggedEnum` is useful for trusted, non-schema types. It does not decode
  unknown input; do not duplicate a schema model with a parallel Data union.
- Use `.match` for exhaustiveness. Use rc.112 `.matchOrElse(cases, fallback)` or
  `.matchOrElse(value, cases, fallback)` when one fallback truthfully handles all
  other cases. The fallback from `toTaggedUnion` is narrowed to unmatched
  variants; direct `Schema.TaggedUnion.matchOrElse` types it as the full union.
- TypeScript does narrow literal discriminator checks. The preference for schema
  matching is about exhaustiveness and reuse, not a compiler limitation.

## Guards, Optionality, and Defaults

`Schema.is` checks the decoded side and does not perform transformations. Decode
wire data first. Use `Schema.OptionFromOptionalKey`, `OptionFromNullOr`, or
`OptionFromNullishOr` to preserve absence as `Option`.

<!-- typecheck -->
```typescript
import { Effect } from 'effect';
import * as Schema from 'effect/Schema';

class Profile extends Schema.Class<Profile>('Profile')({
	name: Schema.NonEmptyString,
	bio: Schema.OptionFromOptionalKey(Schema.String),
	enabled: Schema.Boolean.pipe(
		Schema.withDecodingDefault(Effect.succeed(true)),
		Schema.withConstructorDefault(Effect.succeed(true))
	)
}) {}

const decodeProfile = Schema.decodeUnknownEffect(Profile);
```

Prefer built-in checks and brands over a separate validator returning `void`.
Reusable checks carry `identifier`, `title`, and `description`; annotate the
schema itself when it improves public documentation or errors. Do not add a
`Schema` suffix to schema values; export matching type aliases for non-classes.

## Recursive Models

Give the suspended schema an explicit codec return type to break inference
recursion. Keep decoded and encoded recursion distinct for transforming fields.

<!-- typecheck -->
```typescript
import * as Schema from 'effect/Schema';

interface CategoryEncoded {
	readonly name: string;
	readonly children: ReadonlyArray<CategoryEncoded>;
}

class Category extends Schema.Class<Category>('Category')({
	name: Schema.NonEmptyString,
	children: Schema.Array(Schema.suspend((): Schema.Codec<Category, CategoryEncoded> => Category))
}) {}

const root = new Category({ name: 'Electronics', children: [] });
const decodeCategory = Schema.decodeUnknownEffect(Category);
```

Do not declare both a recursive interface and a duplicate type alias with the
same name. For complex recursion, use an explicit encoded interface where needed;
see `effect-schema-composition` for transformation and recursion details.

## Public API Design

- Export the model, its boundary decoder, useful guards, and meaningful domain
  operations. Avoid boilerplate exports that add no domain vocabulary.
- Use `Schema.toEquivalence` for model comparisons. `Eq.equals` provides general
  structural equality in v4, but schema equivalence expresses model intent.
- Compose `Order.mapInput` / `Order.combine` and sort with `Arr.sort`. Finite
  `Arr.groupBy` / `Iterable.groupBy` keys remain finite in rc.112, with optional
  properties: a particular group may not exist. Handle that absence explicitly.
- Use `DateTime` for instants, `Duration` for intervals, and `DateTime.now` for
  effectful current time. Deterministic fixtures may use `DateTime.makeUnsafe`
  with a known-valid constant; do not hide a live clock in pure constructors.
- Reconstruct the appropriate class on immutable updates; object spreading
  loses the prototype. Never turn a Pending into Active by changing only its tag.
- Export `zero`, `empty`, getters, or typeclass instances only when their laws
  are meaningful for that model. Preserve project namespace and JSDoc conventions.
- Reusable data-transforming combinators should support data-first and data-last
  calls with `dual`. Effect-returning operations use `Effect.fn`.

## Completion Checklist

- Boundary decoding yields refined values; no unchecked assertions or `any`.
- Schema variants and transitions make illegal lifecycle states unrepresentable.
- Constructor defaults are not confused with wire decoding defaults.
- Matching is exhaustive or has a truthful fallback; absence is represented.
- Equality, order, and temporal semantics are intentional.
- Public exports have JSDoc; runnable examples compile against the target version.
- Run the consuming project's required checks and tests.
