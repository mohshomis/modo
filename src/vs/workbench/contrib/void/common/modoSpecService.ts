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
import { VSBuffer } from '../../../../base/common/buffer.js';

// --- Types ---

export type SpecStatus = 'draft' | 'in_progress' | 'completed' | 'archived';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type SpecType = 'feature' | 'bugfix';
export type WorkflowType = 'requirements-first' | 'design-first';

export interface SpecTask {
	id: string;
	title: string;
	description: string;
	status: TaskStatus;
	fileReferences: string[];
}

export interface SpecConfig {
	specId: string;
	specType: SpecType;
	workflowType: WorkflowType;
}

export interface Spec {
	id: string;
	title: string;
	status: SpecStatus;
	specType: SpecType;
	workflowType: WorkflowType;
	prompt: string;
	requirementsContent: string;
	designContent: string;
	tasksContent: string;
	tasks: SpecTask[];
	createdAt: string;
	updatedAt: string;
}

// --- Task Parsing ---

/** Parse tasks from a markdown checklist. Supports:
 *  - [ ] Task title
 *  - [x] Completed task
 *  - [ ] Task title: description text
 */
function parseTasksFromMarkdown(content: string): SpecTask[] {
	const tasks: SpecTask[] = [];
	const lines = content.split('\n');
	let taskIndex = 0;

	for (const line of lines) {
		// Match: - [ ] or - [x] or - [X] followed by text
		const match = line.match(/^[\s]*-\s*\[([ xX])\]\s*(.+)$/);
		if (!match) continue;

		const checked = match[1].toLowerCase() === 'x';
		const fullText = match[2].trim();

		// Split title: description on first colon
		const colonIdx = fullText.indexOf(':');
		let title: string;
		let description = '';
		if (colonIdx > 0 && colonIdx < fullText.length - 1) {
			title = fullText.slice(0, colonIdx).trim();
			description = fullText.slice(colonIdx + 1).trim();
		} else {
			title = fullText;
		}

		// Extract file references like `path/to/file.ts`
		const fileRefs: string[] = [];
		const codeRefs = fullText.match(/`([^`]+\.[a-zA-Z]+)`/g);
		if (codeRefs) {
			for (const ref of codeRefs) {
				fileRefs.push(ref.replace(/`/g, ''));
			}
		}

		taskIndex++;
		tasks.push({
			id: `task-${taskIndex}`,
			title,
			description,
			status: checked ? 'completed' : 'pending',
			fileReferences: fileRefs,
		});
	}

	return tasks;
}

/** Serialize tasks back to markdown checklist */
function serializeTasksToMarkdown(tasks: SpecTask[], originalContent: string): string {
	// If there's content before the first task, preserve it
	const lines = originalContent.split('\n');
	const headerLines: string[] = [];

	for (const line of lines) {
		if (/^[\s]*-\s*\[[ xX]\]/.test(line)) {
			break;
		}
		headerLines.push(line);
	}

	const taskLines = tasks.map(t => {
		const check = t.status === 'completed' ? 'x' : ' ';
		const text = t.description ? `${t.title}: ${t.description}` : t.title;
		return `- [${check}] ${text}`;
	});

	return [...headerLines, ...taskLines].join('\n');
}

/** Resolve #[[file:path]] references in content */
export function resolveFileReferences(content: string, specDirUri: URI): { path: string; uri: URI }[] {
	const refs: { path: string; uri: URI }[] = [];
	const pattern = /#\[\[file:([^\]]+)\]\]/g;
	let match;
	while ((match = pattern.exec(content)) !== null) {
		const relPath = match[1].trim();
		refs.push({
			path: relPath,
			uri: URI.joinPath(specDirUri, '..', '..', '..', relPath), // go up from .modo/specs/<id>/ to workspace root
		});
	}
	return refs;
}

// --- Service Interface ---

export interface IModoSpecService {
	readonly _serviceBrand: undefined;
	readonly specs: Spec[];
	readonly activeSpecId: string | undefined;
	onDidChangeSpecs: Event<void>;
	onDidChangeActiveSpec: Event<string | undefined>;

	loadAll(): Promise<void>;
	get(id: string): Spec | undefined;
	getSpecDirUri(specId: string): URI | undefined;
	createSpec(prompt: string, title: string, specType: SpecType, workflowType: WorkflowType): Promise<Spec>;
	setActiveSpec(id: string | undefined): void;
	updateStatus(id: string, status: SpecStatus): void;
	updateTaskStatus(specId: string, taskId: string, status: TaskStatus): Promise<void>;
	getNextTask(specId: string): { spec: Spec; task: SpecTask } | null;
	update(id: string, updates: Partial<Spec>): void;
	reloadSpec(id: string): Promise<void>;
	getFullContext(id: string): string;
	/** @deprecated Use createSpec instead */
	createFromPrompt(prompt: string, title?: string): Spec;
}

export const IModoSpecService = createDecorator<IModoSpecService>('ModoSpecService');

// --- Service Implementation ---

class ModoSpecService extends Disposable implements IModoSpecService {
	_serviceBrand: undefined;

	private readonly _onDidChangeSpecs = new Emitter<void>();
	readonly onDidChangeSpecs: Event<void> = this._onDidChangeSpecs.event;

	private readonly _onDidChangeActiveSpec = new Emitter<string | undefined>();
	readonly onDidChangeActiveSpec: Event<string | undefined> = this._onDidChangeActiveSpec.event;

	specs: Spec[] = [];
	activeSpecId: string | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) {
		super();
		this.loadAll();
	}

	private _getSpecsDirUri(): URI | undefined {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) return undefined;
		return URI.joinPath(folders[0].uri, '.modo', 'specs');
	}

	getSpecDirUri(specId: string): URI | undefined {
		const base = this._getSpecsDirUri();
		if (!base) return undefined;
		return URI.joinPath(base, specId);
	}

	async loadAll(): Promise<void> {
		this.specs = [];
		const dirUri = this._getSpecsDirUri();
		if (!dirUri) return;

		try {
			const stat = await this.fileService.resolve(dirUri);
			if (!stat.children) return;

			for (const child of stat.children) {
				if (!child.isDirectory) continue;
				try {
					await this._loadSpecFromDir(child.resource, child.name);
				} catch {
					// Skip unreadable spec dirs
				}
			}
		} catch {
			// .modo/specs/ doesn't exist yet
		}

		this._onDidChangeSpecs.fire();
	}

	private async _loadSpecFromDir(dirUri: URI, dirName: string): Promise<void> {
		// Read .config.modo
		let config: SpecConfig = {
			specId: dirName,
			specType: 'feature',
			workflowType: 'requirements-first',
		};
		try {
			const configContent = await this.fileService.readFile(URI.joinPath(dirUri, '.config.modo'));
			config = { ...config, ...JSON.parse(configContent.value.toString()) };
		} catch {
			// No config file, use defaults
		}

		// Read requirements.md or bugfix.md
		let requirementsContent = '';
		const reqFileName = config.specType === 'bugfix' ? 'bugfix.md' : 'requirements.md';
		try {
			const reqFile = await this.fileService.readFile(URI.joinPath(dirUri, reqFileName));
			requirementsContent = reqFile.value.toString();
		} catch { /* not yet created */ }

		// Read design.md
		let designContent = '';
		try {
			const designFile = await this.fileService.readFile(URI.joinPath(dirUri, 'design.md'));
			designContent = designFile.value.toString();
		} catch { /* not yet created */ }

		// Read tasks.md and parse tasks
		let tasksContent = '';
		let tasks: SpecTask[] = [];
		try {
			const tasksFile = await this.fileService.readFile(URI.joinPath(dirUri, 'tasks.md'));
			tasksContent = tasksFile.value.toString();
			tasks = parseTasksFromMarkdown(tasksContent);
		} catch { /* not yet created */ }

		// Derive title from requirements content or dir name
		let title = dirName;
		const titleMatch = requirementsContent.match(/^#\s+(.+)$/m);
		if (titleMatch) {
			title = titleMatch[1].replace(/^(Requirements|Bug Analysis)[:\s]*/i, '').trim() || dirName;
		}

		// Derive status from tasks
		let status: SpecStatus = 'draft';
		if (tasks.length > 0) {
			if (tasks.every(t => t.status === 'completed' || t.status === 'skipped')) {
				status = 'completed';
			} else if (tasks.some(t => t.status === 'in_progress' || t.status === 'completed')) {
				status = 'in_progress';
			}
		}

		const now = new Date().toISOString();
		this.specs.push({
			id: config.specId,
			title,
			status,
			specType: config.specType,
			workflowType: config.workflowType,
			prompt: '',
			requirementsContent,
			designContent,
			tasksContent,
			tasks,
			createdAt: now,
			updatedAt: now,
		});
	}

	async reloadSpec(id: string): Promise<void> {
		const dirUri = this.getSpecDirUri(id);
		if (!dirUri) return;

		// Remove old spec
		this.specs = this.specs.filter(s => s.id !== id);

		try {
			await this._loadSpecFromDir(dirUri, id);
		} catch { /* spec dir may not exist */ }

		this._onDidChangeSpecs.fire();
	}

	get(id: string): Spec | undefined {
		return this.specs.find(s => s.id === id);
	}

	async createSpec(prompt: string, title: string, specType: SpecType, workflowType: WorkflowType): Promise<Spec> {
		const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
		const now = new Date().toISOString();
		const dirUri = this.getSpecDirUri(id);
		if (!dirUri) throw new Error('No workspace folder open');

		// Write .config.modo
		const config: SpecConfig = { specId: id, specType, workflowType };
		await this.fileService.createFile(
			URI.joinPath(dirUri, '.config.modo'),
			VSBuffer.fromString(JSON.stringify(config, null, 2)),
			{ overwrite: true }
		);

		// Write requirements/bugfix file
		const reqFileName = specType === 'bugfix' ? 'bugfix.md' : 'requirements.md';
		const reqContent = specType === 'bugfix'
			? `# Bug Analysis\n\n## Bug Description\n${prompt}\n\n## Current Behavior\n<!-- To be filled by agent -->\n\n## Expected Behavior\n<!-- To be filled by agent -->\n\n## Reproduction Steps\n<!-- To be filled by agent -->\n`
			: `# Requirements: ${title}\n\n## Introduction\n${prompt}\n\n## User Stories\n<!-- To be filled by agent using EARS notation -->\n\n## Acceptance Criteria\n<!-- To be filled by agent -->\n\n## Constraints\n<!-- To be filled by agent -->\n`;
		await this.fileService.createFile(URI.joinPath(dirUri, reqFileName), VSBuffer.fromString(reqContent), { overwrite: true });

		// Write design.md
		const designContent = `# Design: ${title}\n\n## Overview\n<!-- To be filled by agent -->\n\n## Architecture\n<!-- To be filled by agent -->\n\n## Components\n<!-- To be filled by agent -->\n\n## Error Handling\n<!-- To be filled by agent -->\n\n## Testing Strategy\n<!-- To be filled by agent -->\n`;
		await this.fileService.createFile(URI.joinPath(dirUri, 'design.md'), VSBuffer.fromString(designContent), { overwrite: true });

		// Write tasks.md
		const tasksContent = `# Tasks: ${title}\n\n<!-- Tasks will be generated from the design document -->\n`;
		await this.fileService.createFile(URI.joinPath(dirUri, 'tasks.md'), VSBuffer.fromString(tasksContent), { overwrite: true });

		const spec: Spec = {
			id,
			title,
			status: 'draft',
			specType,
			workflowType,
			prompt,
			requirementsContent: reqContent,
			designContent,
			tasksContent,
			tasks: [],
			createdAt: now,
			updatedAt: now,
		};

		this.specs.push(spec);
		this._onDidChangeSpecs.fire();
		return spec;
	}

	/** @deprecated Use createSpec instead */
	createFromPrompt(prompt: string, title?: string): Spec {
		const id = Math.random().toString(36).slice(2, 10);
		const now = new Date().toISOString();
		const spec: Spec = {
			id,
			title: title ?? `Spec ${id}`,
			status: 'draft',
			specType: 'feature',
			workflowType: 'requirements-first',
			prompt,
			requirementsContent: '',
			designContent: '',
			tasksContent: '',
			tasks: [],
			createdAt: now,
			updatedAt: now,
		};
		this.specs.push(spec);
		this._onDidChangeSpecs.fire();
		// Fire async disk write but don't block
		this.createSpec(prompt, spec.title, 'feature', 'requirements-first').catch(() => { });
		return spec;
	}

	setActiveSpec(id: string | undefined): void {
		this.activeSpecId = id;
		this._onDidChangeActiveSpec.fire(id);
	}

	updateStatus(id: string, status: SpecStatus): void {
		const spec = this.get(id);
		if (!spec) return;
		spec.status = status;
		spec.updatedAt = new Date().toISOString();
		this._onDidChangeSpecs.fire();
	}

	async updateTaskStatus(specId: string, taskId: string, status: TaskStatus): Promise<void> {
		const spec = this.get(specId);
		if (!spec) return;

		const task = spec.tasks.find(t => t.id === taskId);
		if (!task) return;

		task.status = status;
		spec.updatedAt = new Date().toISOString();

		// Auto-complete spec if all tasks done
		if (spec.tasks.every(t => t.status === 'completed' || t.status === 'skipped')) {
			spec.status = 'completed';
		} else if (spec.tasks.some(t => t.status === 'in_progress' || t.status === 'completed')) {
			spec.status = 'in_progress';
		}

		// Persist task status to tasks.md
		const dirUri = this.getSpecDirUri(specId);
		if (dirUri && spec.tasksContent) {
			const updated = serializeTasksToMarkdown(spec.tasks, spec.tasksContent);
			spec.tasksContent = updated;
			try {
				await this.fileService.writeFile(
					URI.joinPath(dirUri, 'tasks.md'),
					VSBuffer.fromString(updated)
				);
			} catch { /* best effort */ }
		}

		this._onDidChangeSpecs.fire();
	}

	getNextTask(specId: string): { spec: Spec; task: SpecTask } | null {
		const spec = this.get(specId);
		if (!spec) return null;
		const task = spec.tasks.find(t => t.status === 'pending');
		if (!task) return null;
		return { spec, task };
	}

	update(id: string, updates: Partial<Spec>): void {
		const spec = this.get(id);
		if (!spec) return;
		Object.assign(spec, updates, { updatedAt: new Date().toISOString() });
		this._onDidChangeSpecs.fire();
	}

	/** Build full context string for injecting into chat when user types #spec */
	getFullContext(id: string): string {
		const spec = this.get(id);
		if (!spec) return '';

		const sections: string[] = [];
		sections.push(`# Spec: ${spec.title} (${spec.status})`);
		sections.push(`Type: ${spec.specType} | Workflow: ${spec.workflowType}`);

		if (spec.requirementsContent) {
			sections.push(`\n## Requirements\n${spec.requirementsContent}`);
		}
		if (spec.designContent) {
			sections.push(`\n## Design\n${spec.designContent}`);
		}
		if (spec.tasksContent) {
			sections.push(`\n## Tasks\n${spec.tasksContent}`);
		}

		return sections.join('\n');
	}
}

registerSingleton(IModoSpecService, ModoSpecService, InstantiationType.Delayed);
