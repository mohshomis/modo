/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Modo Explorer Pane — Kiro-style dedicated view in the primary sidebar.
 * Shows: Specs, Hooks, Steering, MCP Servers as expandable tree sections.
 */

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, ViewContainerLocation, IViewsRegistry, Extensions as ViewExtensions } from '../../../common/views.js';
import * as nls from '../../../../nls.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { IModoSpecService } from '../common/modoSpecService.js';
import { IModoHookService } from '../common/modoHookService.js';
import { IModoSteeringService } from '../common/modoSteeringService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

// --- Specs View ---

class ModoSpecsViewPane extends ViewPane {
	static readonly ID = 'modo.specsView';

	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IModoSpecService private readonly specService: IModoSpecService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		parent.style.padding = '8px';
		parent.style.fontSize = '12px';
		parent.style.color = 'var(--vscode-foreground)';

		const render = () => {
			parent.innerHTML = '';
			const specs = this.specService.specs;

			// Create new spec button
			const createBtn = document.createElement('button');
			createBtn.textContent = '+ New Spec';
			createBtn.style.cssText = 'width:100%;padding:4px 8px;margin-bottom:8px;cursor:pointer;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;font-size:11px;';
			createBtn.onclick = () => this.commandService.executeCommand('modo.createSpec');
			parent.appendChild(createBtn);

			if (specs.length === 0) {
				const empty = document.createElement('div');
				empty.style.opacity = '0.6';
				empty.style.padding = '8px 0';
				empty.textContent = 'No specs yet. Use Cmd+Shift+S or the button above.';
				parent.appendChild(empty);
			} else {
				for (const spec of specs) {
					const item = document.createElement('div');
					item.style.cssText = 'padding:6px 4px;cursor:pointer;border-radius:3px;margin-bottom:2px;';
					item.onmouseenter = () => { item.style.background = 'var(--vscode-list-hoverBackground)'; };
					item.onmouseleave = () => { item.style.background = 'transparent'; };

					const isActive = spec.id === this.specService.activeSpecId;
					if (isActive) {
						item.style.background = 'var(--vscode-list-activeSelectionBackground)';
						item.style.color = 'var(--vscode-list-activeSelectionForeground)';
					}

					const done = spec.tasks.filter(t => t.status === 'completed').length;
					const total = spec.tasks.length;
					const statusIcon = spec.status === 'completed' ? '\u2713' : spec.status === 'in_progress' ? '\u25B6' : '\u25CB';
					const typeIcon = spec.specType === 'bugfix' ? '\uD83D\uDC1B' : '\uD83D\uDCCB';

					// Title row
					const titleRow = document.createElement('div');
					titleRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
					titleRow.innerHTML = `<span>${typeIcon}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${spec.title}</span><span style="font-size:10px;opacity:0.7;">${statusIcon}</span>`;
					item.appendChild(titleRow);

					// Progress row
					if (total > 0) {
						const progressRow = document.createElement('div');
						progressRow.style.cssText = 'margin-top:3px;display:flex;align-items:center;gap:4px;font-size:10px;opacity:0.7;';
						const pct = Math.round(done / total * 100);
						progressRow.innerHTML = `<div style="flex:1;height:2px;background:var(--vscode-progressBar-background);border-radius:1px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--vscode-progressBar-foreground,#0078d4);"></div></div><span>${done}/${total}</span>`;
						item.appendChild(progressRow);
					}

					// Click to open spec files and set active
					item.onclick = () => {
						this.specService.setActiveSpec(spec.id);
						const dirUri = this.specService.getSpecDirUri(spec.id);
						if (dirUri) {
							const reqFile = spec.specType === 'bugfix' ? 'bugfix.md' : 'requirements.md';
							this.editorService.openEditor({ resource: URI.joinPath(dirUri, reqFile) }).catch(() => { });
						}
					};

					// Double-click to open all files
					item.ondblclick = () => {
						this.commandService.executeCommand('modo.openSpecFiles');
					};

					parent.appendChild(item);
				}
			}
		};

		render();
		this._register(this.specService.onDidChangeSpecs(() => render()));
		this._register(this.specService.onDidChangeActiveSpec(() => render()));
	}
}

// --- Hooks View ---

class ModoHooksViewPane extends ViewPane {
	static readonly ID = 'modo.hooksView';

	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IModoHookService private readonly hookService: IModoHookService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		parent.style.padding = '8px';
		parent.style.fontSize = '12px';

		const render = () => {
			parent.innerHTML = '';
			const hooks = this.hookService.hooks;
			if (hooks.length === 0) {
				const empty = document.createElement('div');
				empty.style.opacity = '0.6';
				empty.style.padding = '8px 0';
				empty.textContent = 'No hooks. Add JSON files to .modo/hooks/';
				parent.appendChild(empty);
			} else {
				for (const hook of hooks) {
					const item = document.createElement('div');
					item.style.cssText = 'padding:4px;cursor:pointer;border-radius:3px;margin-bottom:2px;';
					item.onmouseenter = () => { item.style.background = 'var(--vscode-list-hoverBackground)'; };
					item.onmouseleave = () => { item.style.background = 'transparent'; };

					const eventLabel = hook.when.type;
					const actionLabel = hook.then.type === 'askAgent' ? 'Ask Agent' : 'Run Command';
					item.innerHTML = `<div style="display:flex;align-items:center;gap:4px;"><span style="flex:1;">${hook.name}</span><span style="font-size:10px;opacity:0.6;">${eventLabel}</span></div><div style="font-size:10px;opacity:0.5;margin-top:2px;">${eventLabel} → ${actionLabel}</div>`;

					// Click to open the hook JSON file
					if (hook.fileName) {
						item.onclick = () => {
							const folders = this.workspaceService.getWorkspace().folders;
							if (folders.length > 0) {
								const hookUri = URI.joinPath(folders[0].uri, '.modo', 'hooks', hook.fileName!);
								this.editorService.openEditor({ resource: hookUri }).catch(() => { });
							}
						};
					}

					parent.appendChild(item);
				}
			}
		};

		render();
		this._register(this.hookService.onDidChangeHooks(() => render()));
	}
}

// --- Steering View ---

class ModoSteeringViewPane extends ViewPane {
	static readonly ID = 'modo.steeringView';

	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IModoSteeringService private readonly steeringService: IModoSteeringService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		parent.style.padding = '8px';
		parent.style.fontSize = '12px';

		const render = () => {
			parent.innerHTML = '';
			const files = this.steeringService.files;
			if (files.length === 0) {
				const empty = document.createElement('div');
				empty.style.opacity = '0.6';
				empty.style.padding = '8px 0';
				empty.textContent = 'No steering files. Add .md files to .modo/steering/';
				parent.appendChild(empty);
			} else {
				for (const file of files) {
					const item = document.createElement('div');
					item.style.cssText = 'padding:4px;cursor:pointer;border-radius:3px;margin-bottom:2px;display:flex;align-items:center;gap:4px;';
					item.onmouseenter = () => { item.style.background = 'var(--vscode-list-hoverBackground)'; };
					item.onmouseleave = () => { item.style.background = 'transparent'; };

					const inclusionIcon = file.inclusion === 'always' ? '\u2713' : file.inclusion === 'fileMatch' ? '\u2699' : '\u270B';
					const inclusionLabel = file.inclusion === 'always' ? 'auto' : file.inclusion === 'fileMatch' ? `match: ${file.fileMatchPattern || ''}` : 'manual';
					item.innerHTML = `<span>${inclusionIcon}</span><span style="flex:1;">${file.name}</span><span style="font-size:10px;opacity:0.5;">${inclusionLabel}</span>`;

					// Click to open the steering file
					if (file.path) {
						item.onclick = () => {
							this.editorService.openEditor({ resource: URI.file(file.path) }).catch(() => { });
						};
					}

					parent.appendChild(item);
				}
			}
		};

		render();
		this._register(this.steeringService.onDidChangeFiles(() => render()));
	}
}

// --- Register the Modo view container in the primary sidebar ---

export const MODO_EXPLORER_CONTAINER_ID = 'workbench.view.modoExplorer';

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
const modoContainer = viewContainerRegistry.registerViewContainer({
	id: MODO_EXPLORER_CONTAINER_ID,
	title: nls.localize2('modoExplorer', 'Modo'),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [MODO_EXPLORER_CONTAINER_ID, {
		mergeViewWithContainerWhenSingleView: false,
		orientation: Orientation.VERTICAL,
	}]),
	hideIfEmpty: false,
	order: 10,
	icon: Codicon.compass,
}, ViewContainerLocation.Sidebar);

// Register views inside the container
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

viewsRegistry.registerViews([
	{
		id: ModoSpecsViewPane.ID,
		name: nls.localize2('modoSpecs', 'Specs'),
		ctorDescriptor: new SyncDescriptor(ModoSpecsViewPane),
		canToggleVisibility: true,
		canMoveView: false,
		weight: 40,
		order: 1,
		collapsed: false,
	},
	{
		id: ModoHooksViewPane.ID,
		name: nls.localize2('modoHooks', 'Agent Hooks'),
		ctorDescriptor: new SyncDescriptor(ModoHooksViewPane),
		canToggleVisibility: true,
		canMoveView: false,
		weight: 30,
		order: 2,
		collapsed: true,
	},
	{
		id: ModoSteeringViewPane.ID,
		name: nls.localize2('modoSteering', 'Agent Steering'),
		ctorDescriptor: new SyncDescriptor(ModoSteeringViewPane),
		canToggleVisibility: true,
		canMoveView: false,
		weight: 30,
		order: 3,
		collapsed: true,
	},
], modoContainer);

// Add Powers view
import { IModoPowersService } from '../common/modoPowersService.js';

class ModoPowersViewPane extends ViewPane {
	static readonly ID = 'modo.powersView';

	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IModoPowersService private readonly powersService: IModoPowersService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		parent.style.padding = '8px';
		parent.style.fontSize = '12px';

		const render = () => {
			parent.innerHTML = '';
			const powers = this.powersService.powers.filter(p => p.installed);
			if (powers.length === 0) {
				const empty = document.createElement('div');
				empty.style.opacity = '0.6';
				empty.style.padding = '8px 0';
				empty.textContent = 'No powers installed.';
				parent.appendChild(empty);
			} else {
				for (const power of powers) {
					const item = document.createElement('div');
					item.style.padding = '4px 0';
					item.style.cursor = 'pointer';
					const status = power.active ? '[active]' : '[installed]';
					item.textContent = `${status} ${power.displayName}`;
					item.onclick = () => {
						if (power.active) {
							this.powersService.deactivate(power.name);
						} else {
							this.powersService.activate(power.name);
						}
					};
					parent.appendChild(item);
				}
			}
		};

		render();
		this._register(this.powersService.onDidChangePowers(() => render()));
	}
}

viewsRegistry.registerViews([
	{
		id: ModoPowersViewPane.ID,
		name: nls.localize2('modoPowers', 'Powers'),
		ctorDescriptor: new SyncDescriptor(ModoPowersViewPane),
		canToggleVisibility: true,
		canMoveView: false,
		weight: 20,
		order: 4,
		collapsed: true,
	},
], modoContainer);
