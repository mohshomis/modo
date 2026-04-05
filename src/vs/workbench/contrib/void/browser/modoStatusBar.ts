/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Modo status bar items:
 * - Autonomy mode toggle (Autopilot / Supervised) — wired to auto-approve settings
 * - Active spec indicator with task progress
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor } from '../../../services/statusbar/browser/statusbar.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { IModoSpecService } from '../common/modoSpecService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';

// --- Autonomy Mode State ---

export type AutonomyMode = 'autopilot' | 'supervised';
let currentAutonomyMode: AutonomyMode = 'supervised';

export function getAutonomyMode(): AutonomyMode {
	return currentAutonomyMode;
}

// --- Status Bar Contribution ---

class ModoStatusBarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.modoStatusBar';

	private autonomyEntry: IStatusbarEntryAccessor | undefined;
	private specEntry: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IModoSpecService private readonly specService: IModoSpecService,
		@IVoidSettingsService _settingsService: IVoidSettingsService,
	) {
		super();
		this._createAutonomyIndicator();
		this._createSpecIndicator();

		this._register(this.specService.onDidChangeSpecs(() => this._updateSpecIndicator()));
		this._register(this.specService.onDidChangeActiveSpec(() => this._updateSpecIndicator()));
	}

	private _createAutonomyIndicator(): void {
		this.autonomyEntry = this.statusbarService.addEntry(
			{
				name: 'Modo Autonomy',
				text: '$(shield) Supervised',
				ariaLabel: 'Modo Supervised mode',
				tooltip: 'Modo: Supervised mode — agent asks before acting. Click to toggle.',
				command: 'modo.toggleAutonomy',
			},
			'modo.autonomyMode',
			StatusbarAlignment.LEFT,
			100,
		);
	}

	private _createSpecIndicator(): void {
		this.specEntry = this.statusbarService.addEntry(
			{
				name: 'Modo Spec',
				text: '',
				ariaLabel: 'No active spec',
				tooltip: 'No active spec. Click to select one.',
				command: 'modo.injectSpecContext',
			},
			'modo.activeSpec',
			StatusbarAlignment.LEFT,
			99,
		);
		this._updateSpecIndicator();
	}

	private _updateSpecIndicator(): void {
		if (!this.specEntry) return;

		const activeId = this.specService.activeSpecId;
		if (!activeId) {
			this.specEntry.update({ name: 'Modo Spec', text: '', ariaLabel: 'No active spec', tooltip: 'No active spec. Click to select one.', command: 'modo.injectSpecContext' });
			return;
		}

		const spec = this.specService.get(activeId);
		if (!spec) {
			this.specEntry.update({ name: 'Modo Spec', text: '', ariaLabel: 'No active spec', tooltip: 'No active spec', command: 'modo.injectSpecContext' });
			return;
		}

		const done = spec.tasks.filter(t => t.status === 'completed').length;
		const total = spec.tasks.length;
		const statusIcon = spec.status === 'completed' ? '$(check)' : spec.status === 'in_progress' ? '$(sync~spin)' : '$(tasklist)';
		this.specEntry.update({
			name: 'Modo Spec',
			text: `${statusIcon} ${spec.title.slice(0, 30)} (${done}/${total})`,
			ariaLabel: `Active spec: ${spec.title}, ${done} of ${total} tasks done`,
			tooltip: `Active spec: ${spec.title} — ${done}/${total} tasks done. Click to open.`,
			command: 'modo.openSpecFiles',
		});
	}

	updateAutonomyDisplay(): void {
		if (!this.autonomyEntry) return;
		if (currentAutonomyMode === 'autopilot') {
			this.autonomyEntry.update({
				name: 'Modo Autonomy',
				text: '$(play-circle) Autopilot',
				ariaLabel: 'Modo Autopilot mode',
				tooltip: 'Modo: Autopilot mode — agent executes directly. Click to toggle.',
				command: 'modo.toggleAutonomy',
			});
		} else {
			this.autonomyEntry.update({
				name: 'Modo Autonomy',
				text: '$(shield) Supervised',
				ariaLabel: 'Modo Supervised mode',
				tooltip: 'Modo: Supervised mode — agent asks before acting. Click to toggle.',
				command: 'modo.toggleAutonomy',
			});
		}
	}
}

// --- Toggle Action ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'modo.toggleAutonomy',
			title: localize2('modoToggleAutonomy', 'Modo: Toggle Autopilot/Supervised'),
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		const settingsService = accessor.get(IVoidSettingsService);

		currentAutonomyMode = currentAutonomyMode === 'autopilot' ? 'supervised' : 'autopilot';

		// Wire autonomy mode to the auto-approve settings
		const isAutopilot = currentAutonomyMode === 'autopilot';
		try {
			// Toggle auto-approve for edits, terminal, and MCP tools
			const currentSettings = settingsService.state.globalSettings;
			const newAutoApprove = {
				...currentSettings.autoApprove,
				'edits': isAutopilot,
				'terminal': isAutopilot,
				'MCP tools': isAutopilot,
			};
			settingsService.setGlobalSetting('autoApprove', newAutoApprove);
		} catch {
			// Settings service may not support this method directly
		}
	}
});

registerWorkbenchContribution2(ModoStatusBarContribution.ID, ModoStatusBarContribution, WorkbenchPhase.AfterRestored);
