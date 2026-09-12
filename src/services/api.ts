import {
  Opportunity,
  AppNotification,
  NotificationSettings,
  ExtractedOpportunityData,
  VoiceNote,
  AiActionProposal,
  VoiceAnalysisResult,
  QuickCaptureClassification,
  ResearchEventResult,
} from '../types';
import { INITIAL_SAMPLE_OPPORTUNITIES, INITIAL_NOTIFICATIONS } from '../data/defaultOpportunities';

const LOCAL_STORAGE_OPPS_KEY = 'opportunity_tracker_cache_v1';
const LOCAL_STORAGE_NOTIFS_KEY = 'opportunity_tracker_notifs_v1';
const LOCAL_STORAGE_VOICE_KEY = 'opportunity_tracker_voice_v1';

export const api = {
  // Opportunities
  async getOpportunities(): Promise<Opportunity[]> {
    try {
      const res = await fetch('/api/opportunities');
      if (!res.ok) throw new Error('Network response not ok');
      const data: Opportunity[] = await res.json();
      localStorage.setItem(LOCAL_STORAGE_OPPS_KEY, JSON.stringify(data));
      return data;
    } catch {
      const cached = localStorage.getItem(LOCAL_STORAGE_OPPS_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore
        }
      }
      return INITIAL_SAMPLE_OPPORTUNITIES;
    }
  },

  async createOpportunity(opp: Partial<Opportunity>): Promise<Opportunity> {
    const res = await fetch('/api/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opp),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create' }));
      throw new Error(err.error || 'Failed to create opportunity');
    }
    return res.json();
  },

  async updateOpportunity(id: string, updates: Partial<Opportunity>): Promise<Opportunity> {
    const res = await fetch(`/api/opportunities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update' }));
      throw new Error(err.error || 'Failed to update opportunity');
    }
    return res.json();
  },

  async deleteOpportunity(id: string): Promise<void> {
    const res = await fetch(`/api/opportunities/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete');
  },

  async resetSampleData(mode: 'delete-samples' | 'restore-defaults'): Promise<void> {
    const res = await fetch('/api/opportunities/reset-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) throw new Error('Failed to modify sample data');
  },

  // Website Monitoring
  async checkWebsite(id: string): Promise<{
    success: boolean;
    opportunity: Opportunity;
    isChanged?: boolean;
    message: string;
  }> {
    const res = await fetch(`/api/tracking/check/${id}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Check request failed' }));
      throw new Error(err.error || 'Failed to check website');
    }
    return res.json();
  },

  async checkAllWebsites(): Promise<{
    success: boolean;
    totalTracked: number;
    checkedCount: number;
    changedCount: number;
    errorCount: number;
    items: Opportunity[];
  }> {
    const res = await fetch('/api/tracking/check-all', {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to check all websites');
    return res.json();
  },

  // Grounded Event Web Research Pipeline
  async researchEvent(query: string, targetUrl?: string): Promise<ResearchEventResult> {
    const res = await fetch('/api/research/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, targetUrl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Research failed' }));
      throw new Error(err.error || 'Failed to conduct event web research');
    }
    return res.json();
  },

  // Smart URL / Event Extraction with Grounded Research
  async extractFromUrl(url: string, name?: string): Promise<{
    success: boolean;
    extracted: ExtractedOpportunityData;
    verifiedFetch: boolean;
    researchResult?: ResearchEventResult;
  }> {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Extraction failed' }));
      throw new Error(err.error || 'Failed to extract opportunity details');
    }
    return res.json();
  },

  // AI Assistant Chat & Actions with Grounded Research
  async askAssistant(message: string, activeProposal?: AiActionProposal | null): Promise<{
    reply: string;
    proposals?: AiActionProposal[];
    suggestedPrompts?: string[];
    actionExecuted?: {
      action: AiActionProposal;
      message: string;
    };
    actionDiscarded?: boolean;
    updatedOpportunity?: Opportunity;
    researchResult?: ResearchEventResult;
    isResearch?: boolean;
  }> {
    const res = await fetch('/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, activeProposal }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Assistant failed' }));
      throw new Error(err.error || 'Failed to query assistant');
    }
    return res.json();
  },

  async transcribeAudio(audioBase64: string, mimeType?: string): Promise<{ success: boolean; transcription: string; error?: string }> {
    const res = await fetch('/api/voice/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
      throw new Error(err.error || err.message || 'Failed to transcribe voice audio');
    }
    return res.json();
  },

  async applyAiAction(action: AiActionProposal): Promise<{
    success: boolean;
    message: string;
    updatedOpportunity?: Opportunity;
  }> {
    const res = await fetch('/api/assistant/apply-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to apply action' }));
      throw new Error(err.error || 'Failed to apply action');
    }
    return res.json();
  },

  // Voice Notes
  async getVoiceNotes(query?: string, opportunityId?: string): Promise<VoiceNote[]> {
    try {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (opportunityId) params.append('opportunityId', opportunityId);
      const url = `/api/voice-notes${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch voice notes');
      const data: VoiceNote[] = await res.json();
      localStorage.setItem(LOCAL_STORAGE_VOICE_KEY, JSON.stringify(data));
      return data;
    } catch {
      const cached = localStorage.getItem(LOCAL_STORAGE_VOICE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore
        }
      }
      return [];
    }
  },

  async createVoiceNote(data: {
    opportunityId?: string;
    opportunityName?: string;
    transcription: string;
    audioDataUrl?: string;
    durationSeconds?: number;
  }): Promise<VoiceNote> {
    const res = await fetch('/api/voice-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create voice note' }));
      throw new Error(err.error || 'Failed to create voice note');
    }
    return res.json();
  },

  async deleteVoiceNote(id: string): Promise<void> {
    const res = await fetch(`/api/voice-notes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete voice note');
  },

  async analyzeVoice(transcription: string, currentOpportunityId?: string): Promise<VoiceAnalysisResult> {
    const res = await fetch('/api/voice/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcription, currentOpportunityId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
      throw new Error(err.error || 'Failed to analyze voice note');
    }
    return res.json();
  },

  // Universal Quick Capture
  async classifyQuickCapture(input: string): Promise<QuickCaptureClassification> {
    const res = await fetch('/api/quick-capture/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Quick capture classification failed' }));
      throw new Error(err.error || 'Failed to classify input');
    }
    return res.json();
  },

  // Notifications
  async getNotifications(): Promise<AppNotification[]> {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const data = await res.json();
      localStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, JSON.stringify(data));
      return data;
    } catch {
      const cached = localStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore
        }
      }
      return INITIAL_NOTIFICATIONS;
    }
  },

  async markNotificationAsRead(id: string): Promise<void> {
    await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
  },

  async markAllNotificationsAsRead(): Promise<void> {
    await fetch('/api/notifications/read-all', { method: 'PUT' });
  },

  async deleteNotification(id: string): Promise<void> {
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
  },

  // Settings
  async getSettings(): Promise<NotificationSettings> {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    } catch {
      return {
        reminder14d: true,
        reminder7d: true,
        reminder3d: true,
        reminder1d: true,
        reminder0d: true,
        notifyOnChanges: true,
        notifyOnFailures: true,
        notifyOnOverdueTasks: true,
      };
    }
  },

  async updateSettings(settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },
};
