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

class ModoHookWiring extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.modoHookWiring';

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IModoHookService private readonly hookService: IModoHookService,
	) {
		super();
		this._registerFileWatcher();
	}

	private _registerFileWatcher(): void {
		this._register(this.fileService.onDidFilesChange(event => {
			for (const uri of event.rawUpdated) {
				if (uri.fsPath.includes('.modo/')) continue;
				this.hookService.fireEvent({ type: 'fileEdited', filePath: uri.fsPath });
			}
			for (const uri of event.rawAdded) {
				if (uri.fsPath.includes('.modo/')) continue;
				this.hookService.fireEvent({ type: 'fileCreated', filePath: uri.fsPath });
			}
			for (const uri of event.rawDeleted) {
				if (uri.fsPath.includes('.modo/')) continue;
				this.hookService.fireEvent({ type: 'fileDeleted', filePath: uri.fsPath });
			}
		}));
	}
}

registerWorkbenchContribution2(ModoHookWiring.ID, ModoHookWiring, WorkbenchPhase.AfterRestored);
