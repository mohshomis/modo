/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Mohammed. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback } from 'react';
import { useAccessor } from '../util/services.js';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
type SpecStatus = 'draft' | 'in_progress' | 'completed' | 'archived';
type SpecType = 'feature' | 'bugfix';
type WorkflowType = 'requirements-first' | 'design-first';

interface SpecTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  fileReferences: string[];
}

interface Spec {
  id: string;
  title: string;
  status: SpecStatus;
  specType: SpecType;
  workflowType: WorkflowType;
  prompt: string;
  tasks: SpecTask[];
}

const TASK_ICONS: Record<TaskStatus, string> = {
  pending: '\u25CB',
  in_progress: '\u25C9',
  completed: '\u2713',
  skipped: '\u2014'
};

export const ModoSpecPanel = () => {
  const accessor = useAccessor();
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [activeSpecId, setActiveSpecId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    try {
      const specService = accessor.get('IModoSpecService' as any) as any;
      if (specService) {
        setSpecs(specService.specs ?? []);
        setActiveSpecId(specService.activeSpecId ?? null);
        const d1 = specService.onDidChangeSpecs?.(() => {
          setSpecs([...specService.specs]);
        });
        const d2 = specService.onDidChangeActiveSpec?.((id: string | undefined) => {
          setActiveSpecId(id ?? null);
        });
        return () => { d1?.dispose?.(); d2?.dispose?.(); };
      }
    } catch {/* service not available yet */}
  }, [accessor]);

  const activeSpec = specs.find((s) => s.id === activeSpecId) ?? null;

  const handleCreate = useCallback(() => {
    try {
      const commandService = accessor.get('ICommandService' as any) as any;
      commandService?.executeCommand('modo.createSpec');
    } catch {/* */}
  }, [accessor]);

  const handleRunNext = useCallback(() => {
    try {
      const commandService = accessor.get('ICommandService' as any) as any;
      commandService?.executeCommand('modo.runNextSpecTask');
    } catch {/* */}
  }, [accessor]);

  const handleRunAll = useCallback(() => {
    try {
      const commandService = accessor.get('ICommandService' as any) as any;
      commandService?.executeCommand('modo.runAllSpecTasks');
    } catch {/* */}
  }, [accessor]);

  const handleOpenFiles = useCallback(() => {
    try {
      const commandService = accessor.get('ICommandService' as any) as any;
      commandService?.executeCommand('modo.openSpecFiles');
    } catch {/* */}
  }, [accessor]);

  const completedCount = activeSpec?.tasks.filter((t) => t.status === 'completed').length ?? 0;
  const totalCount = activeSpec?.tasks.length ?? 0;
  const progress = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;
  const pendingCount = activeSpec?.tasks.filter((t) => t.status === 'pending').length ?? 0;

  return (
    <div className="void-void-w-full void-void-h-full void-void-flex void-void-flex-col void-void-p-3 void-void-text-void-fg-1">
      {/* Header */}
      <div className="void-void-flex void-void-items-center void-void-justify-between void-void-mb-3">
        <div className="void-void-text-lg void-void-font-semibold" style={{ color: 'var(--modo-spec-color, #14b8a6)' }}>
          Specs
        </div>
        <button
          onClick={handleCreate}
          className="void-void-px-2 void-void-py-1 void-void-text-xs void-void-rounded"
          style={{ background: 'var(--modo-accent, #14b8a6)', color: 'white' }}>
          + New
        </button>
      </div>

      {/* Spec list */}
      {!activeSpec && specs.length === 0 &&
        <div className="void-void-text-center void-void-text-void-fg-3 void-void-text-sm void-void-py-8">
          No specs yet. Create one to get started with spec-driven development.
        </div>
      }

      {!activeSpec && specs.length > 0 &&
        <div className="void-void-flex void-void-flex-col void-void-gap-1">
          {specs.map((spec) => {
            const done = spec.tasks.filter(t => t.status === 'completed').length;
            const total = spec.tasks.length;
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            return (
              <button
                key={spec.id}
                onClick={() => {
                  setActiveSpecId(spec.id);
                  try {
                    const svc = accessor.get('IModoSpecService' as any) as any;
                    svc?.setActiveSpec(spec.id);
                  } catch {/* */}
                }}
                className="void-void-flex void-void-flex-col void-void-gap-1 void-void-p-2.5 void-void-rounded-lg void-void-text-left hover:void-void-bg-void-bg-2-hover void-void-border void-void-border-void-border-3">
                <div className="void-void-flex void-void-items-center void-void-gap-2">
                  <span>{spec.specType === 'bugfix' ? '\uD83D\uDC1B' : '\uD83D\uDCCB'}</span>
                  <span className="void-void-flex-1 void-void-text-sm void-void-truncate">{spec.title}</span>
                  <span className="void-void-text-xs void-void-px-1.5 void-void-py-0.5 void-void-rounded-full"
                    style={{
                      background: spec.status === 'completed' ? '#22c55e' :
                        spec.status === 'in_progress' ? '#14b8a6' : '#52525b',
                      color: 'white', fontSize: '10px'
                    }}>
                    {spec.status}
                  </span>
                </div>
                <div className="void-void-flex void-void-items-center void-void-gap-2 void-void-text-xs void-void-text-void-fg-3">
                  <span>{spec.workflowType}</span>
                  {total > 0 && <>
                    <span>·</span>
                    <span>{done}/{total} tasks</span>
                    <div className="void-void-flex-1 void-void-h-1 void-void-rounded-full void-void-bg-void-bg-1 void-void-overflow-hidden">
                      <div className="void-void-h-full void-void-rounded-full" style={{ width: `${pct}%`, background: '#14b8a6' }} />
                    </div>
                  </>}
                </div>
              </button>
            );
          })}
        </div>
      }

      {/* Active spec detail */}
      {activeSpec &&
        <div className="void-void-flex void-void-flex-col void-void-flex-1 void-void-overflow-y-auto">
          {/* Back + title */}
          <div className="void-void-flex void-void-items-center void-void-gap-2 void-void-mb-2">
            <button
              onClick={() => {
                setActiveSpecId(null);
                try {
                  const svc = accessor.get('IModoSpecService' as any) as any;
                  svc?.setActiveSpec(undefined);
                } catch {/* */}
              }}
              className="void-void-text-xs void-void-text-void-fg-3 hover:void-void-text-void-fg-1">
              ← Back
            </button>
            <span className="void-void-text-sm void-void-font-medium void-void-flex-1 void-void-truncate">{activeSpec.title}</span>
            <span
              className="void-void-text-xs void-void-px-2 void-void-py-0.5 void-void-rounded-full"
              style={{
                background: activeSpec.status === 'completed' ? '#22c55e' :
                  activeSpec.status === 'in_progress' ? '#14b8a6' : '#52525b',
                color: 'white'
              }}>
              {activeSpec.status}
            </span>
          </div>

          {/* Spec info */}
          <div className="void-void-flex void-void-gap-2 void-void-mb-2 void-void-text-xs void-void-text-void-fg-3">
            <span className="void-void-px-1.5 void-void-py-0.5 void-void-rounded void-void-bg-void-bg-1">
              {activeSpec.specType === 'bugfix' ? '\uD83D\uDC1B Bug' : '\u2728 Feature'}
            </span>
            <span className="void-void-px-1.5 void-void-py-0.5 void-void-rounded void-void-bg-void-bg-1">
              {activeSpec.workflowType === 'requirements-first' ? 'Req → Design → Tasks' : 'Design → Req → Tasks'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="void-void-flex void-void-gap-2 void-void-mb-3">
            <button
              onClick={handleOpenFiles}
              className="void-void-px-2 void-void-py-1 void-void-text-xs void-void-rounded void-void-border void-void-border-void-border-3 hover:void-void-bg-void-bg-2-hover">
              Open Files
            </button>
            {pendingCount > 0 && <>
              <button
                onClick={handleRunNext}
                className="void-void-px-2 void-void-py-1 void-void-text-xs void-void-rounded"
                style={{ background: '#14b8a6', color: 'white' }}>
                Run Next Task
              </button>
              <button
                onClick={handleRunAll}
                className="void-void-px-2 void-void-py-1 void-void-text-xs void-void-rounded void-void-border void-void-border-void-border-3 hover:void-void-bg-void-bg-2-hover">
                Run All ({pendingCount})
              </button>
            </>}
          </div>

          {/* Progress */}
          {totalCount > 0 &&
            <div className="void-void-mb-3">
              <div className="void-void-flex void-void-justify-between void-void-text-xs void-void-text-void-fg-3 void-void-mb-1">
                <span>Progress</span>
                <span>{completedCount}/{totalCount} ({progress}%)</span>
              </div>
              <div className="void-void-h-1.5 void-void-rounded-full void-void-bg-void-bg-1 void-void-overflow-hidden">
                <div
                  className="void-void-h-full void-void-rounded-full void-void-transition-all"
                  style={{ width: `${progress}%`, background: '#14b8a6' }} />
              </div>
            </div>
          }

          {/* Prompt */}
          {activeSpec.prompt &&
            <div className="void-void-mb-3 void-void-p-2 void-void-rounded void-void-bg-void-bg-1 void-void-text-xs void-void-text-void-fg-3">
              <div className="void-void-text-void-fg-4 void-void-mb-1 void-void-uppercase" style={{ fontSize: '10px' }}>Prompt</div>
              {activeSpec.prompt}
            </div>
          }

          {/* Tasks */}
          <div className="void-void-text-xs void-void-text-void-fg-3 void-void-mb-1 void-void-uppercase void-void-font-medium" style={{ fontSize: '10px' }}>
            Tasks
          </div>
          {activeSpec.tasks.length === 0 ?
            <div className="void-void-text-sm void-void-text-void-fg-3 void-void-text-center void-void-py-4">
              No tasks generated yet. The agent will fill in tasks.md during the spec workflow.
            </div> :
            <div className="void-void-flex void-void-flex-col void-void-gap-1">
              {activeSpec.tasks.map((task) =>
                <div
                  key={task.id}
                  className={`void-void-flex void-void-items-start void-void-gap-2 void-void-p-2 void-void-rounded void-void-text-sm ${task.status === 'completed' ? "void-void-opacity-50" : ""}`}
                  style={task.status === 'in_progress' ? { border: '1px solid #14b8a6', borderRadius: '6px' } : undefined}>
                  <span className="void-void-mt-0.5" style={{
                    color: task.status === 'completed' ? '#22c55e' :
                      task.status === 'in_progress' ? '#14b8a6' : 'inherit'
                  }}>
                    {TASK_ICONS[task.status]}
                  </span>
                  <div className="void-void-flex-1">
                    <div className={task.status === 'completed' ? "void-void-line-through" : ""}>{task.title}</div>
                    {task.description &&
                      <div className="void-void-text-xs void-void-text-void-fg-3 void-void-mt-0.5">{task.description}</div>
                    }
                    {task.fileReferences.length > 0 &&
                      <div className="void-void-text-xs void-void-text-void-fg-4 void-void-mt-0.5">
                        {task.fileReferences.map((f, i) => (
                          <span key={i} className="void-void-mr-1" style={{ fontFamily: 'monospace', fontSize: '10px' }}>{f}</span>
                        ))}
                      </div>
                    }
                  </div>
                </div>
              )}
            </div>
          }
        </div>
      }
    </div>
  );
};
