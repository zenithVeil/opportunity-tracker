import React, { useState, useEffect } from 'react';
import { NotificationSettings, Opportunity } from '../types';
import { api } from '../services/api';
import {
  Settings,
  Bell,
  Database,
  Download,
  Trash2,
  RefreshCw,
  Check,
  ShieldCheck,
} from 'lucide-react';

interface SettingsModalProps {
  opportunities: Opportunity[];
  onRefreshData: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  opportunities,
  onRefreshData,
}) => {
  const [settings, setSettings] = useState<NotificationSettings>({
    reminder14d: true,
    reminder7d: true,
    reminder3d: true,
    reminder1d: true,
    reminder0d: true,
    notifyOnChanges: true,
    notifyOnFailures: true,
    notifyOnOverdueTasks: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isResettingSamples, setIsResettingSamples] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => setSettings(s)).catch(() => {});
  }, []);

  const handleToggle = async (key: keyof NotificationSettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      await api.updateSettings(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch {
      alert('Failed to update notification settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJSON = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(opportunities, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `opportunity_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleResetSample = async (mode: 'delete-samples' | 'restore-defaults') => {
    const confirmMsg =
      mode === 'delete-samples'
        ? 'Are you sure you want to remove sample opportunities? Your custom opportunities will be kept.'
        : 'Restore default sample opportunities (ETHGlobal, DEF CON CTF, etc.)?';

    if (!confirm(confirmMsg)) return;

    setIsResettingSamples(true);
    try {
      await api.resetSampleData(mode);
      await onRefreshData();
      alert(mode === 'delete-samples' ? 'Sample data removed!' : 'Default samples restored!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsResettingSamples(false);
    }
  };

  return (
    <div id="settings-view" className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#1e293b] pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="h-5 w-5 text-cyan-400" />
          <span>Tracker Preferences & Storage</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure automated deadline reminders, monitoring rules, and local export.
        </p>
      </div>

      {/* Notification Preferences */}
      <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Deadline Alerts & Proximity Triggers</h2>
          </div>
          {savedSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
              <Check className="h-3 w-3" /> Saved!
            </span>
          )}
        </div>

        <div className="divide-y divide-[#182236] text-xs">
          {[
            {
              key: 'reminder14d' as keyof NotificationSettings,
              title: '14 Days Before Deadline',
              desc: 'Early planning alert to assemble teams, book travel, or start proposals.',
            },
            {
              key: 'reminder7d' as keyof NotificationSettings,
              title: '7 Days Before Deadline',
              desc: 'One week countdown alert to finish drafts and technical prerequisites.',
            },
            {
              key: 'reminder3d' as keyof NotificationSettings,
              title: '3 Days Before Deadline (Urgent Alert)',
              desc: 'Enters urgent state: prompts final review of submission and checklist.',
            },
            {
              key: 'reminder1d' as keyof NotificationSettings,
              title: '24 Hours Before Deadline',
              desc: 'Final day warning to guarantee submission before portal cutoff.',
            },
            {
              key: 'reminder0d' as keyof NotificationSettings,
              title: 'Deadline Day (Day of closing)',
              desc: 'Direct alert on the day of closing.',
            },
            {
              key: 'notifyOnChanges' as keyof NotificationSettings,
              title: 'Website Monitoring Diffs',
              desc: 'Alert immediately whenever a website check detects changed dates, rules, or prizes.',
            },
            {
              key: 'notifyOnFailures' as keyof NotificationSettings,
              title: 'Website Check Failures',
              desc: 'Alert when a website becomes unreachable or blocks automated monitoring.',
            },
            {
              key: 'notifyOnOverdueTasks' as keyof NotificationSettings,
              title: 'Overdue Checklist Tasks',
              desc: 'Flag tasks that passed their designated milestone due dates.',
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 cursor-pointer select-none"
              onClick={() => handleToggle(item.key)}
            >
              <div className="pr-4">
                <div className="font-semibold text-slate-200">{item.title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
              </div>

              {/* Toggle Switch */}
              <div
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings[item.key] ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings[item.key] ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sample Data Management */}
      <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white">Sample Data Management</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The app starts populated with realistic developer events (DEF CON CTF, ETHGlobal San Francisco, Google Summer of Code, Y Combinator). You can remove sample opportunities at any time or restore them to explore features.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() => handleResetSample('delete-samples')}
            disabled={isResettingSamples}
            className="flex items-center gap-1.5 rounded-lg border border-rose-900/50 bg-rose-950/20 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Remove Sample Opportunities</span>
          </button>

          <button
            onClick={() => handleResetSample('restore-defaults')}
            disabled={isResettingSamples}
            className="flex items-center gap-1.5 rounded-lg border border-[#1e293b] bg-[#162033] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-[#1f2d47] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Restore Default Sample Opportunities</span>
          </button>
        </div>
      </div>

      {/* Export / Backup */}
      <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">Export & Backup</h2>
        </div>
        <p className="text-xs text-slate-400">
          Download a complete JSON export of all your tracked opportunities, checklists, notes, and website logs for safe keeping.
        </p>
        <button
          onClick={handleExportJSON}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export All Data (.JSON)</span>
        </button>
      </div>
    </div>
  );
};
