/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Modo Subagent Service — spawn parallel agents for subtasks.
 * Subagents have access to core tools (file R/W, shell, MCP)
 * and can work independently on delegated tasks.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export type SubagentStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface SubagentTask {
	id: string;
	name: string;
	prompt: string;
	status: SubagentStatus;
	result?: string;
	error?: string;
	threadId?: string; // The chat thread this subagent uses
	startedAt?: string;
	completedAt?: string;
}

// Callback type for running a subagent — wired from browser layer
export type SubagentRunner = (name: string, prompt: string) => Promise<{ threadId: string; result: string }>;

export interface IModoSubagentService {
	readonly _serviceBrand: undefined;
	readonly tasks: SubagentTask[];
	onDidChangeTasks: Event<void>;

	setRunner(runner: SubagentRunner): void;
	spawnSubagent(name: string, prompt: string): SubagentTask;
	getTask(id: string): SubagentTask | undefined;
	cancelTask(id: string): void;
	getRunningTasks(): SubagentTask[];
	getCompletedTasks(): SubagentTask[];
	clearCompleted(): void;
}

export const IModoSubagentService = createDecorator<IModoSubagentService>('ModoSubagentService');

class ModoSubagentService extends Disposable implements IModoSubagentService {
	_serviceBrand: undefined;

	private readonly _onDidChangeTasks = new Emitter<void>();
	readonly onDidChangeTasks: Event<void> = this._onDidChangeTasks.event;

	private _runner: SubagentRunner | undefined;
	tasks: SubagentTask[] = [];

	constructor() {
		super();
	}

	setRunner(runner: SubagentRunner): void {
		this._runner = runner;
	}

	spawnSubagent(name: string, prompt: string): SubagentTask {
		const task: SubagentTask = {
			id: Math.random().toString(36).slice(2, 10),
			name,
			prompt,
			status: 'running',
			startedAt: new Date().toISOString(),
		};

		this.tasks.push(task);
		this._onDidChangeTasks.fire();

		this._runSubagent(task).catch(err => {
			task.status = 'failed';
			task.error = err?.message || String(err);
			task.completedAt = new Date().toISOString();
			this._onDidChangeTasks.fire();
		});

		return task;
	}

	private async _runSubagent(task: SubagentTask): Promise<void> {
		if (!this._runner) {
			task.status = 'failed';
			task.error = 'No subagent runner configured';
			task.completedAt = new Date().toISOString();
			this._onDidChangeTasks.fire();
			return;
		}

		try {
			const { threadId, result } = await this._runner(task.name, task.prompt);
			task.threadId = threadId;
			task.status = 'completed';
			task.completedAt = new Date().toISOString();
			task.result = result;
			this._onDidChangeTasks.fire();
		} catch (err: any) {
			task.status = 'failed';
			task.error = err?.message || String(err);
			task.completedAt = new Date().toISOString();
			this._onDidChangeTasks.fire();
		}
	}

	getTask(id: string): SubagentTask | undefined {
		return this.tasks.find(t => t.id === id);
	}

	cancelTask(id: string): void {
		const task = this.tasks.find(t => t.id === id);
		if (task && task.status === 'running') {
			task.status = 'failed';
			task.error = 'Cancelled by user';
			task.completedAt = new Date().toISOString();
			this._onDidChangeTasks.fire();
		}
	}

	getRunningTasks(): SubagentTask[] {
		return this.tasks.filter(t => t.status === 'running');
	}

	getCompletedTasks(): SubagentTask[] {
		return this.tasks.filter(t => t.status === 'completed' || t.status === 'failed');
	}

	clearCompleted(): void {
		this.tasks = this.tasks.filter(t => t.status === 'running');
		this._onDidChangeTasks.fire();
	}
}

registerSingleton(IModoSubagentService, ModoSubagentService, InstantiationType.Delayed);
