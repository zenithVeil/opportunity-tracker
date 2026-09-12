import React, { useState, useMemo } from 'react';
import { Opportunity, TaskItem } from '../types';
import { formatDate } from '../utils/dateUtils';
import {
  CheckSquare,
  Square,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  ArrowRight,
} from 'lucide-react';

interface TasksViewProps {
  opportunities: Opportunity[];
  onToggleTask: (opportunityId: string, taskId: string) => void;
  onAddTask: (
    opportunityId: string,
    task: { name: string; priority: 'low' | 'medium' | 'high'; dueDate?: string }
  ) => void;
  onDeleteTask: (opportunityId: string, taskId: string) => void;
  onSelectOpportunity: (opp: Opportunity) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  opportunities,
  onToggleTask,
  onAddTask,
  onDeleteTask,
  onSelectOpportunity,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('pending');
  const [selectedOppId, setSelectedOppId] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');

  // Quick Add State
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskOppId, setNewTaskOppId] = useState<string>(opportunities[0]?.id || '');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('high');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  // Flatten all tasks with their parent opportunity
  const allTasks = useMemo(() => {
    const list: Array<{
      task: TaskItem;
      opportunity: Opportunity;
    }> = [];

    opportunities.forEach((opp) => {
      opp.tasks.forEach((t) => {
        list.push({ task: t, opportunity: opp });
      });
    });

    return list;
  }, [opportunities]);

  const filteredTasks = useMemo(() => {
    return allTasks.filter(({ task, opportunity }) => {
      if (filterStatus === 'pending' && task.completed) return false;
      if (filterStatus === 'completed' && !task.completed) return false;
      if (selectedOppId !== 'all' && opportunity.id !== selectedOppId) return false;
      if (selectedPriority !== 'all' && task.priority !== selectedPriority) return false;
      return true;
    });
  }, [allTasks, filterStatus, selectedOppId, selectedPriority]);

  const completedCount = allTasks.filter((item) => item.task.completed).length;
  const totalCount = allTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim() || !newTaskOppId) return;

    onAddTask(newTaskOppId, {
      name: newTaskName.trim(),
      priority: newTaskPriority,
      dueDate: newTaskDueDate || undefined,
    });

    setNewTaskName('');
    setNewTaskDueDate('');
    setIsAdding(false);
  };

  return (
    <div id="tasks-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-cyan-400" />
            <span>Opportunity Task Master</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Centralized checklist across all competitions, CTF preps, and applications.
          </p>
        </div>

        <button
          id="add-task-btn"
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400 transition-colors"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>New Task</span>
        </button>
      </div>

      {/* Progress Card */}
      <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div>
            <div className="text-xs font-semibold text-slate-300">GLOBAL CHECKLIST COMPLETION</div>
            <div className="text-xl font-bold text-white mt-0.5">
              {completedCount} of {totalCount} completed
            </div>
          </div>
          <div className="font-mono text-2xl font-bold text-cyan-400">{progressPercent}%</div>
        </div>
        <div className="h-2 w-full rounded-full bg-[#1a2333] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Add Task Form (Expandable) */}
      {isAdding && (
        <form
          onSubmit={handleCreateTask}
          className="rounded-xl border border-cyan-500/30 bg-[#0d1322] p-4 space-y-3 animate-in fade-in duration-200"
        >
          <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Checklist Item to Opportunity
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-slate-400 text-[11px] mb-1">Task Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Set up Docker Ghidra container / submit draft"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#141b2b] px-3 py-2 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Target Opportunity *</label>
              <select
                value={newTaskOppId}
                onChange={(e) => setNewTaskOppId(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#141b2b] px-2.5 py-2 text-white focus:border-cyan-500/50 focus:outline-none"
              >
                {opportunities.map((opp) => (
                  <option key={opp.id} value={opp.id}>
                    {opp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Priority</label>
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as any)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#141b2b] px-2.5 py-2 text-white focus:border-cyan-500/50 focus:outline-none"
              >
                <option value="high">High Priority</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Optional Due Date</label>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#141b2b] px-3 py-2 text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400"
            >
              Add Task
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1e293b] pb-3 text-xs">
        {/* Status toggles */}
        <div className="flex items-center rounded-lg border border-[#1e293b] bg-[#0c101a] p-1">
          <button
            onClick={() => setFilterStatus('pending')}
            className={`rounded px-2.5 py-1 transition-colors ${
              filterStatus === 'pending'
                ? 'bg-[#1e293b] text-cyan-300 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`rounded px-2.5 py-1 transition-colors ${
              filterStatus === 'completed'
                ? 'bg-[#1e293b] text-cyan-300 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setFilterStatus('all')}
            className={`rounded px-2.5 py-1 transition-colors ${
              filterStatus === 'all'
                ? 'bg-[#1e293b] text-cyan-300 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Tasks
          </button>
        </div>

        {/* Opportunity filter */}
        <select
          value={selectedOppId}
          onChange={(e) => setSelectedOppId(e.target.value)}
          className="rounded-lg border border-[#1e293b] bg-[#121826] px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
        >
          <option value="all">All Opportunities</option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        {/* Priority filter */}
        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value)}
          className="rounded-lg border border-[#1e293b] bg-[#121826] px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none"
        >
          <option value="all">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="rounded-xl border border-[#1e293b] bg-[#111624] p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-slate-500 mb-2" />
            <p className="text-sm font-medium text-slate-300">No tasks match your current filter</p>
            <p className="text-xs text-slate-500 mt-1">
              All selected tasks are complete or none have been added yet.
            </p>
          </div>
        ) : (
          filteredTasks.map(({ task, opportunity }) => {
            const isHighPriority = task.priority === 'high';
            const isOverdue =
              task.dueDate && !task.completed && new Date(task.dueDate) < new Date('2026-09-12');

            return (
              <div
                key={`${opportunity.id}-${task.id}`}
                className={`group flex items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
                  task.completed
                    ? 'border-[#1a2333] bg-[#0c101a]/60 opacity-60'
                    : isOverdue
                    ? 'border-rose-900/40 bg-[#160e15]'
                    : 'border-[#1e293b] bg-[#101524] hover:border-cyan-500/40'
                }`}
              >
                {/* Checkbox and Title */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    id={`toggle-task-${task.id}`}
                    onClick={() => onToggleTask(opportunity.id, task.id)}
                    className="shrink-0 text-slate-400 hover:text-cyan-400 transition-colors"
                  >
                    {task.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Square className="h-5 w-5 hover:text-cyan-300" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <span
                      className={`text-sm font-medium ${
                        task.completed ? 'line-through text-slate-500' : 'text-slate-100'
                      }`}
                    >
                      {task.name}
                    </span>

                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      <button
                        onClick={() => onSelectOpportunity(opportunity)}
                        className="hover:text-cyan-300 hover:underline flex items-center gap-1 truncate max-w-[200px]"
                      >
                        <span>{opportunity.name}</span>
                      </button>

                      {task.dueDate && (
                        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                          <Clock className="h-3 w-3" />
                          {formatDate(task.dueDate)}
                        </span>
                      )}

                      {isOverdue && (
                        <span className="rounded bg-rose-950/60 text-rose-400 border border-rose-800/60 px-1 text-[10px] font-bold">
                          OVERDUE
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Priority Badge & Delete */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      task.priority === 'high'
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : task.priority === 'medium'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {task.priority}
                  </span>

                  <button
                    onClick={() => onDeleteTask(opportunity.id, task.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
