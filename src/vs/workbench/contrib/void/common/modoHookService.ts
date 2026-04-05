/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';

// --- Types ---

export type HookEventType =
	| 'fileEdited' | 'fileCreated' | 'fileDeleted'
	| 'userTriggered' | 'promptSubmit' | 'agentStop'
	| 'preToolUse' | 'postToolUse'
	| 'preTaskExecution' | 'postTaskExecution';

export type HookActionType = 'askAgent' | 'runCommand';

export interface HookDefinition {
	name: string;
	version: string;
	description?: string;
	when: {
		type: HookEventType;
		patterns?: string[];
		toolTypes?: string[];
	};
	then: {
		type: HookActionType;
		prompt?: string;
		command?: string;
	};
	fileName?: string;
}

export interface HookEvent {
	type: HookEventType;
	filePath?: string;
	toolName?: string;
	toolCategory?: string;
	taskId?: string;
	message?: string;
}

export interface HookResult {
	hookName: string;
	actionType: HookActionType;
	output?: string;
	error?: string;
	denied?: boolean;
}

// --- Validation ---

const VALID_EVENTS: HookEventType[] = [
	'fileEdited', 'fileCreated', 'fileDeleted',
	'userTriggered', 'promptSubmit', 'agentStop',
	'preToolUse', 'postToolUse',
	'preTaskExecution', 'postTaskExecution',
];

const FILE_EVENTS: HookEventType[] = ['fileEdited', 'fileCreated', 'fileDeleted'];
const TOOL_EVENTS: HookEventType[] = ['preToolUse', 'postToolUse'];

export function validateHookDefinition(hook: unknown): { valid: boolean; errors: string[] } {
	const errors: string[] = [];
	if (!hook || typeof hook !== 'object') return { valid: false, errors: ['Not an object'] };

	const h = hook as Record<string, unknown>;
	if (!h.name || typeof h.name !== 'string') errors.push('Missing "name"');
	if (!h.version || typeof h.version !== 'string') errors.push('Missing "version"');

	if (!h.when || typeof h.when !== 'object') {
		errors.push('Missing "when"');
	} else {
		const when = h.when as Record<string, unknown>;
		if (!VALID_EVENTS.includes(when.type as HookEventType)) {
			errors.push(`Invalid event type: ${when.type}`);
		}
		if (FILE_EVENTS.includes(when.type as HookEventType) && !when.patterns) {
			errors.push(`File event requires "patterns"`);
		}
		if (TOOL_EVENTS.includes(when.type as HookEventType) && !when.toolTypes) {
			errors.push(`Tool event requires "toolTypes"`);
		}
	}

	if (!h.then || typeof h.then !== 'object') {
		errors.push('Missing "then"');
	} else {
		const then = h.then as Record<string, unknown>;
		if (then.type === 'askAgent' && !then.prompt) errors.push('askAgent needs "prompt"');
		if (then.type === 'runCommand' && !then.command) errors.push('runCommand needs "command"');
	}

	return { valid: errors.length === 0, errors };
}

// --- Service Interface ---

export interface IModoHookService {
	readonly _serviceBrand: undefined;
	readonly hooks: HookDefinition[];
	onDidChangeHooks: Event<void>;

	loadAll(): Promise<{ loaded: number; errors: string[] }>;
	findMatching(event: HookEvent): HookDefinition[];
	fireEvent(event: HookEvent): Promise<HookResult[]>;
}

export const IModoHookService = createDecorator<IModoHookService>('ModoHookService');

// --- Service Implementation ---

class ModoHookService extends Disposable implements IModoHookService {
	_serviceBrand: undefined;

	private readonly _onDidChangeHooks = new Emitter<void>();
	readonly onDidChangeHooks: Event<void> = this._onDidChangeHooks.event;

	hooks: HookDefinition[] = [];
	private executionStack = new Set<string>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) {
		super();
		this.loadAll();
	}

	private getHooksDirUri(): URI | undefined {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) return undefined;
		return URI.joinPath(folders[0].uri, '.modo', 'hooks');
	}

	async loadAll(): Promise<{ loaded: number; errors: string[] }> {
		this.hooks = [];
		const errors: string[] = [];
		const dirUri = this.getHooksDirUri();
		if (!dirUri) return { loaded: 0, errors: [] };

		try {
			const stat = await this.fileService.resolve(dirUri);
			if (!stat.children) return { loaded: 0, errors: [] };

			for (const child of stat.children) {
				if (!child.name.endsWith('.json')) continue;
				try {
					const content = await this.fileService.readFile(child.resource);
					const raw = JSON.parse(content.value.toString());
					const validation = validateHookDefinition(raw);
					if (!validation.valid) {
						errors.push(`${child.name}: ${validation.errors.join('; ')}`);
						continue;
					}
					const hook = raw as HookDefinition;
					hook.fileName = child.name;
					this.hooks.push(hook);
				} catch (e) {
					errors.push(`${child.name}: ${(e as Error).message}`);
				}
			}
		} catch {
			// .modo/hooks/ doesn't exist yet
		}

		this._onDidChangeHooks.fire();
		return { loaded: this.hooks.length, errors };
	}

	findMatching(event: HookEvent): HookDefinition[] {
		return this.hooks.filter(hook => {
			if (hook.when.type !== event.type) return false;

			if (FILE_EVENTS.includes(event.type)) {
				if (!event.filePath || !hook.when.patterns) return false;
				return hook.when.patterns.some(p => {
					const regex = new RegExp(
						p.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
					);
					return regex.test(event.filePath!);
				});
			}

			if (TOOL_EVENTS.includes(event.type)) {
				if (!hook.when.toolTypes) return false;
				if (hook.when.toolTypes.includes('*')) return true;
				return hook.when.toolTypes.some(t => {
					if (['read', 'write', 'shell', 'web', 'spec'].includes(t)) {
						return t === event.toolCategory;
					}
					try { return new RegExp(t).test(event.toolName ?? ''); }
					catch { return false; }
				});
			}

			return true;
		});
	}

	async fireEvent(event: HookEvent): Promise<HookResult[]> {
		const matching = this.findMatching(event);
		const results: HookResult[] = [];

		for (const hook of matching) {
			const hookId = `${hook.name}:${hook.when.type}`;

			// Circular dependency detection
			if (hook.when.type === 'preToolUse' && this.executionStack.has(hookId)) {
				results.push({
					hookName: hook.name,
					actionType: hook.then.type,
					output: '[skipped: circular dependency]',
				});
				continue;
			}

			this.executionStack.add(hookId);
			try {
				if (hook.then.type === 'askAgent') {
					results.push({
						hookName: hook.name,
						actionType: 'askAgent',
						output: hook.then.prompt ?? '',
					});
				} else {
					// runCommand would use terminal service in real integration
					results.push({
						hookName: hook.name,
						actionType: 'runCommand',
						output: `[would run: ${hook.then.command}]`,
					});
				}
			} finally {
				this.executionStack.delete(hookId);
			}

			if (event.type === 'preToolUse' && results[results.length - 1]?.denied) break;
		}

		return results;
	}
}

registerSingleton(IModoHookService, ModoHookService, InstantiationType.Delayed);
