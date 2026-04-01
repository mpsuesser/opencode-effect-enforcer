/**
 * Minimal default-only export for the OpenCode plugin loader.
 *
 * OpenCode loads plugins by calling every exported function. To avoid
 * double-registration, this entry point exports ONLY the default plugin
 * function. Use the main `"."` export for programmatic access to helpers.
 */
export { EffectEnforcerPlugin as default } from './patterns.ts';
