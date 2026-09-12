import React, { useState, useEffect, useCallback } from 'react';
import { Opportunity, OpportunityStatus, AppNotification } from './types';
import { api } from './services/api';
import { getDaysRemaining } from './utils/dateUtils';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { OpportunitiesView } from './components/OpportunitiesView';
import { DeadlinesView } from './components/DeadlinesView';
import { TasksView } from './components/TasksView';
import { CalendarView } from './components/CalendarView';
import { NotificationsView } from './components/NotificationsView';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { VoiceNotesView } from './components/VoiceNotesView';
import { QuickCaptureModal } from './components/QuickCaptureModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { SettingsModal } from './components/SettingsModal';
import { AddOpportunityModal } from './components/AddOpportunityModal';
import { OpportunityDetailModal } from './components/OpportunityDetailModal';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & Drawers
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [prefillUrl, setPrefillUrl] = useState<string | undefined>(undefined);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstallPwa, setCanInstallPwa] = useState(false);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K) & PWA prompt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsQuickCaptureOpen((prev) => !prev);
      }
    };

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstallPwa(true);
    };

    const handleAppInstalled = () => {
      setCanInstallPwa(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstallPwa(false);
    }
    setDeferredPrompt(null);
  };

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');

  // Checking state
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const [opps, notifs] = await Promise.all([
        api.getOpportunities(),
        api.getNotifications(),
      ]);
      setOpportunities(opps);
      setNotifications(notifs);
    } catch (err) {
      console.error('Failed to load tracker data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived metrics for badges
  const unreadCount = notifications.filter((n) => !n.read).length;
  const urgentCount = opportunities.filter((o) => {
    const d = getDaysRemaining(o.deadline);
    return d >= 0 && d <= 3;
  }).length;
  const pendingTasksCount = opportunities.reduce(
    (sum, o) => sum + o.tasks.filter((t) => !t.completed).length,
    0
  );

  const hasSampleData = opportunities.some((o) => o.id.startsWith('sample-'));

  // Handlers
  const handleSelectOpportunity = (opp: Opportunity) => {
    setSelectedOpportunity(opp);
    setIsDetailModalOpen(true);
  };

  const handleSelectOpportunityById = (id: string) => {
    const found = opportunities.find((o) => o.id === id);
    if (found) {
      handleSelectOpportunity(found);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: OpportunityStatus) => {
    try {
      const updated = await api.updateOpportunity(id, { status: newStatus });
      setOpportunities((prev) => prev.map((o) => (o.id === id ? updated : o)));
      if (selectedOpportunity?.id === id) {
        setSelectedOpportunity(updated);
      }
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleUpdateOpportunity = async (id: string, updates: Partial<Opportunity>) => {
    try {
      const updated = await api.updateOpportunity(id, updates);
      setOpportunities((prev) => prev.map((o) => (o.id === id ? updated : o)));
      if (selectedOpportunity?.id === id) {
        setSelectedOpportunity(updated);
      }
    } catch (err) {
      console.error('Failed to update opportunity', err);
      throw err;
    }
  };

  const handleDeleteOpportunity = async (id: string) => {
    try {
      await api.deleteOpportunity(id);
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
      if (selectedOpportunity?.id === id) {
        setSelectedOpportunity(null);
        setIsDetailModalOpen(false);
      }
    } catch (err) {
      console.error('Failed to delete opportunity', err);
    }
  };

  const handleCheckWebsite = async (id: string) => {
    setCheckingIds((prev) => new Set(prev).add(id));
    try {
      const res = await api.checkWebsite(id);
      if (res.opportunity) {
        setOpportunities((prev) =>
          prev.map((o) => (o.id === id ? res.opportunity : o))
        );
        if (selectedOpportunity?.id === id) {
          setSelectedOpportunity(res.opportunity);
        }
      }
      // Refresh notifications as website check might have added one
      const notifs = await api.getNotifications();
      setNotifications(notifs);
    } catch (err) {
      console.error('Error checking website', err);
    } finally {
      setCheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCheckAllWebsites = async () => {
    setIsCheckingAll(true);
    try {
      const res = await api.checkAllWebsites();
      if (res.items) {
        setOpportunities(res.items);
      }
      const notifs = await api.getNotifications();
      setNotifications(notifs);
    } catch (err) {
      console.error('Failed to check all websites', err);
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleOpportunityAdded = (newOpp: Opportunity) => {
    setOpportunities((prev) => [newOpp, ...prev]);
    handleSelectOpportunity(newOpp);
  };

  // Task Handlers
  const handleToggleTask = async (oppId: string, taskId: string) => {
    const target = opportunities.find((o) => o.id === oppId);
    if (!target) return;

    const updatedTasks = target.tasks.map((t) =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );

    const updated = await api.updateOpportunity(oppId, { tasks: updatedTasks });
    setOpportunities((prev) => prev.map((o) => (o.id === oppId ? updated : o)));
    if (selectedOpportunity?.id === oppId) {
      setSelectedOpportunity(updated);
    }
  };

  const handleAddTask = async (
    oppId: string,
    taskData: { name: string; priority: 'low' | 'medium' | 'high'; dueDate?: string }
  ) => {
    const target = opportunities.find((o) => o.id === oppId);
    if (!target) return;

    const newTask = {
      id: String(Date.now()),
      name: taskData.name,
      completed: false,
      priority: taskData.priority,
      dueDate: taskData.dueDate,
    };

    const updated = await api.updateOpportunity(oppId, {
      tasks: [...target.tasks, newTask],
    });
    setOpportunities((prev) => prev.map((o) => (o.id === oppId ? updated : o)));
    if (selectedOpportunity?.id === oppId) {
      setSelectedOpportunity(updated);
    }
  };

  const handleDeleteTask = async (oppId: string, taskId: string) => {
    const target = opportunities.find((o) => o.id === oppId);
    if (!target) return;

    const updatedTasks = target.tasks.filter((t) => t.id !== taskId);
    const updated = await api.updateOpportunity(oppId, { tasks: updatedTasks });
    setOpportunities((prev) => prev.map((o) => (o.id === oppId ? updated : o)));
    if (selectedOpportunity?.id === oppId) {
      setSelectedOpportunity(updated);
    }
  };

  // Notification Handlers
  const handleMarkAsRead = async (id: string) => {
    await api.markNotificationAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllAsRead = async () => {
    await api.markAllNotificationsAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleDeleteNotification = async (id: string) => {
    await api.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearSampleData = async () => {
    if (confirm('Are you sure you want to remove the default sample opportunities?')) {
      await api.resetSampleData('delete-samples');
      await loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#070a12] text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <div className="text-sm font-semibold tracking-wider text-slate-300 font-mono">
            INITIALIZING OPPORTUNITY TRACKER...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
        unreadCount={unreadCount}
        urgentCount={urgentCount}
        pendingTasksCount={pendingTasksCount}
      />

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        <Header
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          searchQuery={searchQuery}
          setSearchQuery={(q) => {
            setSearchQuery(q);
            if (q.trim() && activeTab !== 'opportunities' && activeTab !== 'dashboard') {
              setActiveTab('opportunities');
            }
          }}
          onOpenAddModal={() => {
            setPrefillUrl(undefined);
            setIsAddModalOpen(true);
          }}
          onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
          onCheckAllWebsites={handleCheckAllWebsites}
          isCheckingAll={isCheckingAll}
          unreadCount={unreadCount}
          setActiveTab={setActiveTab}
          hasSampleData={hasSampleData}
          onClearSampleData={handleClearSampleData}
          canInstallPwa={canInstallPwa}
          onInstallPwa={handleInstallPwa}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto pb-24 md:pb-8">
          {activeTab === 'dashboard' && (
            <DashboardView
              opportunities={opportunities}
              notifications={notifications}
              onSelectOpportunity={handleSelectOpportunity}
              onUpdateStatus={handleUpdateStatus}
              onCheckWebsite={handleCheckWebsite}
              checkingIds={checkingIds}
              setActiveTab={setActiveTab}
              onOpenAddModal={() => {
                setPrefillUrl(undefined);
                setIsAddModalOpen(true);
              }}
            />
          )}

          {activeTab === 'opportunities' && (
            <OpportunitiesView
              opportunities={opportunities}
              onSelectOpportunity={handleSelectOpportunity}
              onUpdateStatus={handleUpdateStatus}
              onCheckWebsite={handleCheckWebsite}
              checkingIds={checkingIds}
              onOpenAddModal={() => {
                setPrefillUrl(undefined);
                setIsAddModalOpen(true);
              }}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}

          {activeTab === 'deadlines' && (
            <DeadlinesView
              opportunities={opportunities}
              onSelectOpportunity={handleSelectOpportunity}
              onOpenAddModal={() => {
                setPrefillUrl(undefined);
                setIsAddModalOpen(true);
              }}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksView
              opportunities={opportunities}
              onToggleTask={handleToggleTask}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              onSelectOpportunity={handleSelectOpportunity}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              opportunities={opportunities}
              onSelectOpportunity={handleSelectOpportunity}
            />
          )}

          {activeTab === 'voice' && (
            <VoiceNotesView
              opportunities={opportunities}
              onOpportunityUpdated={(updated) =>
                setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
              }
              onOpenOpportunityDetail={handleSelectOpportunity}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
              onDeleteNotification={handleDeleteNotification}
              onSelectOpportunityById={handleSelectOpportunityById}
            />
          )}

          {activeTab === 'assistant' && (
            <AiAssistantDrawer
              opportunities={opportunities}
              onOpportunityUpdated={(updated) =>
                setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
              }
              onOpportunityCreated={handleOpportunityAdded}
              onOpenOpportunityDetail={(name) => {
                const found = opportunities.find((o) =>
                  o.name.toLowerCase().includes(name.toLowerCase())
                );
                if (found) handleSelectOpportunity(found);
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsModal
              opportunities={opportunities}
              onRefreshData={loadData}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        currentView={activeTab}
        onNavigate={setActiveTab}
        urgentDeadlinesCount={urgentCount}
        unreadNotificationsCount={unreadCount}
        onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
      />

      {/* Add Opportunity Modal */}
      <AddOpportunityModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setPrefillUrl(undefined);
        }}
        onAdded={handleOpportunityAdded}
        initialUrl={prefillUrl}
      />

      {/* Quick Capture Universal Modal */}
      <QuickCaptureModal
        isOpen={isQuickCaptureOpen}
        onClose={() => setIsQuickCaptureOpen(false)}
        opportunities={opportunities}
        onOpportunityCreated={handleOpportunityAdded}
        onOpportunityUpdated={(updated) =>
          setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
        }
        onOpenFullAddModal={(url) => {
          setPrefillUrl(url);
          setIsAddModalOpen(true);
        }}
      />

      {/* Opportunity Detail & Edit Modal */}
      <OpportunityDetailModal
        opportunity={selectedOpportunity}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onUpdate={handleUpdateOpportunity}
        onDelete={handleDeleteOpportunity}
        onCheckWebsite={handleCheckWebsite}
        isChecking={selectedOpportunity ? checkingIds.has(selectedOpportunity.id) : false}
      />
    </div>
  );
}
