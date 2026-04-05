/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Modo Slash Commands and extra chat actions.
 * - Export conversation as markdown
 * - Session management
 */

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { IChatThreadService } from './chatThreadService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IModoHookService } from '../common/modoHookService.js';
import { IModoSteeringService } from '../common/modoSteeringService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';

// --- Export Conversation ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.exportConversation',
			title: localize2('modoExportConversation', 'Modo: Export Conversation as Markdown'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const chatService = accessor.get(IChatThreadService);
		const clipboardService = accessor.get(IClipboardService);
		const notificationService = accessor.get(INotificationService);

		const thread = chatService.getCurrentThread();
		if (!thread || thread.messages.length === 0) {
			notificationService.notify({ severity: Severity.Info, message: 'No messages to export.' });
			return;
		}

		const lines: string[] = [`# Modo Chat Export\n`];
		for (const msg of thread.messages) {
			if (msg.role === 'user') {
				lines.push(`## User\n\n${msg.content}\n`);
			} else if (msg.role === 'assistant') {
				lines.push(`## Assistant\n\n${msg.displayContent}\n`);
			} else if (msg.role === 'tool') {
				lines.push(`### Tool: ${msg.name}\n\n\`\`\`\n${msg.content?.slice(0, 500)}\n\`\`\`\n`);
			}
		}

		const markdown = lines.join('\n');
		await clipboardService.writeText(markdown);
		notificationService.notify({ severity: Severity.Info, message: 'Conversation copied to clipboard as Markdown.' });
	}
});

// --- Slash Command Picker (/ commands) ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.slashCommands',
			title: localize2('modoSlashCommands', 'Modo: Slash Commands'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInput = accessor.get(IQuickInputService);
		const hookService = accessor.get(IModoHookService);
		const steeringService = accessor.get(IModoSteeringService);
		const chatService = accessor.get(IChatThreadService);

		const items: (IQuickPickItem & { action: () => Promise<void> })[] = [];

		// Manual hooks as slash commands
		const manualHooks = hookService.hooks.filter(h => h.when.type === 'userTriggered');
		for (const hook of manualHooks) {
			items.push({
				label: `/${hook.name.toLowerCase().replace(/\s+/g, '-')}`,
				description: hook.description || `${hook.then.type}: ${hook.then.prompt || hook.then.command}`,
				detail: 'Hook',
				action: async () => {
					await hookService.fireEvent({ type: 'userTriggered' });
				},
			});
		}

		// Manual steering files as slash commands
		const manualSteering = steeringService.files.filter(f => f.inclusion === 'manual');
		for (const file of manualSteering) {
			items.push({
				label: `/${file.name}`,
				description: file.description || 'Steering file',
				detail: 'Steering',
				action: async () => {
					// Inject steering content into the next message
					const threadId = chatService.state.currentThreadId;
					await chatService.addUserMessageAndStreamResponse({
						userMessage: `[Including steering: ${file.name}]\n\n${file.content}`,
						threadId,
					});
				},
			});
		}

		// Built-in commands
		items.push({
			label: '/init',
			description: 'Initialize .modo/ workspace structure',
			detail: 'Built-in',
			action: async () => {
				const commandService = accessor.get('ICommandService' as any) as any;
				await commandService.executeCommand('modo.initWorkspace');
			},
		});

		items.push({
			label: '/spec',
			description: 'Create a new spec from prompt',
			detail: 'Built-in',
			action: async () => {
				const commandService = accessor.get('ICommandService' as any) as any;
				await commandService.executeCommand('modo.createSpec');
			},
		});

		items.push({
			label: '/spec-context',
			description: 'Inject active spec context into chat',
			detail: 'Built-in',
			action: async () => {
				const commandService = accessor.get('ICommandService' as any) as any;
				await commandService.executeCommand('modo.injectSpecContext');
			},
		});

		items.push({
			label: '/spec-files',
			description: 'Open spec files in editor',
			detail: 'Built-in',
			action: async () => {
				const commandService = accessor.get('ICommandService' as any) as any;
				await commandService.executeCommand('modo.openSpecFiles');
			},
		});

		items.push({
			label: '/run-task',
			description: 'Run next pending spec task',
			detail: 'Built-in',
			action: async () => {
				const commandService = accessor.get('ICommandService' as any) as any;
				await commandService.executeCommand('modo.runNextSpecTask');
			},
		});

		items.push({
			label: '/run-tasks',
			description: 'Run all pending spec tasks',
			detail: 'Built-in',
			action: async () => {
				const commandService = accessor.get('ICommandService' as any) as any;
				await commandService.executeCommand('modo.runAllSpecTasks');
			},
		});

		items.push({
			label: '/export',
			description: 'Export conversation as markdown',
			detail: 'Built-in',
			action: async () => {
				const commandService = accessor.get('ICommandService' as any) as any;
				await commandService.executeCommand('modo.exportConversation');
			},
		});

		if (items.length === 0) {
			items.push({
				label: 'No slash commands available',
				description: 'Add manual hooks or steering files to create commands',
				action: async () => { },
			});
		}

		const picked = await quickInput.pick(items, {
			placeHolder: 'Type / to search commands...',
		});

		if (picked) {
			await (picked as any).action();
		}
	}
});

// --- Clear Chat History ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.clearChat',
			title: localize2('modoClearChat', 'Modo: Clear Current Chat'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const chatService = accessor.get(IChatThreadService);
		chatService.openNewThread();
	}
});
