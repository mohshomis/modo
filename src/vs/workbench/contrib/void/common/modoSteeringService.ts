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

// --- Types ---

export type SteeringInclusion = 'always' | 'fileMatch' | 'manual';

export interface SteeringFile {
	name: string;
	path: string;
	inclusion: SteeringInclusion;
	fileMatchPattern?: string;
	description?: string;
	content: string;
}

// --- Service Interface ---

export interface IModoSteeringService {
	readonly _serviceBrand: undefined;
	readonly files: SteeringFile[];
	onDidChangeFiles: Event<void>;

	loadAll(): Promise<void>;
	getAlwaysIncluded(): SteeringFile[];
	getMatchingFile(filePath: string): SteeringFile[];
	getManual(name: string): SteeringFile | undefined;
	buildContext(opts: {
		activeFilePath?: string;
		manualNames?: string[];
	}): string;
}

export const IModoSteeringService = createDecorator<IModoSteeringService>('ModoSteeringService');

// --- Helpers ---

function parseFrontMatter(raw: string): { data: Record<string, string>; content: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return { data: {}, content: raw.trim() };

	const data: Record<string, string> = {};
	for (const line of match[1].split('\n')) {
		const colonIdx = line.indexOf(':');
		if (colonIdx === -1) continue;
		const key = line.slice(0, colonIdx).trim();
		let val = line.slice(colonIdx + 1).trim();
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		data[key] = val;
	}
	return { data, content: match[2].trim() };
}

// Simple glob match for fileMatchPattern
function simpleGlobMatch(pattern: string, filePath: string): boolean {
	try {
		// Convert glob to regex: ** = any path, * = any segment
		const regexStr = pattern
			.replace(/\./g, '\\.')
			.replace(/\*\*/g, '{{GLOBSTAR}}')
			.replace(/\*/g, '[^/]*')
			.replace(/\{\{GLOBSTAR\}\}/g, '.*');
		return new RegExp(`^${regexStr}$`).test(filePath);
	} catch {
		// If pattern is invalid, fall back to simple string comparison
		return filePath.includes(pattern.replace(/\*\*/g, '').replace(/\*/g, ''));
	}
}

// --- Service Implementation ---

class ModoSteeringService extends Disposable implements IModoSteeringService {
	_serviceBrand: undefined;

	private readonly _onDidChangeFiles = new Emitter<void>();
	readonly onDidChangeFiles: Event<void> = this._onDidChangeFiles.event;

	files: SteeringFile[] = [];

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) {
		super();
		this.loadAll();
	}

	private getSteeringDirUri(): URI | undefined {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) return undefined;
		return URI.joinPath(folders[0].uri, '.modo', 'steering');
	}

	async loadAll(): Promise<void> {
		this.files = [];
		const dirUri = this.getSteeringDirUri();
		if (!dirUri) return;

		try {
			const stat = await this.fileService.resolve(dirUri);
			if (!stat.children) return;

			for (const child of stat.children) {
				if (!child.name.endsWith('.md')) continue;
				try {
					const content = await this.fileService.readFile(child.resource);
					const raw = content.value.toString();
					const { data, content: body } = parseFrontMatter(raw);

					this.files.push({
						name: child.name.replace(/\.md$/, ''),
						path: child.resource.fsPath,
						inclusion: (data['inclusion'] as SteeringInclusion) ?? 'always',
						fileMatchPattern: data['fileMatchPattern'],
						description: data['description'],
						content: body,
					});
				} catch {
					// Skip unreadable files
				}
			}
		} catch {
			// .modo/steering/ doesn't exist yet — that's fine
		}

		this._onDidChangeFiles.fire();
	}

	getAlwaysIncluded(): SteeringFile[] {
		return this.files.filter(f => f.inclusion === 'always');
	}

	getMatchingFile(filePath: string): SteeringFile[] {
		return this.files.filter(f =>
			f.inclusion === 'fileMatch' &&
			f.fileMatchPattern &&
			simpleGlobMatch(f.fileMatchPattern, filePath)
		);
	}

	getManual(name: string): SteeringFile | undefined {
		return this.files.find(f => f.name === name && f.inclusion === 'manual');
	}

	buildContext(opts: { activeFilePath?: string; manualNames?: string[] }): string {
		const sections: SteeringFile[] = [];

		// Always-included
		sections.push(...this.getAlwaysIncluded());

		// File-matched
		if (opts.activeFilePath) {
			sections.push(...this.getMatchingFile(opts.activeFilePath));
		}

		// Manual
		if (opts.manualNames) {
			for (const name of opts.manualNames) {
				const manual = this.getManual(name);
				if (manual) sections.push(manual);
			}
		}

		// Deduplicate
		const seen = new Set<string>();
		const unique = sections.filter(s => {
			if (seen.has(s.name)) return false;
			seen.add(s.name);
			return true;
		});

		return unique
			.map(s => {
				// Resolve #[[file:path]] references
				let content = s.content;
				content = this._resolveFileReferences(content);
				return `<!-- steering: ${s.name} -->\n${content}`;
			})
			.join('\n\n');
	}

	/** Resolve #[[file:path]] references by reading the referenced files */
	private _resolveFileReferences(content: string): string {
		// We can't do async here, so we just mark the references for the caller
		// In practice, the LLM will see the reference and can use tools to read the file
		// But we annotate them clearly
		return content.replace(
			/#\[\[file:([^\]]+)\]\]/g,
			(_match, filePath: string) => `[Referenced file: ${filePath.trim()} — use read_file tool to access]`
		);
	}
}

registerSingleton(IModoSteeringService, ModoSteeringService, InstantiationType.Delayed);
