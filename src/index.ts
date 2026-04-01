/**
 * opencode-effect-enforcer
 *
 * An OpenCode plugin that enforces Effect-first development patterns.
 * Detects code smells and dangerous commands in real-time via pattern
 * definitions, provides custom tools for reading Effect v4 source code,
 * and ships 39 Effect skills + comprehensive reference docs.
 *
 * @module
 */

export {
	EffectEnforcerPlugin,
	EffectEnforcerPlugin as default,
	PatternsPlugin
} from './patterns.ts';

export {
	OpenCodeClient,
	OpenCodeError,
	OpenCodeProject,
	OpenCodeTool,
	initPluginContext,
	structToZodShape
} from './helpers.ts';

export { extractBody, parseFrontmatter } from './frontmatter.ts';

export {
	createReferenceTools,
	detectEffectVersion,
	ensureCachedFile,
	extractReferencePath
} from './reference-tools.ts';
