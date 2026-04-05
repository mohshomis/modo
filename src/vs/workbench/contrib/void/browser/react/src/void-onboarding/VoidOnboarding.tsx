/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { Check, ChevronRight } from 'lucide-react';
import { displayInfoOfProviderName, ProviderName, providerNames, localProviderNames, featureNames, FeatureName, isFeatureNameDisabled } from '../../../../common/voidSettingsTypes.js';
import { OllamaSetupInstructions, OneClickSwitchButton, SettingsForProvider, ModelDump } from '../void-settings-tsx/Settings.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';

export const VoidOnboarding = () => {
	const voidSettingsState = useSettingsState()
	const isOnboardingComplete = voidSettingsState.globalSettings.isOnboardingComplete
	const isDark = useIsDark()

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div
				className={`
					void-fixed void-top-0 void-right-0 void-bottom-0 void-left-0 void-z-[99999]
					void-transition-all void-duration-1000
					${isOnboardingComplete ? 'void-opacity-0 void-pointer-events-none' : 'void-opacity-100 void-pointer-events-auto'}
				`}
				style={{
					height: '100vh',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: isDark
						? 'linear-gradient(135deg, #0c0c0c 0%, #0f1a1a 50%, #0c0c0c 100%)'
						: 'linear-gradient(135deg, #f8fffe 0%, #f0fdfa 50%, #f8fffe 100%)',
				}}
			>
				<ErrorBoundary>
					<ModoOnboardingContent />
				</ErrorBoundary>
			</div>
		</div>
	)
}

// --- Modo Logo ---
const ModoLogo = () => (
	<div className="void-flex void-items-center void-gap-3">
		<div
			className="void-w-12 void-h-12 void-rounded-xl void-flex void-items-center void-justify-center void-text-2xl void-font-bold"
			style={{ background: 'linear-gradient(135deg, #0d9488, #14b8a6)', color: 'white' }}
		>
			M
		</div>
		<span className="void-text-4xl void-font-light void-text-void-fg-1">Modo</span>
	</div>
)

// --- Buttons ---
const NextBtn = ({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
	<button
		onClick={disabled ? undefined : onClick}
		className={`void-flex void-items-center void-gap-2 void-px-6 void-py-2.5 void-rounded-lg void-text-sm void-font-medium void-transition-all void-duration-200 ${
			disabled ? 'void-opacity-40 void-cursor-not-allowed' : 'hover:void-opacity-90'
		}`}
		style={{ background: 'linear-gradient(135deg, #0d9488, #14b8a6)', color: 'white' }}
	>
		{children}
		<ChevronRight className="void-w-4 void-h-4" />
	</button>
)

const BackBtn = ({ onClick }: { onClick: () => void }) => (
	<button
		onClick={onClick}
		className="void-px-4 void-py-2 void-text-sm void-text-void-fg-3 hover:void-text-void-fg-1 void-transition-colors"
	>
		Back
	</button>
)

// --- Feature checklist ---
const featureNameMap: { display: string; featureName: FeatureName }[] = [
	{ display: 'Chat', featureName: 'Chat' },
	{ display: 'Quick Edit', featureName: 'Ctrl+K' },
	{ display: 'Autocomplete', featureName: 'Autocomplete' },
	{ display: 'Fast Apply', featureName: 'Apply' },
	{ display: 'Source Control', featureName: 'SCM' },
]

// --- Tab config ---
const tabNames = ['Free', 'Paid', 'Local', 'Cloud/Other'] as const
type TabName = typeof tabNames[number]

const cloudProviders: ProviderName[] = ['googleVertex', 'liteLLM', 'microsoftAzure', 'awsBedrock', 'openAICompatible']

const providerNamesOfTab: Record<TabName, ProviderName[]> = {
	Free: ['gemini', 'openRouter'],
	Local: localProviderNames,
	Paid: providerNames.filter(pn => !(['gemini', 'openRouter', ...localProviderNames, ...cloudProviders] as string[]).includes(pn)) as ProviderName[],
	'Cloud/Other': cloudProviders,
}

const descriptionOfTab: Record<TabName, string> = {
	Free: 'Providers with a free tier. Add as many as you like.',
	Paid: 'Connect directly with any provider (bring your own key).',
	Local: 'Active providers should appear automatically.',
	'Cloud/Other': 'Enterprise and custom configurations.',
}

// --- Main Content ---
const ModoOnboardingContent = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidMetricsService = accessor.get('IMetricsService')
	const settingsState = useSettingsState()
	const [page, setPage] = useState(0)
	const [currentTab, setCurrentTab] = useState<TabName>('Free')
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (error) {
			const t = setTimeout(() => setError(null), 4000)
			return () => clearTimeout(t)
		}
	}, [error])

	useEffect(() => {
		if (!settingsState.globalSettings.isOnboardingComplete) setPage(0)
	}, [settingsState.globalSettings.isOnboardingComplete])

	const pages: Record<number, React.ReactNode> = {
		// --- Page 0: Welcome ---
		0: (
			<div className="void-flex void-flex-col void-items-center void-gap-8 void-max-w-lg void-mx-auto void-text-center">
				<ModoLogo />
				<div className="void-text-void-fg-3 void-text-sm void-max-w-sm void-leading-relaxed">
					Spec-driven AI development. Turn prompts into structured specs, inject project context with steering, and automate with hooks.
				</div>
				<div className="void-flex void-flex-col void-gap-3 void-w-full void-max-w-xs">
					{[
						{ icon: '\u2022', text: 'Specs \u2014 prompts become requirements, design, tasks' },
						{ icon: '\u2022', text: 'Steering \u2014 project rules injected into every interaction' },
						{ icon: '\u2022', text: 'Hooks \u2014 automate on file changes, tool use, tasks' },
					].map((item, i) => (
						<div key={i} className="void-flex void-items-start void-gap-3 void-text-left void-text-xs void-text-void-fg-2">
							<span className="void-text-base">{item.icon}</span>
							<span>{item.text}</span>
						</div>
					))}
				</div>
				<NextBtn onClick={() => setPage(1)}>Get Started</NextBtn>
			</div>
		),

		// --- Page 1: Add Providers ---
		1: (
			<div className="void-flex void-flex-col md:void-flex-row void-w-full void-h-[80vh] void-gap-6 void-max-w-[900px] void-mx-auto">
				{/* Left */}
				<div className="md:void-w-1/4 void-flex void-flex-col void-gap-4 void-p-4 void-h-full void-overflow-y-auto">
					<div className="void-flex md:void-flex-col void-gap-2">
						{tabNames.map(tab => (
							<button
								key={tab}
								className={`void-py-2 void-px-3 void-rounded-lg void-text-left void-text-sm void-transition-all ${
									currentTab === tab
										? 'void-font-medium void-shadow-sm'
										: 'void-bg-void-bg-2 hover:void-bg-void-bg-2-hover void-text-void-fg-1'
								}`}
								style={currentTab === tab ? { background: 'var(--modo-accent)', color: 'white' } : undefined}
								onClick={() => { setCurrentTab(tab); setError(null) }}
							>
								{tab}
							</button>
						))}
					</div>
					{/* Feature checklist */}
					<div className="void-flex void-flex-col void-gap-1 void-mt-4 void-text-xs void-text-void-fg-3">
						{featureNameMap.map(({ display, featureName }) => {
							const hasModel = settingsState.modelSelectionOfFeature[featureName] !== null
							return (
								<div key={featureName} className="void-flex void-items-center void-gap-2">
									{hasModel
										? <Check className="void-w-3.5 void-h-3.5" style={{ color: 'var(--modo-success)' }} />
										: <div className="void-w-3 void-h-3 void-rounded-full void-flex void-items-center void-justify-center"><div className="void-w-1 void-h-1 void-rounded-full void-bg-void-fg-4" /></div>
									}
									<span>{display}</span>
								</div>
							)
						})}
					</div>
				</div>

				{/* Right */}
				<div className="void-flex-1 void-flex void-flex-col void-items-center void-justify-start void-p-4 void-h-full void-overflow-y-auto">
					<div className="void-text-3xl void-font-light void-mb-2 void-text-center">Add a Provider</div>
					<div className="void-w-full void-max-w-xl void-mt-2 void-mb-6">
						<div className="void-text-xl void-font-light void-my-2">{currentTab}</div>
						<div className="void-text-xs void-text-void-fg-3 void-my-2">{descriptionOfTab[currentTab]}</div>
					</div>

					{providerNamesOfTab[currentTab].map(providerName => (
						<div key={providerName} className="void-w-full void-max-w-xl void-mb-8">
							<div className="void-text-lg void-mb-2">
								{displayInfoOfProviderName(providerName).title}
							</div>
							<SettingsForProvider providerName={providerName} showProviderTitle={false} showProviderSuggestions={true} />
							{providerName === 'ollama' && <OllamaSetupInstructions />}
						</div>
					))}

					{(currentTab === 'Local' || currentTab === 'Cloud/Other') && (
						<div className="void-w-full void-max-w-xl void-mt-4 void-p-4 void-rounded-lg void-border void-border-void-border-4 void-bg-void-bg-2-alt">
							<div className="void-text-base void-font-medium void-mb-3">Models</div>
							{currentTab === 'Local' && <ModelDump filteredProviders={localProviderNames} />}
							{currentTab === 'Cloud/Other' && <ModelDump filteredProviders={cloudProviders} />}
						</div>
					)}

					<div className="void-flex void-flex-col void-items-end void-w-full void-mt-auto void-pt-6">
						{error && <div className="void-text-xs void-mb-2" style={{ color: 'var(--modo-hook-color)' }}>{error}</div>}
						<div className="void-flex void-items-center void-gap-2">
							<BackBtn onClick={() => setPage(0)} />
							<NextBtn
								onClick={() => {
									if (!isFeatureNameDisabled('Chat', settingsState)) {
										setPage(2)
									} else {
										setError('Set up at least one Chat model to continue.')
									}
								}}
							>
								Next
							</NextBtn>
						</div>
					</div>
				</div>
			</div>
		),

		// --- Page 2: Import + Finish ---
		2: (
			<div className="void-flex void-flex-col void-items-center void-gap-8 void-max-w-lg void-mx-auto void-text-center">
				<div className="void-text-3xl void-font-light">Almost there</div>
				<div className="void-text-void-fg-3 void-text-sm">Import settings from an existing editor?</div>

				<div className="void-flex void-flex-col void-gap-3 void-w-full void-max-w-xs">
					<OneClickSwitchButton className="void-w-full void-px-4 void-py-2" fromEditor="VS Code" />
					<OneClickSwitchButton className="void-w-full void-px-4 void-py-2" fromEditor="Cursor" />
					<OneClickSwitchButton className="void-w-full void-px-4 void-py-2" fromEditor="Windsurf" />
				</div>

				<div className="void-text-xs void-text-void-fg-4 void-max-w-sm">
					Tip: Create a .modo/ folder in your project to use steering files, specs, and hooks.
				</div>

				<div className="void-flex void-items-center void-gap-2">
					<BackBtn onClick={() => setPage(1)} />
					<button
						onClick={() => {
							voidSettingsService.setGlobalSetting('isOnboardingComplete', true)
							voidMetricsService.capture('Completed Onboarding', {})
						}}
						className="void-flex void-items-center void-gap-2 void-px-8 void-py-3 void-rounded-xl void-text-sm void-font-medium void-transition-all void-duration-300 hover:void-scale-105"
						style={{ background: 'linear-gradient(135deg, #0d9488, #14b8a6)', color: 'white' }}
					>
						Launch Modo
						<ChevronRight className="void-w-4 void-h-4" />
					</button>
				</div>
			</div>
		),
	}

	return (
		<div className="void-w-full void-h-[80vh] void-flex void-items-center void-justify-center">
			<ErrorBoundary>
				{pages[page]}
			</ErrorBoundary>
		</div>
	)
}
