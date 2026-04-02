---
name: effect-sql
description: Build type-safe SQL database access with Effect using SqlClient tagged template queries, SqlSchema for validated results, SqlModel for CRUD repositories, SqlResolver for batched request resolution, and Migrator for schema migrations. Use this skill when working with databases, writing queries, defining models, or setting up migrations.
---

You are an Effect TypeScript expert specializing in type-safe SQL database access using the Effect SQL modules.

## Effect Source Reference

The Effect v4 source is available at `.references/effect-v4/` in your project root.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- `packages/effect/src/unstable/sql/` — Core SQL modules (SqlClient, SqlSchema, SqlModel, SqlResolver, Migrator, Statement)
- `packages/effect/src/unstable/schema/Model.ts` — Model class with variant schemas
- `packages/sql/pg/src/PgClient.ts` — PostgreSQL driver example

## Core Imports

All SQL modules live under the `effect/unstable/sql` path:

```ts
import { SqlClient } from 'effect/unstable/sql/SqlClient';
import { SqlSchema } from 'effect/unstable/sql/SqlSchema';
import { SqlModel } from 'effect/unstable/sql/SqlModel';
import { SqlResolver } from 'effect/unstable/sql/SqlResolver';
import { Migrator } from 'effect/unstable/sql/Migrator';
```

For Model schemas (used with SqlModel):

```ts
import { Model } from 'effect/unstable/schema';
```

## SqlClient — Tagged Template Queries

`SqlClient` is a service accessed via `yield* SqlClient`. It doubles as a tagged template literal function for building parameterized queries.

### Basic Queries

```ts
import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

const program = Effect.gen(function* () {
	const sql = yield* SqlClient;

	// SELECT — returns ReadonlyArray<Row>
	const users = yield* sql`SELECT * FROM users`;

	// Parameterized query — values are safely interpolated
	const user = yield* sql`SELECT * FROM users WHERE id = ${userId}`;

	// INSERT with sql.insert helper
	yield* sql`INSERT INTO users ${sql.insert({ name: 'Alice', email: 'alice@example.com' })}`;

	// INSERT multiple rows
	yield* sql`INSERT INTO users ${sql.insert([
		{ name: 'Alice', email: 'alice@example.com' },
		{ name: 'Bob', email: 'bob@example.com' }
	])}`;

	// INSERT with RETURNING
	const [inserted] =
		yield* sql`INSERT INTO users ${sql.insert({ name: 'Alice' }).returning('*')}`;

	// UPDATE with sql.update helper (second arg = columns to omit from SET)
	yield* sql`UPDATE users SET ${sql.update(userData, ['id'])} WHERE id = ${userData.id}`;

	// DELETE
	yield* sql`DELETE FROM users WHERE id = ${userId}`;
});
```

### Statement Properties

Each tagged template expression produces a `Statement<A>` which is also an `Effect<ReadonlyArray<A>, SqlError>`. Statements expose additional accessors:

```ts
const stmt = sql`SELECT * FROM users`;

// Execute as Effect (default) — returns ReadonlyArray<Row>
yield * stmt;

// Stream results row by row (for large result sets)
const stream = stmt.stream; // Stream<Row, SqlError>

// Raw result without row transforms
yield * stmt.withoutTransform;

// Get raw result object
yield * stmt.raw;

// Get rows as arrays of values (no column names)
yield * stmt.values;

// Execute without prepared statement
yield * stmt.unprepared;

// Compile to [sqlString, params] without executing
const [sqlString, params] = stmt.compile();
```

### Identifiers, Literals, and Helpers

```ts
const sql = yield * SqlClient;

// Identifier (table/column name) — properly escaped
sql('users'); // => Identifier
sql`SELECT * FROM ${sql('users')}`;

// Literal SQL (unescaped — use with caution)
sql.literal('NOW()');

// Unsafe raw query
yield * sql.unsafe<User>('SELECT * FROM users WHERE id = $1', [userId]);

// IN clause
sql`SELECT * FROM users WHERE ${sql.in('id', [1, 2, 3])}`;

// AND / OR chains
sql`SELECT * FROM users WHERE ${sql.and([sql`name = ${'Alice'}`, sql`active = ${true}`])}`;

// CSV helper (for ORDER BY, GROUP BY)
sql`SELECT * FROM users ORDER BY ${sql.csv(['name', 'created_at'])}`;
```

### Transactions

```ts
const sql = yield * SqlClient;

// Wrap any effect in a transaction — automatically handles BEGIN/COMMIT/ROLLBACK
yield *
	sql.withTransaction(
		Effect.gen(function* () {
			yield* sql`INSERT INTO orders ${sql.insert(order)}`;
			yield* sql`UPDATE inventory SET quantity = quantity - 1 WHERE id = ${itemId}`;
		})
	);

// Nested calls to withTransaction create SAVEPOINTs automatically
```

### Dialect Branching

```ts
const sql = yield* SqlClient

// Branch on database dialect
const result = sql.onDialectOrElse({
  pg: () => sql`SELECT * FROM users LIMIT 10`,
  mysql: () => sql`SELECT * FROM users LIMIT 10`,
  sqlite: () => sql`SELECT * FROM users LIMIT 10`,
  orElse: () => sql`SELECT TOP 10 * FROM users`
})

// All dialects required (no orElse)
sql.onDialect({
  pg: () => ...,
  mysql: () => ...,
  sqlite: () => ...,
  mssql: () => ...,
  clickhouse: () => ...
})
```

## SqlSchema — Schema-Validated Queries

`SqlSchema` wraps SQL queries with Effect Schema encoding/decoding for type-safe request and result handling.

```ts
import { Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';
import * as SqlSchema from 'effect/unstable/sql/SqlSchema';

const sql = yield * SqlClient;

// findAll — returns Array<Res["Type"]>
const listUsers = SqlSchema.findAll({
	Request: Schema.Void,
	Result: User,
	execute: () => sql`SELECT * FROM users`
});
const users = yield * listUsers(void 0);

// findOne — returns Res["Type"], fails with NoSuchElementError if empty
const getUserById = SqlSchema.findOne({
	Request: Schema.Number,
	Result: User,
	execute: (id) => sql`SELECT * FROM users WHERE id = ${id}`
});
const user = yield * getUserById(42);

// findOneOption — returns Option<Res["Type"]>
const findUser = SqlSchema.findOneOption({
	Request: Schema.String,
	Result: User,
	execute: (email) => sql`SELECT * FROM users WHERE email = ${email}`
});
const maybeUser = yield * findUser('alice@example.com');

// findNonEmpty — returns NonEmptyArray<Res["Type"]>, fails with NoSuchElementError if empty
const getActiveUsers = SqlSchema.findNonEmpty({
	Request: Schema.Void,
	Result: User,
	execute: () => sql`SELECT * FROM users WHERE active = true`
});

// void — executes query, discards result, validates request
const deleteUser = SqlSchema.void({
	Request: Schema.Number,
	execute: (id) => sql`DELETE FROM users WHERE id = ${id}`
});
yield * deleteUser(42);
```

## Model — Schema Variant Classes

The `Model` module provides a schema class system with built-in variants for database operations (`select`, `insert`, `update`) and JSON APIs (`json`, `jsonCreate`, `jsonUpdate`).

```ts
import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';

const UserId = Schema.Number.pipe(Schema.brand('UserId'));

class User extends Model.Class<User>('User')({
	// Generated: present in select/update, absent from insert (DB generates it)
	id: Model.Generated(UserId),

	// Regular field: present in all variants
	name: Schema.String,
	email: Schema.String,

	// Sensitive: present in DB variants, excluded from JSON variants
	passwordHash: Model.Sensitive(Schema.String),

	// Timestamps with auto-generation
	createdAt: Model.DateTimeInsertFromDate, // auto-set on insert
	updatedAt: Model.DateTimeUpdateFromDate, // auto-set on insert and update

	// Optional field (nullable in DB, optional key in JSON)
	bio: Model.FieldOption(Schema.String)
}) {}

// Variant schemas are auto-generated:
User; // select schema — all fields
User.insert; // insert schema — without Generated fields
User.update; // update schema — with Generated fields for WHERE clause
User.json; // JSON API schema — without Sensitive fields
User.jsonCreate;
User.jsonUpdate;
```

### Model Field Helpers

| Helper                         | select   | insert | update | json     | Description                                  |
| ------------------------------ | -------- | ------ | ------ | -------- | -------------------------------------------- |
| `Model.Generated(S)`           | S        | —      | S      | S        | DB-generated column (e.g. auto-increment ID) |
| `Model.GeneratedByApp(S)`      | S        | S      | S      | S        | App-generated, required everywhere           |
| `Model.Sensitive(S)`           | S        | S      | S      | —        | Excluded from JSON variants                  |
| `Model.FieldOption(S)`         | Option   | Option | Option | Option   | Nullable/optional across all variants        |
| `Model.DateTimeInsertFromDate` | DateTime | auto   | —      | DateTime | Timestamp set on insert                      |
| `Model.DateTimeUpdateFromDate` | DateTime | auto   | auto   | DateTime | Timestamp set on insert+update               |
| `Model.Field({...})`           | custom   | custom | custom | custom   | Per-variant field configuration              |

## SqlModel — CRUD Repository

`SqlModel.makeRepository` generates a complete CRUD interface from a Model class.

```ts
import { SqlModel } from 'effect/unstable/sql/SqlModel';

const UserRepo =
	yield *
	SqlModel.makeRepository(User, {
		tableName: 'users',
		spanPrefix: 'UserRepo',
		idColumn: 'id'
	});

// insert — returns the inserted row (decoded via Model schema)
const user =
	yield * UserRepo.insert({ name: 'Alice', email: 'alice@example.com' });

// insertVoid — insert without returning the row
yield * UserRepo.insertVoid({ name: 'Bob', email: 'bob@example.com' });

// update — returns the updated row
const updated = yield * UserRepo.update({ id: userId, name: 'Alice Updated' });

// updateVoid — update without returning the row
yield * UserRepo.updateVoid({ id: userId, name: 'Alice Updated' });

// findById — returns the row, fails with NoSuchElementError if not found
const found = yield * UserRepo.findById(userId);

// delete
yield * UserRepo.delete(userId);
```

### Data Loaders (Batched CRUD)

`SqlModel.makeDataLoaders` creates the same interface but with automatic request batching via `RequestResolver` — ideal for solving N+1 problems.

```ts
const UserLoaders =
	yield *
	SqlModel.makeDataLoaders(User, {
		tableName: 'users',
		spanPrefix: 'UserLoader',
		idColumn: 'id',
		window: '50 millis', // batch window duration
		maxBatchSize: 100 // optional max batch size
	});

// Same API as makeRepository, but requests within the window are batched:
const user = yield * UserLoaders.findById(userId);
yield * UserLoaders.insert({ name: 'Alice', email: 'alice@example.com' });
yield * UserLoaders.delete(userId);
```

## SqlResolver — Request Batching

`SqlResolver` creates `RequestResolver` instances for batching SQL queries. Use these when you need fine-grained control over batching beyond what `SqlModel.makeDataLoaders` provides.

### Ordered Resolver

Results map 1:1 to requests by position. Result count must match request count.

```ts
import * as SqlResolver from 'effect/unstable/sql/SqlResolver';

const insertResolver = SqlResolver.ordered({
	Request: User.insert,
	Result: User,
	execute: (requests) =>
		sql`INSERT INTO users ${sql.insert(requests).returning('*')}`
});

// Use with SqlResolver.request
const insertUser = SqlResolver.request(insertResolver);
const user = yield * insertUser({ name: 'Alice', email: 'alice@example.com' });
```

### FindById Resolver

Batches lookups by ID, matching results back by a key function.

```ts
const findByIdResolver = SqlResolver.findById({
	Id: UserId,
	Result: User,
	ResultId: (user) => user.id,
	execute: (ids) => sql`SELECT * FROM users WHERE ${sql.in('id', ids)}`
});
```

### Grouped Resolver

Returns multiple results per request, grouped by a key.

```ts
const userPostsResolver = SqlResolver.grouped({
	Request: UserId,
	RequestGroupKey: (userId) => userId,
	Result: Post,
	ResultGroupKey: (post) => post.userId,
	execute: (userIds) =>
		sql`SELECT * FROM posts WHERE ${sql.in('user_id', userIds)}`
});

// Returns NonEmptyArray<Post> per userId
const posts = yield * SqlResolver.request(userPostsResolver)(userId);
```

### Void Resolver

For side-effect-only batched operations (deletes, updates without return).

```ts
const deleteResolver = SqlResolver.void({
	Request: UserId,
	execute: (ids) => sql`DELETE FROM users WHERE ${sql.in('id', ids)}`
});
```

### Configuring Resolvers

```ts
import { RequestResolver } from "effect"

const resolver = SqlResolver.ordered({ ... }).pipe(
  RequestResolver.setDelay("50 millis"),  // batch window
  RequestResolver.batchN(100),             // max batch size
  RequestResolver.withSpan("UserRepo.insert")
)
```

## Migrator — Schema Migrations

The `Migrator` module runs sequential, transactional migrations tracked in a `effect_sql_migrations` table.

### Migration File Convention

Files must be named `{id}_{name}.ts` where `id` is a numeric identifier (e.g. `0001_create_users.ts`).

Each migration file exports a default Effect:

```ts
// migrations/0001_create_users.ts
import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
	const sql = yield* SqlClient;
	yield* sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
});
```

### Running Migrations

```ts
import * as Migrator from 'effect/unstable/sql/Migrator';

// Create a migrator (optionally with schema dump support)
const migrate = Migrator.make({
	// Optional: dump schema after migrations
	dumpSchema: (path, table) => Effect.void
});

// Load migrations from filesystem
const completed =
	yield *
	migrate({
		loader: Migrator.fromFileSystem('./migrations'),
		schemaDirectory: './migrations', // optional: where to dump _schema.sql
		table: 'effect_sql_migrations' // optional: custom table name (default)
	});
```

### Migration Loaders

```ts
// From filesystem (requires FileSystem service)
Migrator.fromFileSystem('./migrations');

// From Vite/bundler glob import
Migrator.fromGlob(import.meta.glob('./migrations/*.ts'));

// From a record of effects (inline)
Migrator.fromRecord({
	'0001_create_users': Effect.gen(function* () {
		const sql = yield* SqlClient;
		yield* sql`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`;
	}),
	'0002_add_email': Effect.gen(function* () {
		const sql = yield* SqlClient;
		yield* sql`ALTER TABLE users ADD COLUMN email TEXT`;
	})
});

// From Babel-style glob (for bundlers that don't support dynamic import)
Migrator.fromBabelGlob(migrations);
```

### Migration Errors

```ts
import { Migrator } from 'effect/unstable/sql/Migrator';

// MigrationError has a `kind` discriminator:
// - "BadState"    — migrations table in unexpected state
// - "ImportError" — failed to import migration file
// - "Failed"      — migration execution failed
// - "Duplicates"  — duplicate migration IDs found
// - "Locked"      — migrations already running (concurrent protection)
```

## Driver Packages and Layer Setup

Effect SQL uses driver-specific packages that provide `SqlClient` layers.

### Available Drivers

| Package                   | Database                      |
| ------------------------- | ----------------------------- |
| `@effect/sql-pg`          | PostgreSQL (via `pg`)         |
| `@effect/sql-mysql2`      | MySQL (via `mysql2`)          |
| `@effect/sql-sqlite-node` | SQLite (via `better-sqlite3`) |
| `@effect/sql-libsql`      | libSQL / Turso                |
| `@effect/sql-mssql`       | Microsoft SQL Server          |
| `@effect/sql-clickhouse`  | ClickHouse                    |

### PostgreSQL Setup

```ts
import { Effect, Layer } from 'effect';
import { PgClient } from '@effect/sql-pg';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

// Static config
const DatabaseLayer = PgClient.layer({
	host: 'localhost',
	port: 5432,
	database: 'myapp',
	username: 'postgres',
	password: Redacted.make('secret'),
	// Optional settings:
	maxConnections: 10,
	idleTimeout: '30 seconds',
	transformResultNames: (s) => camelCase(s), // snake_case → camelCase
	transformQueryNames: (s) => snakeCase(s) // camelCase → snake_case
});

// From Config (reads from environment/config provider)
const DatabaseLayerConfig = PgClient.layerConfig({
	url: Config.redacted('DATABASE_URL')
});

// The layer provides both PgClient and SqlClient services
const program = Effect.gen(function* () {
	const sql = yield* SqlClient; // generic interface
	// or
	const pg = yield* PgClient; // pg-specific (has .json(), .listen(), .notify())
});

const main = program.pipe(Effect.provide(DatabaseLayer));
```

### PgClient-Specific Features

```ts
const pg = yield * PgClient;

// JSON parameter helper
sql`INSERT INTO data ${sql.insert({ metadata: pg.json({ key: 'value' }) })}`;

// LISTEN/NOTIFY
const notifications = pg.listen('my_channel'); // Stream<string, SqlError>
yield * pg.notify('my_channel', 'hello');
```

### Connection Reservation

```ts
const sql = yield * SqlClient;

// Reserve a dedicated connection (useful for advisory locks, temp tables, etc.)
const conn = yield * sql.reserve; // Effect<Connection, SqlError, Scope>
```

## Streaming Large Result Sets

Use `.stream` on any statement for memory-efficient processing of large result sets:

```ts
import { Stream } from 'effect';

const sql = yield * SqlClient;

// Stream rows one at a time
const allUsers = sql`SELECT * FROM users`.stream;

// Process with Stream combinators
yield *
	allUsers.pipe(
		Stream.filter((user) => user.active),
		Stream.map((user) => user.email),
		Stream.runCollect
	);

// Chunked streaming (driver-dependent, e.g. pg uses cursor with 128-row chunks)
```

## Error Handling

All SQL operations can fail with `SqlError`:

```ts
import { SqlError } from 'effect/unstable/sql/SqlError';

yield *
	sql`SELECT * FROM users`.pipe(
		Effect.catchTag('SqlError', (err) => {
			console.error('SQL failed:', err.message);
			console.error('Cause:', err.cause); // underlying driver error
			return Effect.succeed([]);
		})
	);
```

`SqlResolver` also exposes `ResultLengthMismatch` for ordered resolvers when result count doesn't match request count.

## Complete Example

```ts
import { Effect, Layer, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { SqlClient } from 'effect/unstable/sql/SqlClient';
import * as SqlModel from 'effect/unstable/sql/SqlModel';
import * as Migrator from 'effect/unstable/sql/Migrator';
import { PgClient } from '@effect/sql-pg';

// 1. Define Model
const UserId = Schema.Number.pipe(Schema.brand('UserId'));

class User extends Model.Class<User>('User')({
	id: Model.Generated(UserId),
	name: Schema.String,
	email: Schema.String,
	createdAt: Model.DateTimeInsertFromDate,
	updatedAt: Model.DateTimeUpdateFromDate
}) {}

// 2. Build Repository
const makeUserRepo = Effect.gen(function* () {
	const repo = yield* SqlModel.makeRepository(User, {
		tableName: 'users',
		spanPrefix: 'UserRepo',
		idColumn: 'id'
	});
	return repo;
});

// 3. Run Migrations
const runMigrations = Migrator.make({})({
	loader: Migrator.fromFileSystem('./migrations')
});

// 4. Wire it up
const DatabaseLayer = PgClient.layer({
	host: 'localhost',
	database: 'myapp',
	username: 'postgres'
});

const program = Effect.gen(function* () {
	yield* runMigrations;
	const repo = yield* makeUserRepo;
	const user = yield* repo.insert({
		name: 'Alice',
		email: 'alice@example.com'
	});
	const found = yield* repo.findById(user.id);
	yield* Effect.log(`Created user: ${found.name}`);
});

Effect.runPromise(program.pipe(Effect.provide(DatabaseLayer)));
```

## Anti-Patterns

- **String concatenation in queries** — Always use tagged template interpolation or `sql.unsafe()`. Never build SQL strings manually.
- **Forgetting `sql.insert()` / `sql.update()`** — Use the helpers for INSERT/UPDATE instead of manually listing columns and values.
- **Not using transactions** — Wrap multi-statement mutations in `sql.withTransaction()` for atomicity.
- **Ignoring `SqlSchema`** — Raw queries return untyped rows. Use `SqlSchema.findOne/findAll/void` for validated I/O.
- **Creating resolvers without delay** — `SqlResolver` resolvers need `RequestResolver.setDelay()` to enable batching. Without it, each request fires immediately.
