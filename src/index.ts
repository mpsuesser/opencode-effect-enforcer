/**
 * opencode-effect-enforcer
 *
 * An OpenCode plugin that enforces Effect-first development patterns.
 * Detects code smells via pattern definitions, enforces minimum skill
 * loading before Effect code writes, ensures a local Effect v4 source
 * reference clone, and ships 39 Effect skills + comprehensive docs.
 *
 * @module
 */

export {
	EffectEnforcerPlugin,
	EffectEnforcerPlugin as default
} from './enforcer.ts';

export type { PatternDefinition } from './patterns.ts';
export {
	bodyWithSkillHints,
	getPatterns,
	matches,
	sortByLevel
} from './patterns.ts';

export { extractBody, parseFrontmatter } from './frontmatter.ts';

export { detectEffectVersion } from './functions/detectEffectVersion.ts';
export { ensureReferenceClone } from './functions/ensureReferenceClone.ts';
