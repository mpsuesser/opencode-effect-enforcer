---
action: context
tool: (edit|write)
event: after
name: prefer-effect-fn
description: Service methods should use Effect.fn for automatic tracing instead of plain Effect.gen wrappers
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - pattern: ($$$ARGS) => Effect.gen($$$BODY)
        - pattern: '$NAME: ($$$ARGS) => Effect.gen($$$BODY)'
        - all:
              - kind: method_definition
              - has:
                    field: body
                    regex: Effect\.gen
        - all:
              - kind: pair
              - has:
                    pattern: function($$$ARGS) { return Effect.gen($$$BODY) }
    inside:
        any:
            - pattern: Layer.effect($$$)
            - pattern: Layer.scoped($$$)
            - pattern: Layer.succeed($$$)
        stopBy: end
    not:
        inside:
            pattern: Effect.fn($$$)($$$)
            stopBy: end
level: warning
suggestSkills:
    - effect-service-implementation
---

# Prefer `Effect.fn` for Service Methods

```haskell
-- Transformation
Effect.gen :: (() -> Generator) -> Effect      -- no tracing, anonymous
Effect.fn  :: String -> (...args -> Effect)     -- named, auto-traced span
```

```haskell
-- Pattern
bad :: Service method
bad = {
  getUser: (id: UserId) =>
    Effect.gen(function* () {                  -- anonymous, no span
      ...
    })
}

good :: Service method
good = {
  getUser: Effect.fn("UserService.getUser")(
    (id: UserId) =>                            -- named span, auto-traced
      Effect.gen(function* () {
        ...
      })
  )
}
```

`Effect.fn` wraps a function to automatically create a traced span with the given name. Use it for all service method implementations to get observability for free.

## Format

```typescript
const methodName = Effect.fn('ServiceName.methodName')(function* (
	arg1: Type1,
	arg2: Type2
) {
	// implementation using yield*
});
```

Key details:

- **Naming convention**: `"ServiceName.methodName"` — matches the service class and method
- **Generator shorthand**: Pass a generator function directly to `Effect.fn` — no need for an intermediate arrow wrapping `Effect.gen`
- **Wraps the function**: `Effect.fn` takes the entire implementation function as a generator

## Complete Before/After

```typescript
// BEFORE — plain arrow functions, no tracing
export class UserRepository extends Context.Service<UserRepository>()(
	'@services/UserRepository',
	{
		make: Effect.gen(function* () {
			const db = yield* DatabaseClient;

			return {
				findById: (id: string): Effect.Effect<User, UserNotFound> =>
					Effect.gen(function* () {
						const row = yield* db.query(
							'SELECT * FROM users WHERE id = ?',
							id
						);
						if (!row)
							return yield* new UserNotFound({
								id,
								message: `Not found: ${id}`
							});
						return row as User;
					}),

				create: (
					data: CreateUserData
				): Effect.Effect<User, DuplicateUser> =>
					Effect.gen(function* () {
						return yield* db.insert('users', data);
					})
			};
		})
	}
) {}

// AFTER — Effect.fn, every method gets a traced span
export class UserRepository extends Context.Service<UserRepository>()(
	'@services/UserRepository',
	{
		make: Effect.gen(function* () {
			const db = yield* DatabaseClient;

			const findById = Effect.fn('UserRepository.findById')(
				(id: string): Effect.Effect<User, UserNotFound> =>
					Effect.gen(function* () {
						const row = yield* db.query(
							'SELECT * FROM users WHERE id = ?',
							id
						);
						if (!row)
							return yield* new UserNotFound({
								id,
								message: `Not found: ${id}`
							});
						return row as User;
					})
			);

			const create = Effect.fn('UserRepository.create')(
				(data: CreateUserData): Effect.Effect<User, DuplicateUser> =>
					Effect.gen(function* () {
						return yield* db.insert('users', data);
					})
			);

			return { findById, create };
		})
	}
) {}
```

## When NOT to use Effect.fn

- Top-level programs or scripts (not service methods)
- One-off effects that aren't part of a service interface
- Simple succeed/fail expressions that don't benefit from tracing
