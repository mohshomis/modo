/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Modo Spec Actions — commands for creating and running specs from chat.
 * Implements the full Kiro-style 3-phase workflow:
 *   Phase 1: Requirements (or Design, depending on workflow)
 *   Phase 2: Design (or Requirements)
 *   Phase 3: Tasks
 */

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IModoSpecService, SpecType, WorkflowType } from '../common/modoSpecService.js';
import { IChatThreadService } from './chatThreadService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IModoHookService } from '../common/modoHookService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

// --- Create Spec from Prompt (Cmd+Shift+S) ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.createSpec',
			title: localize2('modoCreateSpec', 'Modo: Create Spec'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInput = accessor.get(IQuickInputService);
		const specService = accessor.get(IModoSpecService);
		const chatService = accessor.get(IChatThreadService);
		const editorService = accessor.get(IEditorService);

		// 1. Ask for the prompt
		const prompt = await quickInput.input({
			placeHolder: 'Describe the feature or bug you want to spec out...',
			prompt: 'Modo: Create a new spec',
		});
		if (!prompt) return;

		// 2. Ask for spec type
		const typePick = await quickInput.pick([
			{ label: '$(symbol-method) Feature Spec', description: 'Requirements → Design → Tasks', id: 'feature' },
			{ label: '$(bug) Bugfix Spec', description: 'Bug Analysis → Design → Tasks', id: 'bugfix' },
		], { placeHolder: 'What type of spec?' });
		if (!typePick) return;
		const specType = (typePick as any).id as SpecType;

		// 3. Ask for workflow (only for features)
		let workflowType: WorkflowType = 'requirements-first';
		if (specType === 'feature') {
			const workflowPick = await quickInput.pick([
				{ label: '$(list-ordered) Requirements First', description: 'Define behavior → Generate architecture → Plan tasks', id: 'requirements-first' },
				{ label: '$(symbol-structure) Design First', description: 'Define architecture → Derive requirements → Plan tasks', id: 'design-first' },
			], { placeHolder: 'Choose workflow' });
			if (!workflowPick) return;
			workflowType = (workflowPick as any).id as WorkflowType;
		}

		// 4. Create the spec on disk
		const title = prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt;
		const spec = await specService.createSpec(prompt, title, specType, workflowType);
		specService.setActiveSpec(spec.id);

		// 5. Open the spec files in the editor
		const specDir = specService.getSpecDirUri(spec.id);
		if (specDir) {
			const reqFile = specType === 'bugfix' ? 'bugfix.md' : 'requirements.md';
			try {
				await editorService.openEditor({ resource: URI.joinPath(specDir, reqFile) });
			} catch { /* editor may not be ready */ }
		}

		// 6. Build the agent prompt based on workflow
		let agentPrompt: string;

		if (specType === 'bugfix') {
			agentPrompt = buildBugfixPrompt(spec.id, prompt);
		} else if (workflowType === 'requirements-first') {
			agentPrompt = buildRequirementsFirstPrompt(spec.id, prompt);
		} else {
			agentPrompt = buildDesignFirstPrompt(spec.id, prompt);
		}

		// 7. Send to chat
		const threadId = chatService.state.currentThreadId;
		await chatService.addUserMessageAndStreamResponse({
			userMessage: agentPrompt,
			threadId,
		});
	}
});

function buildRequirementsFirstPrompt(specId: string, prompt: string): string {
	return `I've created a feature spec (requirements-first workflow) for: "${prompt}"

The spec files are in .modo/specs/${specId}/. Please follow this 3-phase workflow:

**Phase 1 — Requirements** (requirements.md)
Fill in requirements.md with:
- User stories using EARS (Easy Approach to Requirements Syntax) notation
- Acceptance criteria with WHEN/THEN format for testability
- Non-functional requirements and constraints
- A glossary of domain terms

**Phase 2 — Design** (design.md)
After requirements are complete, fill in design.md with:
- Architecture overview and component design
- Sequence diagrams or data flow descriptions
- Error handling strategy
- Testing strategy (property-based + unit tests)

**Phase 3 — Tasks** (tasks.md)
After design is complete, fill in tasks.md with:
- A checklist of discrete, implementable tasks using \`- [ ] Task title: description\` format
- Each task should reference specific files when possible using backtick notation
- Tasks should be ordered by dependency

Use the edit_file tool to update each file. Start with Phase 1 now.`;
}

function buildDesignFirstPrompt(specId: string, prompt: string): string {
	return `I've created a feature spec (design-first workflow) for: "${prompt}"

The spec files are in .modo/specs/${specId}/. Please follow this 3-phase workflow:

**Phase 1 — Design** (design.md)
Fill in design.md first with:
- Technical architecture and component design
- System constraints and integration points
- Error handling strategy
- Testing strategy

**Phase 2 — Requirements** (requirements.md)
Reverse-engineer requirements from the design:
- User stories that the design enables
- Acceptance criteria derived from the architecture
- Constraints identified during design

**Phase 3 — Tasks** (tasks.md)
Fill in tasks.md with:
- A checklist of discrete tasks using \`- [ ] Task title: description\` format
- Reference specific files using backtick notation
- Order by dependency

Use the edit_file tool to update each file. Start with Phase 1 (design.md) now.`;
}

function buildBugfixPrompt(specId: string, prompt: string): string {
	return `I've created a bugfix spec for: "${prompt}"

The spec files are in .modo/specs/${specId}/. Please follow this workflow:

**Phase 1 — Bug Analysis** (bugfix.md)
Fill in bugfix.md with:
- Detailed bug description and reproduction steps
- Current (broken) behavior
- Expected (correct) behavior
- Root cause analysis

**Phase 2 — Fix Design** (design.md)
Fill in design.md with:
- Fix approach and rationale
- Components affected
- Risk assessment
- Testing strategy for the fix

**Phase 3 — Tasks** (tasks.md)
Fill in tasks.md with:
- A checklist of fix tasks using \`- [ ] Task title: description\` format
- Include regression test tasks

Use the edit_file tool to update each file. Start with Phase 1 now.`;
}

// --- Run Next Spec Task ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.runNextSpecTask',
			title: localize2('modoRunNextTask', 'Modo: Run Next Spec Task'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(IModoSpecService);
		const chatService = accessor.get(IChatThreadService);
		const hookService = accessor.get(IModoHookService);

		const activeId = specService.activeSpecId;
		if (!activeId) return;

		// Reload tasks from disk in case they were edited
		await specService.reloadSpec(activeId);

		const next = specService.getNextTask(activeId);
		if (!next) return;

		const { spec, task } = next;

		// Fire preTaskExecution hook
		try {
			await hookService.fireEvent({ type: 'preTaskExecution', taskId: task.id });
		} catch { /* hooks not critical */ }

		// Mark task as in progress
		await specService.updateTaskStatus(spec.id, task.id, 'in_progress');

		// Build context-rich prompt
		const specContext = specService.getFullContext(spec.id);
		const taskPrompt = `Working on spec "${spec.title}", executing task: "${task.title}"${task.description ? `\n\nTask details: ${task.description}` : ''}${task.fileReferences.length > 0 ? `\n\nRelevant files: ${task.fileReferences.join(', ')}` : ''}

<spec_context>
${specContext}
</spec_context>

Please implement this task. When done, confirm what you changed.`;

		const threadId = chatService.state.currentThreadId;
		await chatService.addUserMessageAndStreamResponse({
			userMessage: taskPrompt,
			threadId,
		});

		// Mark as completed
		await specService.updateTaskStatus(spec.id, task.id, 'completed');

		// Fire postTaskExecution hook
		try {
			await hookService.fireEvent({ type: 'postTaskExecution', taskId: task.id });
		} catch { /* hooks not critical */ }
	}
});

// --- Run All Spec Tasks ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.runAllSpecTasks',
			title: localize2('modoRunAllTasks', 'Modo: Run All Spec Tasks'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(IModoSpecService);
		const chatService = accessor.get(IChatThreadService);
		const hookService = accessor.get(IModoHookService);

		const activeId = specService.activeSpecId;
		if (!activeId) return;

		// Reload tasks from disk
		await specService.reloadSpec(activeId);

		const spec = specService.get(activeId);
		if (!spec) return;

		const pendingTasks = spec.tasks.filter(t => t.status === 'pending');
		if (pendingTasks.length === 0) return;

		// Mark spec as in progress
		specService.updateStatus(spec.id, 'in_progress');

		const specContext = specService.getFullContext(spec.id);
		const taskList = pendingTasks.map((t, i) =>
			`${i + 1}. ${t.title}${t.description ? ': ' + t.description : ''}${t.fileReferences.length > 0 ? ` (files: ${t.fileReferences.join(', ')})` : ''}`
		).join('\n');

		const prompt = `Working on spec "${spec.title}". Please implement ALL remaining tasks in order:

${taskList}

<spec_context>
${specContext}
</spec_context>

Work through each task sequentially. Use tools to read, edit, and create files as needed. After completing each task, briefly confirm what was done before moving to the next.`;

		// Fire preTaskExecution for first task
		try {
			await hookService.fireEvent({ type: 'preTaskExecution', taskId: pendingTasks[0].id });
		} catch { /* */ }

		const threadId = chatService.state.currentThreadId;
		await chatService.addUserMessageAndStreamResponse({
			userMessage: prompt,
			threadId,
		});

		// Fire postTaskExecution
		try {
			await hookService.fireEvent({ type: 'postTaskExecution' });
		} catch { /* */ }
	}
});

// --- Open Spec Files ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.openSpecFiles',
			title: localize2('modoOpenSpecFiles', 'Modo: Open Spec Files'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(IModoSpecService);
		const editorService = accessor.get(IEditorService);
		const quickInput = accessor.get(IQuickInputService);

		// Pick a spec if none active
		let specId = specService.activeSpecId;
		if (!specId) {
			if (specService.specs.length === 0) return;
			const pick = await quickInput.pick(
				specService.specs.map(s => ({ label: s.title, description: s.status, id: s.id })),
				{ placeHolder: 'Select a spec to open' }
			);
			if (!pick) return;
			specId = (pick as any).id;
		}

		const dirUri = specService.getSpecDirUri(specId!);
		if (!dirUri) return;

		const spec = specService.get(specId!);
		const reqFile = spec?.specType === 'bugfix' ? 'bugfix.md' : 'requirements.md';

		// Open all three files
		try {
			await editorService.openEditor({ resource: URI.joinPath(dirUri, reqFile) });
			await editorService.openEditor({ resource: URI.joinPath(dirUri, 'design.md') });
			await editorService.openEditor({ resource: URI.joinPath(dirUri, 'tasks.md') });
		} catch { /* some files may not exist yet */ }
	}
});

// --- Inject Spec Context into Chat (#spec) ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.injectSpecContext',
			title: localize2('modoInjectSpec', 'Modo: Inject Spec Context into Chat'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(IModoSpecService);
		const chatService = accessor.get(IChatThreadService);
		const quickInput = accessor.get(IQuickInputService);

		if (specService.specs.length === 0) return;

		// Let user pick which spec to inject
		const pick = await quickInput.pick(
			specService.specs.map(s => ({
				label: s.title,
				description: `${s.status} — ${s.tasks.filter(t => t.status === 'completed').length}/${s.tasks.length} tasks`,
				id: s.id,
			})),
			{ placeHolder: 'Select a spec to inject into chat context' }
		);
		if (!pick) return;

		const specId = (pick as any).id;

		// Reload from disk to get latest content
		await specService.reloadSpec(specId);

		const context = specService.getFullContext(specId);
		if (!context) return;

		const threadId = chatService.state.currentThreadId;
		await chatService.addUserMessageAndStreamResponse({
			userMessage: `[Spec context injected]\n\n<spec_context>\n${context}\n</spec_context>\n\nI've loaded the spec context above. How can I help with this spec?`,
			threadId,
		});
	}
});

// --- Reload Spec from Disk ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.reloadSpec',
			title: localize2('modoReloadSpec', 'Modo: Reload Active Spec from Disk'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const specService = accessor.get(IModoSpecService);
		const activeId = specService.activeSpecId;
		if (activeId) {
			await specService.reloadSpec(activeId);
		} else {
			await specService.loadAll();
		}
	}
});

// --- Initialize Modo Workspace ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.initWorkspace',
			title: localize2('modoInitWorkspace', 'Modo: Initialize Workspace'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const fileService = accessor.get(IFileService);
		const workspaceService = accessor.get(IWorkspaceContextService);

		const folders = workspaceService.getWorkspace().folders;
		if (folders.length === 0) return;

		const root = folders[0].uri;

		// Create .modo directory structure
		const dirs = ['steering', 'specs', 'hooks', 'settings'];
		for (const dir of dirs) {
			const dirUri = URI.joinPath(root, '.modo', dir);
			try {
				await fileService.createFolder(dirUri);
			} catch { /* already exists */ }
		}

		// Create default steering file
		const steeringUri = URI.joinPath(root, '.modo', 'steering', 'project.md');
		try {
			await fileService.readFile(steeringUri);
		} catch {
			const content = `---\ninclusion: always\ndescription: "Project-level conventions"\n---\n\n# Project Guidelines\n\nAdd your project conventions, architecture decisions, and coding standards here.\nThis file is always included in agent context.\n`;
			await fileService.createFile(steeringUri, VSBuffer.fromString(content));
		}

		// Create default .modorules
		const rulesUri = URI.joinPath(root, '.modorules');
		try {
			await fileService.readFile(rulesUri);
		} catch {
			const content = `# Modo Rules\n# Add project-specific rules for the AI agent here.\n# These are injected into every conversation.\n`;
			await fileService.createFile(rulesUri, VSBuffer.fromString(content));
		}
	}
});
