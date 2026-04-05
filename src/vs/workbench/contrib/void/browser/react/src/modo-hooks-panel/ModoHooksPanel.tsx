/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useState, useEffect } from 'react'
import { useAccessor } from '../util/services.js'

interface HookDef {
	name: string
	version: string
	description?: string
	when: { type: string; patterns?: string[]; toolTypes?: string[] }
	then: { type: string; prompt?: string; command?: string }
	fileName?: string
}

const EVENT_INFO: Record<string, { label: string; icon: string }> = {
	fileEdited: { label: 'File Edited', icon: '' },
	fileCreated: { label: 'File Created', icon: '' },
	fileDeleted: { label: 'File Deleted', icon: '' },
	userTriggered: { label: 'Manual', icon: '' },
	promptSubmit: { label: 'Prompt', icon: '' },
	agentStop: { label: 'Agent Stop', icon: '' },
	preToolUse: { label: 'Before Tool', icon: '' },
	postToolUse: { label: 'After Tool', icon: '' },
	preTaskExecution: { label: 'Before Task', icon: '' },
	postTaskExecution: { label: 'After Task', icon: '' },
}

export const ModoHooksPanel = () => {
	const accessor = useAccessor()
	const [hooks, setHooks] = useState<HookDef[]>([])

	useEffect(() => {
		try {
			const hookService = accessor.get('IModoHookService' as any) as any
			if (hookService) {
				setHooks(hookService.hooks ?? [])
				const d = hookService.onDidChangeHooks?.(() => {
					setHooks([...hookService.hooks])
				})
				return () => d?.dispose?.()
			}
		} catch { /* service not available yet */ }
	}, [accessor])

	return (
		<div className="void-w-full void-h-full void-flex void-flex-col void-p-3 void-text-void-fg-1">
			{/* Header */}
			<div className="void-flex void-items-center void-justify-between void-mb-3">
				<div className="void-text-lg void-font-semibold" style={{ color: 'var(--modo-hook-color)' }}>
					Hooks
				</div>
				<span className="void-text-xs void-text-void-fg-3">{hooks.length} active</span>
			</div>

			{hooks.length === 0 ? (
				<div className="void-text-center void-py-8">
					<div className="void-text-void-fg-3 void-text-sm void-mb-2">No hooks configured</div>
					<div className="void-text-void-fg-4 void-text-xs">
						Add JSON files to .modo/hooks/ to automate workflows
					</div>
				</div>
			) : (
				<div className="void-flex void-flex-col void-gap-2 void-overflow-y-auto">
					{hooks.map((hook, i) => {
						const evt = EVENT_INFO[hook.when.type] ?? { label: hook.when.type, icon: '❓' }
						return (
							<div
								key={hook.fileName ?? i}
								className="void-p-2.5 void-rounded-lg void-border void-border-void-border-3 void-bg-void-bg-1"
							>
								{/* Name + version */}
								<div className="void-flex void-items-center void-justify-between void-mb-1.5">
									<span className="void-text-sm void-font-medium">{hook.name}</span>
									<span className="void-text-xs void-text-void-fg-4">v{hook.version}</span>
								</div>

								{hook.description && (
									<div className="void-text-xs void-text-void-fg-3 void-mb-2">{hook.description}</div>
								)}

								{/* Flow: when → then */}
								<div className="void-flex void-items-center void-gap-1.5 void-text-xs">
									<span
										className="void-px-1.5 void-py-0.5 void-rounded"
										style={{ background: 'var(--modo-hook-color)', color: 'black', opacity: 0.9 }}
									>
										{evt.icon} {evt.label}
									</span>

									{hook.when.patterns && (
										<span className="void-text-void-fg-4">{hook.when.patterns.join(', ')}</span>
									)}
									{hook.when.toolTypes && (
										<span className="void-text-void-fg-4">{hook.when.toolTypes.join(', ')}</span>
									)}

									<span className="void-text-void-fg-4">→</span>

									<span
										className="void-px-1.5 void-py-0.5 void-rounded void-bg-void-bg-2-alt void-text-void-fg-2"
									>
										{hook.then.type === 'askAgent' ? 'Ask Agent' : 'Run Command'}
									</span>
								</div>

								{/* Detail */}
								<div className="void-mt-1.5 void-text-xs void-text-void-fg-4 void-truncate">
									{hook.then.type === 'askAgent'
										? hook.then.prompt
										: hook.then.command}
								</div>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
