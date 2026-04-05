/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useMemo, useState, useRef, useEffect } from 'react';
import { useAccessor, useChatThreadsState, useFullChatThreadsStreamState, useIsDark } from '../util/services.js';

import '../styles.css'
import { SidebarChat } from './SidebarChat.js';
import ErrorBoundary from './ErrorBoundary.js';
import { X, Plus, History, Search } from 'lucide-react';

// History overlay with search
const HistoryPanel = ({ onClose, onSelect }: { onClose: () => void; onSelect: (threadId: string) => void }) => {
	const accessor = useAccessor()
	const { allThreads } = useChatThreadsState()
	const [query, setQuery] = useState('')
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => { inputRef.current?.focus() }, [])

	const threads = useMemo(() => {
		const list = Object.entries(allThreads ?? {})
			.filter(([, t]) => (t?.messages?.length ?? 0) > 0)
			.map(([id, t]) => {
				const msgs = t?.messages ?? []
				const firstUser = msgs.find(m => m.role === 'user')
				const name = firstUser?.role === 'user' ? (firstUser.displayContent || '').slice(0, 80) : 'Untitled'
				const allText = msgs.map(m => ('displayContent' in m ? (m as any).displayContent : '') || ('content' in m ? (m as any).content : '') || '').join(' ')
				return { id, name, allText, msgCount: msgs.length, lastModified: t?.lastModified ?? 0 }
			})
			.sort((a, b) => b.lastModified - a.lastModified)

		if (!query.trim()) return list
		const q = query.toLowerCase()
		return list.filter(t => t.name.toLowerCase().includes(q) || t.allText.toLowerCase().includes(q))
	}, [allThreads, query])

	return (
		<div className='absolute inset-0 z-50 flex flex-col bg-void-bg-2' style={{ borderBottom: '1px solid var(--void-border-3)' }}>
			{/* Search bar */}
			<div className='flex items-center gap-2 px-3 py-2' style={{ borderBottom: '1px solid var(--void-border-3)' }}>
				<Search size={13} className='text-void-fg-3 flex-shrink-0' />
				<input
					ref={inputRef}
					value={query}
					onChange={e => setQuery(e.target.value)}
					placeholder='Search past sessions...'
					className='flex-1 bg-transparent text-void-fg-1 text-[12px] outline-none placeholder:text-void-fg-4'
					onKeyDown={e => { if (e.key === 'Escape') onClose() }}
				/>
				<button onClick={onClose} className='text-void-fg-3 hover:text-void-fg-1 transition-colors'>
					<X size={14} />
				</button>
			</div>
			{/* Thread list */}
			<div className='flex-1 overflow-y-auto'>
				{threads.length === 0 && (
					<div className='text-void-fg-4 text-[12px] text-center py-8'>
						{query ? 'No matching sessions' : 'No past sessions'}
					</div>
				)}
				{threads.map(t => (
					<button
						key={t.id}
						onClick={() => { onSelect(t.id); onClose() }}
						className='w-full text-left px-3 py-2.5 hover:bg-void-bg-2-hover transition-colors flex items-center gap-2'
						style={{ borderBottom: '1px solid var(--void-border-3)' }}
					>
						<span className='flex-shrink-0 w-1.5 h-1.5 rounded-full' style={{ background: '#52525b' }} />
						<div className='flex-1 min-w-0'>
							<div className='text-[12px] text-void-fg-1 truncate'>{t.name}</div>
							<div className='text-[10px] text-void-fg-4'>{t.msgCount} messages</div>
						</div>
					</button>
				))}
			</div>
		</div>
	)
}

// Session tab bar
const SessionTabBar = ({ onOpenHistory }: { onOpenHistory: () => void }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const threadsState = useChatThreadsState()
	const streamState = useFullChatThreadsStreamState()
	const { allThreads, currentThreadId } = threadsState

	const threadIds = useMemo(() => {
		return Object.keys(allThreads ?? {})
			.sort((a, b) => (allThreads[a]?.lastModified ?? 0) > (allThreads[b]?.lastModified ?? 0) ? -1 : 1)
	}, [allThreads])

	const displayThreadIds = useMemo(() => {
		const withMessages = threadIds.filter(id => (allThreads[id]?.messages.length ?? 0) > 0)
		if (!withMessages.includes(currentThreadId)) {
			withMessages.unshift(currentThreadId)
		}
		return withMessages.slice(0, 6)
	}, [threadIds, currentThreadId, allThreads])

	if (displayThreadIds.length < 1) return null

	return (
		<div className='flex items-center justify-between gap-2 px-1.5 py-1.5 overflow-x-auto' style={{ borderBottom: '1px solid var(--void-border-3)', flexShrink: 0 }}>
			<div className='flex items-center gap-0.5 flex-1 overflow-x-auto'>
				{displayThreadIds.map(threadId => {
					const thread = allThreads[threadId]
					const isActive = threadId === currentThreadId
					const isRunning = !!streamState[threadId]?.isRunning
					const firstMsg = thread?.messages.find(m => m.role === 'user')
					const tabName = firstMsg?.role === 'user' ? (firstMsg.displayContent || '').slice(0, 20) : 'New Session'

					return (
						<div
							key={threadId}
							className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] cursor-pointer transition-all min-w-0 max-w-[180px] ${
								isActive ? 'bg-void-bg-1 text-void-fg-1' : 'text-void-fg-3 hover:text-void-fg-2 hover:bg-void-bg-2-hover'
							}`}
							onClick={() => chatThreadsService.switchToThread(threadId)}
						>
							<span className='flex-shrink-0' style={{ width: '6px', height: '6px', borderRadius: '50%', background: isRunning ? '#14b8a6' : isActive ? '#14b8a6' : '#52525b' }} />
							<span className='truncate'>{tabName}</span>
							{displayThreadIds.length > 1 && (
								<X className='flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity' size={10}
									onClick={(e) => {
										e.stopPropagation()
										if (threadId === currentThreadId) {
											const other = displayThreadIds.find(id => id !== threadId)
											if (other) chatThreadsService.switchToThread(other)
										}
										chatThreadsService.deleteThread(threadId)
									}}
								/>
							)}
						</div>
					)
				})}
			</div>

			<div className='flex items-center gap-1 flex-shrink-0'>
				<button onClick={() => chatThreadsService.openNewThread()} className='p-1 rounded hover:bg-void-bg-2-hover text-void-fg-3 hover:text-void-fg-1 transition-colors' title='New Chat'>
					<Plus size={14} />
				</button>
				<button onClick={onOpenHistory} className='p-1 rounded hover:bg-void-bg-2-hover text-void-fg-3 hover:text-void-fg-1 transition-colors' title='History'>
					<History size={14} />
				</button>
				<button onClick={() => { const cmd = accessor.get('ICommandService'); cmd.executeCommand('workbench.action.closeAuxiliaryBar') }} className='p-1 rounded hover:bg-void-bg-2-hover text-void-fg-3 hover:text-void-fg-1 transition-colors' title='Close'>
					<X size={14} />
				</button>
			</div>
		</div>
	)
}

export const Sidebar = ({ className }: { className: string }) => {
	const isDark = useIsDark()
	const [showHistory, setShowHistory] = useState(false)
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	return <div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ width: '100%', height: '100%' }}>
		<div className='w-full h-full flex flex-col bg-void-bg-2 text-void-fg-1' style={{ position: 'relative' }}>
			<ErrorBoundary>
				<SessionTabBar onOpenHistory={() => setShowHistory(true)} />
			</ErrorBoundary>

			<div className='w-full flex-1 overflow-hidden'>
				<ErrorBoundary>
					<SidebarChat />
				</ErrorBoundary>
			</div>

			{showHistory && (
				<HistoryPanel
					onClose={() => setShowHistory(false)}
					onSelect={(threadId) => chatThreadsService.switchToThread(threadId)}
				/>
			)}
		</div>
	</div>
}
