/**
 * Effect bridge for the @opencode-ai/plugin SDK.
 * Provides OpenCodeTool, OpenCodeError, OpenCodeClient, and OpenCodeProject.
 */
import { type Plugin, type ToolDefinition, tool } from '@opencode-ai/plugin';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as AST from 'effect/SchemaAST';
import * as ServiceMap from 'effect/ServiceMap';
import type { z } from 'zod';

const zod = tool.schema;

// ─── OpenCodeError ─────────────────────────────────────────────

export class OpenCodeError extends Error {
	readonly reason: string;
	constructor(args: { reason: string; message: string; cause?: unknown }) {
		super(args.message, {
			cause: args.cause
		});
		this.reason = args.reason;
		this.name = 'OpenCodeError';
	}
}

// ─── Context Services ──────────────────────────────────────────

/** Derive the client type from the plugin's own context to avoid SDK version mismatches. */
type PluginInput = Parameters<Plugin>[0];
type OpencodeClient = PluginInput['client'];

export class OpenCodeClient extends ServiceMap.Service<
	OpenCodeClient,
	OpencodeClient
>()('@OpenCode/Client') {}

export class OpenCodeProject extends ServiceMap.Service<
	OpenCodeProject,
	{
		readonly directory: string;
		readonly worktree: string;
	}
>()('@OpenCode/Project') {}

// ─── Plugin Context ────────────────────────────────────────────

/** Plugin layers — `null` until `initPluginContext` is called. */
let _pluginLayers: Layer.Layer<OpenCodeClient | OpenCodeProject> | null = null;

export const initPluginContext = (input: {
	client: OpencodeClient;
	directory: string;
	worktree: string;
}) => {
	_pluginLayers = Layer.mergeAll(
		Layer.succeed(OpenCodeClient, input.client),
		Layer.succeed(OpenCodeProject, {
			directory: input.directory,
			worktree: input.worktree
		})
	);
};

// ─── Schema → Zod Conversion ──────────────────────────────────

const descOf = (ast: AST.AST): string | undefined =>
	AST.resolveDescription(ast);

const withDesc = (zodType: z.ZodType, desc: string | undefined): z.ZodType =>
	desc ? zodType.describe(desc) : zodType;

const astToZod = (ast: AST.AST): z.ZodType => {
	const desc = descOf(ast);
	switch (ast._tag) {
		case 'String':
			return withDesc(zod.string(), desc);
		case 'Number':
			return withDesc(zod.number(), desc);
		case 'Boolean':
			return withDesc(zod.boolean(), desc);
		case 'Unknown':
		case 'Any':
			return zod.unknown();
		case 'Literal': {
			const lit = ast.literal;
			if (typeof lit === 'string')
				return withDesc(zod.literal(lit), desc);
			if (typeof lit === 'number')
				return withDesc(zod.literal(lit), desc);
			if (typeof lit === 'boolean')
				return withDesc(zod.literal(lit), desc);
			if (lit === null) return zod.null();
			return zod.unknown();
		}
		case 'Union': {
			const allStringLits = ast.types.every(
				(t) =>
					t._tag === 'Literal' &&
					typeof (t as AST.Literal).literal === 'string'
			);
			if (allStringLits && ast.types.length > 0) {
				const values = ast.types.map(
					(t) => (t as AST.Literal).literal as string
				);
				return withDesc(
					zod.enum(values as [string, ...string[]]),
					desc
				);
			}
			const members = ast.types.map(astToZod);
			if (members.length >= 2) {
				return withDesc(
					zod.union(
						members as [z.ZodType, z.ZodType, ...z.ZodType[]]
					),
					desc
				);
			}
			return members[0] ?? zod.unknown();
		}
		case 'Arrays': {
			const arrAst = ast as AST.Arrays;
			const el: AST.AST | undefined = arrAst.rest[0];
			if (el) return withDesc(zod.array(astToZod(el)), desc);
			return zod.array(zod.unknown());
		}
		case 'Objects': {
			return objectsToZod(ast as AST.Objects, desc);
		}
		case 'Suspend':
			return zod.lazy(() => astToZod((ast as AST.Suspend).thunk()));
		default:
			return zod.unknown();
	}
};

const objectsToZod = (
	ast: AST.Objects,
	desc: string | undefined
): z.ZodType => {
	const firstIndex = ast.indexSignatures[0];
	if (ast.propertySignatures.length === 0 && firstIndex) {
		return withDesc(
			zod.record(zod.string(), astToZod(firstIndex.type)),
			desc
		);
	}
	const shape: Record<string, z.ZodType> = {};
	for (const ps of ast.propertySignatures) {
		let field = astToZod(ps.type);
		const psDesc = ps.type.context?.annotations?.description as
			| string
			| undefined;
		if (psDesc) field = field.describe(psDesc);
		const isOptional = ps.type.context?.isOptional ?? false;
		shape[String(ps.name)] = isOptional ? field.optional() : field;
	}
	return withDesc(zod.object(shape), desc);
};

export const structToZodShape = (schema: {
	readonly ast: AST.AST;
}): z.ZodRawShape => {
	const ast = schema.ast;
	if (ast._tag !== 'Objects') return {};
	const shape: Record<string, z.ZodType> = {};
	for (const ps of (ast as AST.Objects).propertySignatures) {
		let field = astToZod(ps.type);
		const psDesc =
			(ps.type.context?.annotations?.description as string | undefined) ??
			descOf(ps.type);
		if (psDesc) field = field.describe(psDesc);
		const isOptional = ps.type.context?.isOptional ?? false;
		shape[String(ps.name)] = isOptional ? field.optional() : field;
	}
	return shape;
};

// ─── OpenCodeTool ──────────────────────────────────────────────

type PluginServices = OpenCodeClient | OpenCodeProject;

const runEffect = (
	effect: Effect.Effect<string, unknown, PluginServices>
): Promise<string> => {
	if (!_pluginLayers) {
		return Promise.reject(
			new Error(
				'Plugin context not initialized — call initPluginContext first'
			)
		);
	}
	return Effect.runPromise(
		effect.pipe(
			Effect.provide(_pluginLayers),
			Effect.catchCause((cause) =>
				Effect.succeed(`[Plugin Error] ${cause}`)
			)
		)
	);
};

/** Schema-like type: anything with an `ast` and a `Type` member */
type AnySchema = {
	readonly ast: AST.AST;
	// oxlint-ignore: type erasure boundary — concrete type unknown at bridge level
	readonly Type: any;
};

export const OpenCodeTool = {
	make<S extends AnySchema>(input: {
		description: string;
		schema: S;
		semantics?: {
			category: string;
			keywords: string[];
			examples: string[];
			whenToUse: string;
		};
		execute: (
			args: S['Type']
		) => Effect.Effect<string, OpenCodeError, PluginServices>;
	}): ToolDefinition {
		const zodShape = structToZodShape(input.schema);
		return tool({
			description: input.description,
			args: zodShape,
			execute: (args: Record<string, unknown>) =>
				runEffect(input.execute(args))
		});
	},

	makeFrom(
		aiTool: {
			readonly description?: string | undefined;
			readonly parameters?: AnySchema;
			readonly parametersSchema?: AnySchema;
		},
		handler: (
			params: Record<string, unknown>
		) => Effect.Effect<string, OpenCodeError, PluginServices>
	): ToolDefinition {
		const schema = aiTool.parameters ?? aiTool.parametersSchema;
		if (!schema)
			throw new Error(
				'makeFrom: tool has no parameters or parametersSchema'
			);
		const zodShape = structToZodShape(schema);
		return tool({
			description: aiTool.description ?? '',
			args: zodShape,
			execute: (args: Record<string, unknown>) => runEffect(handler(args))
		});
	}
};
