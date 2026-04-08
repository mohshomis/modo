/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * ModoHookWiring — connects VS Code events to the Modo hook system.
 *
 * Listens for:
 * - File changes (fileEdited, fileCreated, fileDeleted)
 * - Registers as a workbench contribution so it starts automatically
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IModoHookService } from '../common/modoHookService.js';
import { debounce } from '../../../../base/common/async.js';

class ModoHookWiring extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.modoHookWiring';

	private readonly _fireEventsDebounced: () => void;
	private _pendingEvents: Array<{ type: 'fileEdited' | 'fileCreated' | 'fileDeleted'; filePath: string }> = [];

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IModoHookService private readonly hookService: IModoHookService,
	) {
		super();
		this._registerFileWatcher();
		// Debounce to avoid firing too many hooks for rapid file changes
		this._fireEventsDebounced = this._doFireEvents(
			debounce(() => this._flushPendingEvents(), 500)
		);
	}

	private _registerFileWatcher(): void {
		this._register(this.fileService.onDidFilesChange(event => {
			for (const uri of event.rawUpdated) {
				if (uri.fsPath.includes('.modo/')) continue;
				this._pendingEvents.push({ type: 'fileEdited', filePath: uri.fsPath });
			}
			for (const uri of event.rawAdded) {
				if (uri.fsPath.includes('.modo/')) continue;
				this._pendingEvents.push({ type: 'fileCreated', filePath: uri.fsPath });
			}
			for (const uri of event.rawDeleted) {
				if (uri.fsPath.includes('.modo/')) continue;
				this._pendingEvents.push({ type: 'fileDeleted', filePath: uri.fsPath });
			}
			this._fireEventsDebounced();
		}));
	}

	private _flushPendingEvents(): void {
		if (this._pendingEvents.length === 0) return;

		const eventsToFire = this._pendingEvents;
		this._pendingEvents = [];

		for (const event of eventsToFire) {
			this.hookService.fireEvent(event).catch(err => {
				// Silently fail to avoid spamming console
				if (err) console.error('[ModoHookWiring] Hook failed:', err);
			});
		}
	}

	private _doFireEvents(fn: () => void): () => void {
		return fn;
	}
}

registerWorkbenchContribution2(ModoHookWiring.ID, ModoHookWiring, WorkbenchPhase.AfterRestored);
