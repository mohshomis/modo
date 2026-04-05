/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Modo Powers Service — installable knowledge packages.
 * Powers bundle documentation, steering files, and MCP server configs
 * that can be activated on-demand based on keywords.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export interface PowerDefinition {
	name: string;
	displayName: string;
	description: string;
	keywords: string[];
	version: string;
	steeringFiles?: string[];
	mcpServers?: Record<string, { command: string; args?: string[] }>;
	documentation?: string;
	installed: boolean;
	active: boolean;
}

export interface IModoPowersService {
	readonly _serviceBrand: undefined;
	readonly powers: PowerDefinition[];
	onDidChangePowers: Event<void>;

	loadAll(): Promise<void>;
	install(name: string): Promise<void>;
	installFromUrl(url: string): Promise<PowerDefinition>;
	uninstall(name: string): Promise<void>;
	activate(name: string): void;
	deactivate(name: string): void;
	togglePower(name: string): void;
	getActivePowers(): PowerDefinition[];
	findByKeyword(keyword: string): PowerDefinition[];
	getInstalledPowers(): PowerDefinition[];
	getAvailablePowers(): PowerDefinition[];
}

export const IModoPowersService = createDecorator<IModoPowersService>('ModoPowersService');

class ModoPowersService extends Disposable implements IModoPowersService {
	_serviceBrand: undefined;

	private readonly _onDidChangePowers = new Emitter<void>();
	readonly onDidChangePowers: Event<void> = this._onDidChangePowers.event;

	powers: PowerDefinition[] = [];

	constructor() {
		super();
		this._registerBuiltinPowers();
	}

	private _registerBuiltinPowers(): void {
		// Built-in powers that come with Modo
		this.powers = [
			{
				name: 'typescript-best-practices',
				displayName: 'TypeScript Best Practices',
				description: 'Steering for TypeScript projects with strict mode, proper typing, and modern patterns.',
				keywords: ['typescript', 'ts', 'type', 'interface', 'generic'],
				version: '1.0.0',
				installed: true,
				active: false,
			},
			{
				name: 'react-patterns',
				displayName: 'React Patterns',
				description: 'Component patterns, hooks best practices, and performance optimization for React.',
				keywords: ['react', 'jsx', 'tsx', 'component', 'hook', 'useState', 'useEffect'],
				version: '1.0.0',
				installed: true,
				active: false,
			},
			{
				name: 'testing-standards',
				displayName: 'Testing Standards',
				description: 'Testing conventions for vitest, jest, and testing-library.',
				keywords: ['test', 'spec', 'vitest', 'jest', 'testing', 'mock', 'assert'],
				version: '1.0.0',
				installed: true,
				active: false,
			},
			{
				name: 'api-design',
				displayName: 'API Design',
				description: 'REST API design patterns, OpenAPI spec integration, and endpoint conventions.',
				keywords: ['api', 'rest', 'endpoint', 'openapi', 'swagger', 'route'],
				version: '1.0.0',
				installed: true,
				active: false,
			},
			{
				name: 'docker-deployment',
				displayName: 'Docker & Deployment',
				description: 'Dockerfile best practices, docker-compose patterns, and CI/CD conventions.',
				keywords: ['docker', 'container', 'deploy', 'ci', 'cd', 'pipeline', 'kubernetes'],
				version: '1.0.0',
				installed: false,
				active: false,
			},
		];
	}

	async loadAll(): Promise<void> {
		// In a full implementation, this would read from .modo/powers/
		this._onDidChangePowers.fire();
	}

	async install(name: string): Promise<void> {
		const power = this.powers.find(p => p.name === name);
		if (power) {
			power.installed = true;
			this._onDidChangePowers.fire();
		}
	}

	async installFromUrl(url: string): Promise<PowerDefinition> {
		// In a full implementation, this would:
		// 1. Fetch the power manifest from the URL
		// 2. Download steering files, MCP configs, docs
		// 3. Save to .modo/powers/<name>/
		// For now, create a placeholder from the URL
		const name = url.split('/').pop()?.replace(/\.json$/, '') || 'custom-power';
		const power: PowerDefinition = {
			name,
			displayName: name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
			description: `Custom power installed from ${url}`,
			keywords: [name],
			version: '1.0.0',
			installed: true,
			active: false,
		};
		this.powers.push(power);
		this._onDidChangePowers.fire();
		return power;
	}

	async uninstall(name: string): Promise<void> {
		const power = this.powers.find(p => p.name === name);
		if (power) {
			power.installed = false;
			power.active = false;
			this._onDidChangePowers.fire();
		}
	}

	activate(name: string): void {
		const power = this.powers.find(p => p.name === name);
		if (power && power.installed) {
			power.active = true;
			this._onDidChangePowers.fire();
		}
	}

	deactivate(name: string): void {
		const power = this.powers.find(p => p.name === name);
		if (power) {
			power.active = false;
			this._onDidChangePowers.fire();
		}
	}

	togglePower(name: string): void {
		const power = this.powers.find(p => p.name === name);
		if (power && power.installed) {
			power.active = !power.active;
			this._onDidChangePowers.fire();
		}
	}

	getActivePowers(): PowerDefinition[] {
		return this.powers.filter(p => p.active);
	}

	getInstalledPowers(): PowerDefinition[] {
		return this.powers.filter(p => p.installed);
	}

	getAvailablePowers(): PowerDefinition[] {
		return this.powers.filter(p => !p.installed);
	}

	findByKeyword(keyword: string): PowerDefinition[] {
		const lower = keyword.toLowerCase();
		return this.powers.filter(p =>
			p.installed && p.keywords.some(k => lower.includes(k) || k.includes(lower))
		);
	}
}

registerSingleton(IModoPowersService, ModoPowersService, InstantiationType.Delayed);
