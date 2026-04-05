/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { CodeLens, CodeLensProvider } from '../../../../editor/common/languages.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { IModoSpecService } from '../common/modoSpecService.js';
import { IChatThreadService } from './chatThreadService.js';
import { IModoHookService } from '../common/modoHookService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { VOID_VIEW_CONTAINER_ID } from './sidebarPane.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

// --- Run Specific Task Command ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.runSpecificTask',
			title: localize2('modoRunTask', 'Modo: Run Specific Task'),
			f1: false,
		});
	}
	run(accessor: ServicesAccessor, taskTitle: string): void {
		// Grab ALL services synchronously — accessor is only valid in this synchronous frame
		const specService = accessor.get(IModoSpecService);
		const chatService = accessor.get(IChatThreadService);
		const hookService = accessor.get(IModoHookService);
		const viewsService = accessor.get(IViewsService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);

		// Run the async work in a separate call
		this._runTask(taskTitle, specService, chatService, hookService, viewsService, editorService, fileService);
	}

	private async _runTask(
		taskTitle: string,
		specService: IModoSpecService,
		chatService: IChatThreadService,
		hookService: IModoHookService,
		viewsService: IViewsService,
		editorService: IEditorService,
		fileService: IFileService,
	): Promise<void> {

		// Try to load specs and find the task
		await specService.loadAll();

		// If no active spec, try to set one that has this task
		if (!specService.activeSpecId) {
			for (const spec of specService.specs) {
				const match = spec.tasks.find(t => t.title === taskTitle);
				if (match) {
					specService.setActiveSpec(spec.id);
					break;
				}
			}
		}

		// Build the task prompt from whatever context we have
		let specContext = '';
		const specId = specService.activeSpecId;
		if (specId) {
			await specService.reloadSpec(specId);
			specContext = specService.getFullContext(specId);
		}

		// If we still don't have spec context, read the current editor's sibling files
		if (!specContext) {
			const activeUri = editorService.activeEditor?.resource;
			if (activeUri) {
				const dirUri = URI.joinPath(activeUri, '..');
				for (const name of ['requirements.md', 'bugfix.md', 'design.md', 'tasks.md']) {
					try {
						const content = await fileService.readFile(URI.joinPath(dirUri, name));
						specContext += `\n## ${name}\n${content.value.toString()}\n`;
					} catch { /* file may not exist */ }
				}
			}
		}

		// Fire hook
		try {
			await hookService.fireEvent({ type: 'preTaskExecution', taskId: taskTitle });
		} catch { /* */ }

		// Show "Running..." in CodeLens
		ModoTaskCodeLensContribution.setRunningTask(taskTitle);

		// Mark task as in-progress in tasks.md (change - [ ] to - [~])
		const activeUri = editorService.activeEditor?.resource;
		let tasksFileUri: URI | undefined;
		if (activeUri && activeUri.fsPath.endsWith('tasks.md')) {
			tasksFileUri = activeUri;
		}
		if (tasksFileUri) {
			try {
				const content = await fileService.readFile(tasksFileUri);
				const text = content.value.toString();
				const updated = text.replace(
					new RegExp(`^(\\s*- \\[) \\]\\s*${taskTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'),
					`$1~] ${taskTitle}`
				);
				if (updated !== text) {
					await fileService.writeFile(tasksFileUri, VSBuffer.fromString(updated));
				}
			} catch { /* */ }
		}

		// Open chat panel
		viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID);

		// Open new thread — DON'T set spec mode (that triggers questioning workflow)
		// Instead, the spec context is already injected via the active spec in the system prompt
		chatService.openNewThread();

		// Send a clean user message — the active spec context is auto-injected into system prompt
		const userMessage = `Implement this task from the spec: "${taskTitle}". The full spec (requirements, design, tasks) is in your context. Just implement this specific task now — don't ask questions, don't create spec files, just write the code.`;
		const threadId = chatService.state.currentThreadId;
		await chatService.addUserMessageAndStreamResponse({ userMessage, threadId });

		// Mark task as done in tasks.md (change - [~] to - [x])
		if (tasksFileUri) {
			try {
				const content = await fileService.readFile(tasksFileUri);
				const text = content.value.toString();
				const updated = text.replace(
					new RegExp(`^(\\s*- \\[)~\\]\\s*${taskTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'),
					`$1x] ${taskTitle}`
				);
				if (updated !== text) {
					await fileService.writeFile(tasksFileUri, VSBuffer.fromString(updated));
				}
			} catch { /* */ }
		}

		// Clear running state
		ModoTaskCodeLensContribution.setRunningTask(null);

		// Fire post hook
		try {
			await hookService.fireEvent({ type: 'postTaskExecution', taskId: taskTitle });
		} catch { /* */ }
	}
});


// --- CodeLens Provider ---

// Track which task is currently running
let _runningTaskTitle: string | null = null;

class ModoTaskCodeLensContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.modoTaskCodeLens';

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		const onDidChange = this._register(new Emitter<CodeLensProvider>());

		const provider: CodeLensProvider = {
			onDidChange: onDidChange.event,
			provideCodeLenses(model: ITextModel, _token: CancellationToken) {
				const fsPath = model.uri.fsPath || model.uri.path || '';
				if (!fsPath.endsWith('tasks.md')) {
					return { lenses: [] };
				}

				const lenses: CodeLens[] = [];
				const lineCount = model.getLineCount();
				let hasPending = false;

				for (let i = 1; i <= lineCount; i++) {
					const line = model.getLineContent(i);

					const uncheckedMatch = line.match(/^[\s]*-\s*\[([ ])\]\s*(.+)$/);
					if (uncheckedMatch) {
						hasPending = true;
						const fullText = uncheckedMatch[2].trim();
						const colonIdx = fullText.indexOf(':');
						const title = colonIdx > 0 ? fullText.slice(0, colonIdx).trim() : fullText;

						const isRunning = _runningTaskTitle === title;

						lenses.push({
							range: { startLineNumber: i, startColumn: 1, endLineNumber: i, endColumn: line.length + 1 },
							command: isRunning
								? { id: '', title: '$(sync~spin) Running...', arguments: [] }
								: { id: 'modo.runSpecificTask', title: '$(play) Run Task', arguments: [title] },
						});
					}

					const checkedMatch = line.match(/^[\s]*-\s*\[[xX]\]\s*(.+)$/);
					if (checkedMatch) {
						lenses.push({
							range: { startLineNumber: i, startColumn: 1, endLineNumber: i, endColumn: line.length + 1 },
							command: { id: '', title: '$(check) Done', arguments: [] },
						});
					}
				}

				if (hasPending) {
					lenses.unshift({
						range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
						command: { id: 'modo.runAllSpecTasks', title: '$(run-all) Run All Pending Tasks', arguments: [] },
					});
				}

				return { lenses };
			},
		};

		const patterns = [{ language: 'markdown' }];
		this._register(languageFeaturesService.codeLensProvider.register(patterns, provider));

		// Expose the onDidChange emitter so the command can trigger a refresh
		ModoTaskCodeLensContribution._onDidChange = onDidChange;
	}

	static _onDidChange: Emitter<CodeLensProvider> | null = null;

	static setRunningTask(title: string | null): void {
		_runningTaskTitle = title;
		// Trigger CodeLens refresh
		if (ModoTaskCodeLensContribution._onDidChange) {
			ModoTaskCodeLensContribution._onDidChange.fire(null as any);
		}
	}
}

registerWorkbenchContribution2(ModoTaskCodeLensContribution.ID, ModoTaskCodeLensContribution, WorkbenchPhase.AfterRestored);
