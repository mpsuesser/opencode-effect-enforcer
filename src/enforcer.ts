/**
 * OpenCode Effect Enforcer Plugin
 *
 * Registers skills, injects guidance docs, detects code smells via
 * pattern matching, enforces minimum skill loading before Effect code
 * writes, and ensures the Effect v4 reference clone exists.
 */

import type { Plugin } from '@opencode-ai/plugin';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { EFFECT_CODE_RE, MIN_EFFECT_SKILLS, WRITE_TOOLS } from './constants.ts';
import { detectEffectVersion } from './functions/detectEffectVersion.ts';
import { ensureReferenceClone } from './functions/ensureReferenceClone.ts';
import {
	type PatternDefinition,
	bodyWithSkillHints,
	getPatterns,
	matches,
	sortByLevel
} from './patterns.ts';

// Bun's text loader inlines these at import time — no fs reads or caching needed.
import guidanceDoc from '../docs/effect-first-development.md' with { type: 'text' };
import progressiveDisclosureDoc from '../docs/progressive-disclosure-guidance.md' with { type: 'text' };

// ─── Session State ────────────────────────────────────────────

/** Sessions that have already had guidance docs injected. */
const injectedSessions = new Set<string>();

/** Per-session set of loaded effect-* skill names. */
const sessionSkills = new Map<string, Set<string>>();

/** Pending skill name captured in tool.execute.before, confirmed in after. */
const pendingSkillLoads = new Map<string, string>();

const getLoadedEffectSkills = (sessionID: string): Set<string> => {
	let skills = sessionSkills.get(sessionID);
	if (!skills) {
		skills = new Set();
		sessionSkills.set(sessionID, skills);
	}
	return skills;
};

const clearSessionState = (sessionID: string): void => {
	injectedSessions.delete(sessionID);
	sessionSkills.delete(sessionID);
	pendingSkillLoads.delete(sessionID);
};

// ─── Plugin ───────────────────────────────────────────────────

export const EffectEnforcerPlugin: Plugin = async (pluginInput) => {
	const effectVersion = detectEffectVersion(pluginInput.directory);
	const { client } = pluginInput;

	// Ensure reference clone exists at startup
	await ensureReferenceClone(pluginInput.directory, effectVersion);

	const injectGuidance = async (sessionID: string): Promise<void> => {
		if (progressiveDisclosureDoc) {
			await client.session.prompt({
				path: { id: sessionID },
				body: {
					noReply: true,
					parts: [
						{
							type: 'text',
							text: `<progressive-disclosure-guidance>\n${progressiveDisclosureDoc}\n</progressive-disclosure-guidance>`,
							synthetic: true
						}
					]
				}
			});
		}

		if (guidanceDoc) {
			await client.session.prompt({
				path: { id: sessionID },
				body: {
					noReply: true,
					parts: [
						{
							type: 'text',
							text: `<effect-first-development-guide>\n${guidanceDoc}\n</effect-first-development-guide>`,
							synthetic: true
						}
					]
				}
			});
		}
	};

	return {
		config: async (opencodeConfig) => {
			const dirname = import.meta.dirname ?? '.';
			const skillsDir = path.join(dirname, '..', 'skills');
			if (fs.existsSync(skillsDir)) {
				const cfg = opencodeConfig as Record<string, unknown>;
				const skills = ((cfg.skills as Record<string, unknown>) ??= {});
				const paths = ((skills.paths as string[]) ??= []);
				paths.push(skillsDir);
			}
		},

		'chat.message': async (_input, output) => {
			await ensureReferenceClone(pluginInput.directory, effectVersion);

			const sessionID = (output as Record<string, unknown>).message
				? ((
						(output as Record<string, unknown>).message as Record<
							string,
							unknown
						>
					).sessionID as string)
				: undefined;
			if (!sessionID) return;

			if (injectedSessions.has(sessionID)) return;
			injectedSessions.add(sessionID);
			await injectGuidance(sessionID);
		},

		event: async ({ event }) => {
			if (event.type === 'session.compacted') {
				const sessionID = (event.properties as Record<string, unknown>)
					.sessionID as string;
				if (sessionID) {
					clearSessionState(sessionID);
					await injectGuidance(sessionID);
					injectedSessions.add(sessionID);
				}
			}
			if (event.type === 'session.deleted') {
				const info = (event.properties as Record<string, unknown>)
					.info as Record<string, unknown> | undefined;
				const sessionID = info?.id as string | undefined;
				if (sessionID) {
					clearSessionState(sessionID);
				}
			}
		},

		'tool.execute.before': async (input, output) => {
			await ensureReferenceClone(pluginInput.directory, effectVersion);

			const toolName = input.tool;
			const args = output.args as Record<string, unknown>;

			// ── Track pending effect-* skill loads ──
			if (toolName === 'skill') {
				const name = args.name;
				if (typeof name === 'string' && name.startsWith('effect-')) {
					pendingSkillLoads.set(input.sessionID, name);
				}
			}

			// ── Block file writes to Effect code without enough skills ──
			if (WRITE_TOOLS.has(toolName)) {
				const contentParts: string[] = [];
				if (typeof args.content === 'string')
					contentParts.push(args.content);
				if (typeof args.oldString === 'string')
					contentParts.push(args.oldString);
				if (typeof args.newString === 'string')
					contentParts.push(args.newString);

				const combined = contentParts.join('\n');
				if (EFFECT_CODE_RE.test(combined)) {
					const skills = getLoadedEffectSkills(input.sessionID);
					if (skills.size < MIN_EFFECT_SKILLS) {
						throw new Error(
							`you have loaded ${String(skills.size)} of the minimum-required ${String(MIN_EFFECT_SKILLS)} Effect skills`
						);
					}
				}
			}

			// ── Pattern detection ──
			const patterns = getPatterns();

			const matched = patterns.filter((p: PatternDefinition) =>
				matches(toolName, args, 'before', p)
			);
			if (matched.length === 0) return;

			const blockingPatterns = sortByLevel(
				matched.filter(
					(p: PatternDefinition) =>
						p.action === 'deny' || p.action === 'ask'
				)
			);
			const primary = blockingPatterns[0];

			if (primary?.action === 'deny') {
				throw new Error(
					`[DENIED] ${primary.name}: ${primary.description}\n\n${bodyWithSkillHints(primary)}`
				);
			}

			if (primary?.action === 'ask') {
				await client.session.prompt({
					path: { id: input.sessionID },
					body: {
						noReply: true,
						parts: [
							{
								type: 'text',
								text: `<pattern-warning name="${primary.name}" level="${primary.level}">\n${bodyWithSkillHints(primary)}\n</pattern-warning>`
							}
						]
					}
				});
			}

			const contextPatterns = matched.filter(
				(p: PatternDefinition) => p.action === 'context'
			);
			if (contextPatterns.length > 0) {
				const message = contextPatterns
					.map(
						(p: PatternDefinition) =>
							`<code-smell name="${p.name}" level="${p.level}">\n${bodyWithSkillHints(p)}\n</code-smell>`
					)
					.join('\n\n');

				await client.session.prompt({
					path: { id: input.sessionID },
					body: {
						noReply: true,
						parts: [{ type: 'text', text: message }]
					}
				});
			}
		},

		'tool.execute.after': async (input, output) => {
			// ── Confirm pending effect-* skill loads ──
			if (input.tool === 'skill') {
				const name = pendingSkillLoads.get(input.sessionID);
				if (name !== undefined) {
					getLoadedEffectSkills(input.sessionID).add(name);
					pendingSkillLoads.delete(input.sessionID);
				}
			}

			// ── Pattern detection ──
			const patterns = getPatterns();
			const toolName = input.tool;
			const pseudoArgs: Record<string, unknown> = {
				content: output.output
			};

			const contextPatterns = patterns.filter(
				(p: PatternDefinition) =>
					matches(toolName, pseudoArgs, 'after', p) &&
					p.action === 'context'
			);
			if (contextPatterns.length === 0) return;

			const message = contextPatterns
				.map(
					(p: PatternDefinition) =>
						`<code-smell name="${p.name}" level="${p.level}">\n${bodyWithSkillHints(p)}\n</code-smell>`
				)
				.join('\n\n');

			await client.session.prompt({
				path: { id: input.sessionID },
				body: {
					noReply: true,
					parts: [{ type: 'text', text: message }]
				}
			});
		}
	};
};

export default EffectEnforcerPlugin;
