import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { INITIAL_SAMPLE_OPPORTUNITIES, INITIAL_NOTIFICATIONS } from './src/data/defaultOpportunities.js';
import { JsonFileStorage } from './server/storage.js';
import {
  Opportunity,
  OpportunityStatus,
  AppNotification,
  NotificationSettings,
  ChangeLogEntry,
  VoiceNote,
  AiActionProposal,
  VoiceAnalysisResult,
  QuickCaptureClassification,
  ResearchEventResult,
} from './src/types.js';
import { runEventResearchPipeline, fetchHtmlWithFallbacks } from './server/researchPipeline.js';
import { isSafePublicUrl } from './server/security/urlValidator.js';
import {
  processAssistantQuery,
  transcribeAudioWithGemini,
  computeDailyPriorities,
} from './server/assistantEngine.js';

dotenv.config();

const app = express();
const PORT = 3000;

// Security and sanity headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const OPPORTUNITIES_FILE = path.join(DATA_DIR, 'opportunities.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const VOICE_NOTES_FILE = path.join(DATA_DIR, 'voice_notes.json');

const INITIAL_VOICE_NOTES: VoiceNote[] = [
  {
    id: 'vn-sample-1',
    opportunityId: 'sample-defcon-ctf-34',
    opportunityName: 'DEF CON CTF 34 Qualifiers',
    transcription: 'Finished verifying team Discord credentials and WireGuard VPN tunnel. Remember to install Ghidra 11.2 and test the pwntools environment before Saturday 1800 UTC.',
    summary: 'Team credentials and VPN verified. Need Ghidra 11.2 and pwntools environment test.',
    detectedEntities: {
      eventName: 'DEF CON CTF 34 Qualifiers',
      status: 'Registered',
      tasks: [{ name: 'Test pwntools and Ghidra environment', priority: 'high' }],
      notes: 'WireGuard VPN verified. Ghidra 11.2 required.',
    },
    createdAt: '2026-09-11T19:40:00Z',
  },
  {
    id: 'vn-sample-2',
    opportunityId: 'sample-black-hat-arsenal',
    opportunityName: 'Black Hat USA 2027 Call for Tools (Arsenal)',
    transcription: 'Noticed the official deadline extension announcement for Black Hat Arsenal. We have until September 28 to finalize the tool demo video.',
    summary: 'Noted deadline extension to September 28 for tool demo screencast.',
    detectedEntities: {
      eventName: 'Black Hat USA 2027 Call for Tools (Arsenal)',
      status: 'Interested',
      tasks: [{ name: 'Record 5-minute screencast demo', priority: 'high' }],
    },
    createdAt: '2026-09-11T14:15:00Z',
  },
];

const DEFAULT_SETTINGS: NotificationSettings = {
  reminder14d: true,
  reminder7d: true,
  reminder3d: true,
  reminder1d: true,
  reminder0d: true,
  notifyOnChanges: true,
  notifyOnFailures: true,
  notifyOnOverdueTasks: true,
};

// Resilient atomic storage handlers (never overwrite corrupted files with samples)
const opportunitiesStorage = new JsonFileStorage<Opportunity[]>(
  OPPORTUNITIES_FILE,
  INITIAL_SAMPLE_OPPORTUNITIES
);

const notificationsStorage = new JsonFileStorage<AppNotification[]>(
  NOTIFICATIONS_FILE,
  INITIAL_NOTIFICATIONS
);

const settingsStorage = new JsonFileStorage<NotificationSettings>(
  SETTINGS_FILE,
  DEFAULT_SETTINGS
);

const voiceNotesStorage = new JsonFileStorage<VoiceNote[]>(
  VOICE_NOTES_FILE,
  INITIAL_VOICE_NOTES
);

function loadOpportunities(): Opportunity[] {
  return opportunitiesStorage.load();
}

function saveOpportunities(items: Opportunity[]): void {
  opportunitiesStorage.save(items);
}

function loadNotifications(): AppNotification[] {
  return notificationsStorage.load();
}

function saveNotifications(items: AppNotification[]): void {
  notificationsStorage.save(items);
}

function loadSettings(): NotificationSettings {
  return settingsStorage.load();
}

function saveSettings(settings: NotificationSettings): void {
  settingsStorage.save(settings);
}

function loadVoiceNotes(): VoiceNote[] {
  return voiceNotesStorage.load();
}

function saveVoiceNotes(items: VoiceNote[]): void {
  voiceNotesStorage.save(items);
}

// Resilient model caller with automatic fallbacks for 503/high-demand spikes
async function generateWithFallbacks(
  ai: GoogleGenAI,
  options: {
    contents: any;
    config?: any;
  },
  models = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite']
): Promise<any> {
  let lastError: any = null;
  for (const model of models) {
    try {
      return await ai.models.generateContent({
        ...options,
        model,
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI Fallback] Model ${model} attempt failed: ${err?.message || err}. Trying next fallback...`);
    }
  }
  throw lastError;
}

// Lazy Gemini client helper
function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Helper to sanitize HTML to clean text
function extractTextFromHtml(html: string): { title: string; metaDescription: string; text: string } {
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
  }

  let metaDescription = '';
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                     html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  if (metaMatch) {
    metaDescription = metaMatch[1].trim();
  }

  // Remove scripts, styles, svg, noscript
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title,
    metaDescription,
    text: cleaned.slice(0, 7000), // First ~7000 chars for context
  };
}

// Simple deterministic hash
function computeHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}

// ================= API ENDPOINTS =================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    currentTime: new Date().toISOString(),
  });
});

// GET all opportunities
app.get('/api/opportunities', (req, res) => {
  const items = loadOpportunities();
  res.json(items);
});

// POST new opportunity
app.post('/api/opportunities', (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Request body must be a valid JSON object.' });
      return;
    }

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).json({ error: 'Name is required and must be a non-empty string.' });
      return;
    }

    if (body.name.trim().length > 250) {
      res.status(400).json({ error: 'Name must not exceed 250 characters.' });
      return;
    }

    const items = loadOpportunities();
    let additionalSources: string[] = [];
    if (Array.isArray(body.additionalSources)) {
      additionalSources = body.additionalSources
        .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
        .map((s: string) => s.trim().slice(0, 500))
        .slice(0, 5);
    }

    const newOpportunity: Opportunity = {
      id: `opp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: body.name.trim(),
      websiteUrl: typeof body.websiteUrl === 'string' ? body.websiteUrl.trim().slice(0, 500) : '',
      additionalSources,
      registrationUrl: typeof body.registrationUrl === 'string' ? body.registrationUrl.trim().slice(0, 500) : '',
      category: body.category || 'hackathon',
      organization: typeof body.organization === 'string' ? body.organization.trim().slice(0, 200) : 'Independent',
      deadline: typeof body.deadline === 'string' ? body.deadline.trim().slice(0, 50) : '',
      eventDate: typeof body.eventDate === 'string' ? body.eventDate.trim().slice(0, 50) : '',
      status: body.status || 'Interested',
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 10000) : '',
      tasks: Array.isArray(body.tasks) ? body.tasks : [],
      tags: Array.isArray(body.tags) ? body.tags.map((t: any) => String(t).slice(0, 50)) : [],
      reminderDaysBefore: Array.isArray(body.reminderDaysBefore) ? body.reminderDaysBefore : [14, 7, 3, 1, 0],
      provenance: body.provenance || { origin: 'manual', verifiedByCheck: false },
      tracking: {
        lastChecked: null,
        status: 'not_checked',
        failedAttemptsCount: 0,
        changeLog: [],
        sources: {},
      },
      isSample: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    items.unshift(newOpportunity);
    saveOpportunities(items);
    res.status(201).json(newOpportunity);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create opportunity' });
  }
});

// PUT update opportunity
app.put('/api/opportunities/:id', (req, res) => {
  try {
    const { id } = req.params;
    const items = loadOpportunities();
    const index = items.findIndex((o) => o.id === id);

    if (index === -1) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    const existing = items[index];
    let additionalSources = existing.additionalSources || [];
    if (Array.isArray(req.body.additionalSources)) {
      additionalSources = req.body.additionalSources
        .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
        .map((s: string) => s.trim().slice(0, 500))
        .slice(0, 5);
    }

    const updated: Opportunity = {
      ...existing,
      ...req.body,
      additionalSources,
      id: existing.id, // ID cannot change
      updatedAt: new Date().toISOString(),
    };

    items[index] = updated;
    saveOpportunities(items);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update opportunity' });
  }
});

// DELETE opportunity
app.delete('/api/opportunities/:id', (req, res) => {
  try {
    const { id } = req.params;
    let items = loadOpportunities();
    const initialLen = items.length;
    items = items.filter((o) => o.id !== id);

    if (items.length === initialLen) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    saveOpportunities(items);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete opportunity' });
  }
});

// POST reset sample data or clear sample data
app.post('/api/opportunities/reset-sample', (req, res) => {
  try {
    const { mode } = req.body; // 'delete-samples' | 'restore-defaults'
    let items = loadOpportunities();

    if (mode === 'delete-samples') {
      items = items.filter((o) => !o.isSample);
    } else {
      // Restore default samples if missing
      const nonSample = items.filter((o) => !o.isSample);
      items = [...INITIAL_SAMPLE_OPPORTUNITIES, ...nonSample];
    }

    saveOpportunities(items);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to modify sample data' });
  }
});

/**
 * Multi-source tracking check helper:
 * Fetches all of an opportunity's sources (websiteUrl + additionalSources) in parallel using Promise.allSettled.
 * Bounded by SSRF checks and timeouts.
 * Reconciles facts across sources with Gemini, flags conflicts in conflictWarning,
 * tracks per-source content hashes, and records source-specific change log entries.
 */
async function checkOpportunityMultiSource(
  opp: Opportunity,
  ai: GoogleGenAI | null,
  timeoutMs = 9000
): Promise<{ isChanged: boolean; message: string; success: boolean }> {
  // 1. Gather all unique sources (primary websiteUrl + additionalSources)
  const allUrls: { url: string; isPrimary: boolean; label: string }[] = [];
  if (opp.websiteUrl && opp.websiteUrl.trim()) {
    allUrls.push({
      url: opp.websiteUrl.trim(),
      isPrimary: true,
      label: 'Official Website',
    });
  }
  if (Array.isArray(opp.additionalSources)) {
    for (const src of opp.additionalSources) {
      const trimmed = typeof src === 'string' ? src.trim() : '';
      if (trimmed && !allUrls.some((u) => u.url.toLowerCase() === trimmed.toLowerCase())) {
        let domain = trimmed;
        try {
          domain = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`).hostname;
        } catch {
          // fallback
        }
        allUrls.push({
          url: trimmed,
          isPrimary: false,
          label: domain ? `Source (${domain})` : 'Additional Source',
        });
      }
    }
  }

  if (allUrls.length === 0) {
    opp.tracking.status = 'error';
    opp.tracking.errorMessage = 'No valid website or source URLs configured';
    opp.tracking.lastChecked = new Date().toISOString();
    return { isChanged: false, message: 'No URLs configured', success: false };
  }

  const checkedAt = new Date().toISOString();
  if (!opp.tracking.sources) {
    opp.tracking.sources = {};
  }

  type FetchSourceSuccess = {
    success: true;
    url: string;
    isPrimary: boolean;
    label: string;
    html: string;
    status: number;
    title: string;
    metaDescription: string;
    text: string;
    hash: string;
  };

  type FetchSourceFailure = {
    success: false;
    url: string;
    isPrimary: boolean;
    label: string;
    errorMessage: string;
    statusCode: number;
  };

  type FetchSourceResult = FetchSourceSuccess | FetchSourceFailure;

  // 2. Fetch all sources in parallel via Promise.allSettled
  const fetchTasks: Promise<FetchSourceResult>[] = allUrls.map(async (item): Promise<FetchSourceResult> => {
    let validUrl: URL;
    try {
      validUrl = new URL(item.url.startsWith('http') ? item.url : `https://${item.url}`);
    } catch {
      return {
        ...item,
        success: false,
        errorMessage: 'Invalid URL format',
        statusCode: 400,
      };
    }

    // SSRF verification
    const isSafe = await isSafePublicUrl(validUrl.toString());
    if (!isSafe) {
      return {
        ...item,
        success: false,
        errorMessage: 'Blocked by SSRF security policy',
        statusCode: 403,
      };
    }

    const fetchResult = await fetchHtmlWithFallbacks(validUrl.toString(), timeoutMs);
    if (!fetchResult) {
      return {
        ...item,
        success: false,
        errorMessage: 'Unable to connect to website (network or SSL error)',
        statusCode: 502,
      };
    }

    const { title, metaDescription, text } = extractTextFromHtml(fetchResult.html);
    const hash = computeHash(`${title}|${metaDescription}|${text.slice(0, 1500)}`);

    return {
      ...item,
      success: true,
      html: fetchResult.html,
      status: fetchResult.status,
      title,
      metaDescription,
      text,
      hash,
    };
  });

  const settled = await Promise.allSettled(fetchTasks);

  const successfulSources: FetchSourceSuccess[] = [];
  const failedSources: FetchSourceFailure[] = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      const res = outcome.value;
      if (res.success === true) {
        successfulSources.push(res);
      } else {
        failedSources.push(res as FetchSourceFailure);
      }
    } else {
      const orig = allUrls[i];
      failedSources.push({
        success: false,
        url: orig.url,
        isPrimary: orig.isPrimary,
        label: orig.label,
        errorMessage: outcome.reason?.message || 'Connection timed out',
        statusCode: 504,
      });
    }
  }

  // Record failed sources into per-source tracking map
  for (const failed of failedSources) {
    const prevSrc = opp.tracking.sources[failed.url] || {
      url: failed.url,
      sourceLabel: failed.label,
    };
    opp.tracking.sources[failed.url] = {
      ...prevSrc,
      url: failed.url,
      sourceLabel: failed.label,
      status: 'error',
      statusCode: failed.statusCode,
      errorMessage: failed.errorMessage,
      lastChecked: checkedAt,
    };
  }

  // If ALL sources failed, mark opportunity tracking status as error
  if (successfulSources.length === 0) {
    opp.tracking.status = 'error';
    opp.tracking.errorMessage = failedSources.map((f) => `${f.label}: ${f.errorMessage}`).join('; ');
    opp.tracking.lastChecked = checkedAt;
    opp.tracking.failedAttemptsCount = (opp.tracking.failedAttemptsCount || 0) + 1;

    // Repeated failure notification
    if (opp.tracking.failedAttemptsCount >= 2) {
      const notifs = loadNotifications();
      notifs.unshift({
        id: `notif_err_${Date.now()}`,
        type: 'website_error',
        opportunityId: opp.id,
        opportunityName: opp.name,
        title: 'Website Monitoring Alert',
        message: `Unable to access sources for "${opp.name}" repeatedly.`,
        timestamp: checkedAt,
        read: false,
        urgency: 'medium',
      });
      saveNotifications(notifs);
    }

    return {
      isChanged: false,
      message: opp.tracking.errorMessage,
      success: false,
    };
  }

  // At least one source succeeded! Reset failure count
  opp.tracking.failedAttemptsCount = 0;

  // 3. Per-source change detection
  let anySourceChanged = false;
  const changeLogEntries: ChangeLogEntry[] = opp.tracking.changeLog || [];

  for (const src of successfulSources) {
    const existingPerSource = opp.tracking.sources[src.url];
    // Check previous hash for this source, fallback to opp.tracking.contentHash if primary and never initialized
    const prevSourceHash = existingPerSource?.contentHash || (src.isPrimary ? opp.tracking.contentHash : undefined);
    const hasSourceChanged = Boolean(prevSourceHash && prevSourceHash !== src.hash);

    if (hasSourceChanged) {
      anySourceChanged = true;
      const entry: ChangeLogEntry = {
        id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: checkedAt,
        field: 'content',
        oldVal: prevSourceHash || 'Initial',
        newVal: src.hash,
        description: `${src.label} content changed`,
        sourceUrl: src.url,
        sourceLabel: src.label,
      };
      changeLogEntries.unshift(entry);
    }

    opp.tracking.sources[src.url] = {
      url: src.url,
      sourceLabel: src.label,
      contentHash: src.hash,
      status: hasSourceChanged ? 'changed' : 'active',
      statusCode: src.status,
      errorMessage: undefined,
      lastChecked: checkedAt,
      previousSnapshot: {
        checkedAt,
        title: src.title,
        textSnippet: src.text.slice(0, 300),
        contentHash: src.hash,
      },
    };
  }

  // 4. Multi-source reconciliation with Gemini
  let detectedDeadline = '';
  let detectedEventDate = '';
  let detectedStatus = '';
  let announcements: string[] = [];
  let summary = '';
  let conflictWarning = '';
  let keyFactsSources: Record<string, string> = {};

  if (ai) {
    try {
      const sourceSections = successfulSources
        .map(
          (s) => `--- SOURCE: ${s.label} (${s.url}) ---
Page Title: ${s.title}
Page Description: ${s.metaDescription || 'None'}
Page Content Excerpt:
${s.text.slice(0, 3500)}`
        )
        .join('\n\n');

      const prompt = `You are an event intelligence engine analyzing multiple monitored web sources for the opportunity "${opp.name}".
Monitored sources count: ${successfulSources.length} (${successfulSources.map((s) => s.url).join(', ')})
Current recorded deadline: ${opp.deadline || 'None'}
Current recorded event date: ${opp.eventDate || 'None'}

Here is the retrieved content from each source:
${sourceSections}

Tasks:
1. Reconcile all sources together to determine:
   - detectedDeadline: The most likely correct registration/submission deadline (YYYY-MM-DD or exact date text). If not found, say null.
   - detectedEventDate: The most likely correct event start date (YYYY-MM-DD or text). If not found, say null.
   - detectedStatus: The current registration or application status (e.g. "Registration Open", "Submissions Closed", "Applications Live", "Upcoming").
   - announcements: Array of up to 3 critical recent announcements or updates found across the sources.
   - summary: 1-2 sentence concise summary of the event status across all sources.
2. Cross-Source Conflict Detection:
   - conflictWarning: Check if the sources DISAGREE on key facts (for example, "Devpost states deadline is Oct 20 while Official Website states Oct 25").
     If there is a conflict or discrepancy between sources, explicitly describe the disagreement clearly so the user can verify manually.
     If there is NO conflict, or all sources agree, or only 1 source was available, set conflictWarning to null.
3. Source Attribution:
   - keyFactsSources: Object mapping each key fact ('deadline', 'eventDate', 'registrationStatus') to the exact source URL from which it was derived.`;

      const response = await generateWithFallbacks(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedDeadline: { type: Type.STRING },
              detectedEventDate: { type: Type.STRING },
              detectedStatus: { type: Type.STRING },
              announcements: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              summary: { type: Type.STRING },
              conflictWarning: { type: Type.STRING },
              keyFactsSources: {
                type: Type.OBJECT,
                properties: {
                  deadline: { type: Type.STRING },
                  eventDate: { type: Type.STRING },
                  registrationStatus: { type: Type.STRING },
                },
              },
            },
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        detectedDeadline = parsed.detectedDeadline || '';
        detectedEventDate = parsed.detectedEventDate || '';
        detectedStatus = parsed.detectedStatus || '';
        announcements = parsed.announcements || [];
        summary = parsed.summary || '';
        conflictWarning = parsed.conflictWarning || '';
        keyFactsSources = parsed.keyFactsSources || {};
      }
    } catch (geminiErr) {
      console.error('Gemini multi-source analysis error:', geminiErr);
      const primary = successfulSources.find((s) => s.isPrimary) || successfulSources[0];
      summary = primary.metaDescription || primary.title || 'Checked sources successfully';
      detectedStatus = 'Active';
    }
  } else {
    const primary = successfulSources.find((s) => s.isPrimary) || successfulSources[0];
    summary = primary.metaDescription || `${primary.title} checked across ${successfulSources.length} sources`;
    detectedStatus = 'Active';
  }

  // Cross-source conflict notification if newly detected
  if (conflictWarning && conflictWarning !== opp.tracking.conflictWarning) {
    const notifs = loadNotifications();
    notifs.unshift({
      id: `notif_conf_${Date.now()}`,
      type: 'website_changed',
      opportunityId: opp.id,
      opportunityName: opp.name,
      title: `Source Discrepancy Flagged for ${opp.name}`,
      message: conflictWarning,
      timestamp: checkedAt,
      read: false,
      urgency: 'high',
    });
    saveNotifications(notifs);
  }

  // Deadline change notification
  const prevSnapshotDeadline = opp.tracking.previousSnapshot?.detectedDeadline;
  if (detectedDeadline && prevSnapshotDeadline && detectedDeadline !== prevSnapshotDeadline) {
    anySourceChanged = true;
    const deadlineSourceUrl = keyFactsSources.deadline || opp.websiteUrl;
    const deadlineEntry: ChangeLogEntry = {
      id: `cl_dl_${Date.now()}`,
      timestamp: checkedAt,
      field: 'deadline',
      oldVal: prevSnapshotDeadline,
      newVal: detectedDeadline,
      description: `Updated deadline detected: ${detectedDeadline}`,
      sourceUrl: deadlineSourceUrl,
      sourceLabel: 'Monitored Sources',
    };
    changeLogEntries.unshift(deadlineEntry);

    const notifs = loadNotifications();
    notifs.unshift({
      id: `notif_chg_${Date.now()}`,
      type: 'website_changed',
      opportunityId: opp.id,
      opportunityName: opp.name,
      title: `Deadline Changed on Monitored Sources!`,
      message: `Updated deadline on ${opp.name}: ${detectedDeadline}${conflictWarning ? ` (${conflictWarning})` : ''}`,
      timestamp: checkedAt,
      read: false,
      urgency: 'high',
    });
    saveNotifications(notifs);
  }

  // Primary source info
  const primarySource = successfulSources.find((s) => s.isPrimary) || successfulSources[0];
  const primaryHash = primarySource.hash;

  opp.tracking = {
    ...opp.tracking,
    lastChecked: checkedAt,
    status: anySourceChanged ? 'changed' : 'active',
    statusCode: primarySource.status,
    contentHash: primaryHash,
    errorMessage: failedSources.length > 0
      ? `Notice: ${failedSources.length} source(s) unreachable (${failedSources.map((f) => f.label).join(', ')})`
      : undefined,
    conflictWarning: conflictWarning || undefined,
    sources: opp.tracking.sources,
    verifiedInfo: {
      title: primarySource.title,
      detectedDeadline: detectedDeadline || undefined,
      detectedEventDate: detectedEventDate || undefined,
      detectedStatus: detectedStatus || 'Active',
      announcements,
      summary: summary || primarySource.title,
      keyFactsSources,
    },
    previousSnapshot: {
      checkedAt,
      title: primarySource.title,
      textSnippet: primarySource.text.slice(0, 300),
      detectedDeadline,
    },
    changeLog: changeLogEntries,
  };

  const statusMsg = anySourceChanged
    ? 'Changes detected on monitored source(s)!'
    : conflictWarning
      ? 'Checked sources: Source discrepancy flagged!'
      : `Checked ${successfulSources.length} source(s) successfully. No critical changes detected.`;

  return {
    isChanged: anySourceChanged,
    message: statusMsg,
    success: true,
  };
}

// POST Server-side Website Monitoring: check single opportunity
app.post('/api/tracking/check/:id', async (req, res) => {
  const { id } = req.params;
  const items = loadOpportunities();
  const index = items.findIndex((o) => o.id === id);

  if (index === -1) {
    res.status(404).json({ error: 'Opportunity not found' });
    return;
  }

  const opp = items[index];
  const ai = getGeminiClient();

  try {
    const result = await checkOpportunityMultiSource(opp, ai, 9000);
    saveOpportunities(items);
    res.json({
      success: result.success,
      opportunity: opp,
      isChanged: result.isChanged,
      message: result.message,
    });
  } catch (err: any) {
    console.error('Tracking check handler error:', err);
    res.status(500).json({ error: err.message || 'Failed to check opportunity sources' });
  }
});

// POST Check all websites
app.post('/api/tracking/check-all', async (req, res) => {
  const items = loadOpportunities();
  const trackable = items.filter(
    (o) =>
      (o.websiteUrl && o.websiteUrl.trim().length > 0) ||
      (Array.isArray(o.additionalSources) && o.additionalSources.length > 0)
  );

  let checkedCount = 0;
  let changedCount = 0;
  let errorCount = 0;

  const ai = getGeminiClient();

  // Process batch of trackable opportunities
  for (const opp of trackable.slice(0, 10)) {
    try {
      const outcome = await checkOpportunityMultiSource(opp, ai, 6000);
      if (outcome.success) {
        checkedCount++;
        if (outcome.isChanged) {
          changedCount++;
        }
      } else {
        errorCount++;
      }
    } catch {
      errorCount++;
    }
  }

  saveOpportunities(items);
  res.json({
    success: true,
    totalTracked: trackable.length,
    checkedCount,
    changedCount,
    errorCount,
    items,
  });
});

// POST Dedicated Grounded Event Web Research Endpoint
app.post('/api/research/event', async (req, res) => {
  const { query, targetUrl } = req.body;
  if (!query && !targetUrl) {
    res.status(400).json({ error: 'Query or targetUrl is required for event research' });
    return;
  }

  const ai = getGeminiClient();
  try {
    const researchResult = await runEventResearchPipeline(query || '', targetUrl, ai);
    res.json(researchResult);
  } catch (err: any) {
    console.error('Event research pipeline error:', err);
    res.status(500).json({ error: err.message || 'Research pipeline failed' });
  }
});

// POST AI/Server-side Page Extraction for adding opportunity (Grounded & Verified)
app.post('/api/extract', async (req, res) => {
  const { url, name } = req.body;
  if (!url && !name) {
    res.status(400).json({ error: 'URL or name is required' });
    return;
  }

  const ai = getGeminiClient();
  try {
    const searchQuery = (name && name.trim()) ? name.trim() : (url || '');
    const researchResult = await runEventResearchPipeline(searchQuery, url, ai);

    res.json({
      success: researchResult.overallState !== 'unable_to_verify',
      extracted: {
        name: researchResult.eventName.value,
        organization: researchResult.organization.value,
        category: researchResult.category.value,
        description: researchResult.description.value,
        summary: researchResult.description.value,
        deadline: researchResult.deadline.value,
        eventDate: researchResult.eventDate.value,
        eventStartDate: researchResult.eventDate.value,
        registrationUrl: researchResult.registrationUrl.value,
        websiteUrl: researchResult.officialWebsite.value || url,
        suggestedTags: researchResult.suggestedTags,
        suggestedTasks: researchResult.suggestedTasks,
        tags: researchResult.suggestedTags,
        tasks: researchResult.suggestedTasks,
      },
      verifiedFetch: researchResult.sourcesRetrievedCount > 0,
      researchResult,
      verifiedFields: {
        deadline: researchResult.deadline,
        registrationStatus: researchResult.registrationStatus,
        eventDate: researchResult.eventDate,
        officialWebsite: researchResult.officialWebsite,
        registrationUrl: researchResult.registrationUrl,
        organization: researchResult.organization,
      },
      sources: researchResult.sourcesDiscovered,
      overallState: researchResult.overallState,
      unverifiedWarning: researchResult.unverifiedWarning,
    });
  } catch (err: any) {
    console.error('Unified extraction failed:', err);
    res.status(500).json({ error: err.message || 'Failed to extract opportunity details' });
  }
});

// Helper to execute confirmed action proposal
function applyActionInternal(
  action: AiActionProposal,
  items: Opportunity[],
  notifs: AppNotification[],
  voiceNotes: VoiceNote[]
): { success: boolean; message: string; updatedOpportunity?: Opportunity } {
  let updatedOpportunity: Opportunity | undefined;
  let message = '';

  if (action.type === 'update_status') {
    const opp = items.find((o) => o.id === action.opportunityId);
    if (!opp) throw new Error('Opportunity not found');
    const oldStatus = opp.status;
    opp.status = action.payload.status;
    opp.updatedAt = new Date().toISOString();
    updatedOpportunity = opp;
    saveOpportunities(items);

    notifs.unshift({
      id: `notif_${Date.now()}`,
      type: 'system',
      opportunityId: opp.id,
      opportunityName: opp.name,
      title: `Status Updated: ${opp.name}`,
      message: `Status was updated from "${oldStatus}" to "${opp.status}".`,
      timestamp: new Date().toISOString(),
      read: false,
      urgency: 'medium',
    });
    saveNotifications(notifs);
    message = `Updated "${opp.name}" status to ${opp.status}.`;
  } else if (action.type === 'create_task') {
    const opp = items.find((o) => o.id === action.opportunityId);
    if (!opp) throw new Error('Opportunity not found');
    const newTask = {
      id: `task_${Date.now()}`,
      name: action.payload.name || 'New Task',
      completed: false,
      priority: action.payload.priority || 'medium',
      dueDate: action.payload.dueDate,
    };
    opp.tasks.push(newTask);
    opp.updatedAt = new Date().toISOString();
    updatedOpportunity = opp;
    saveOpportunities(items);
    message = `Added task "${newTask.name}" to ${opp.name}.`;
  } else if (action.type === 'complete_task') {
    const opp = items.find((o) => o.id === action.opportunityId);
    if (!opp) throw new Error('Opportunity not found');
    const task = opp.tasks.find((t) => t.id === action.payload.taskId || t.name.toLowerCase() === (action.payload.taskName || '').toLowerCase());
    if (task) {
      task.completed = true;
      opp.updatedAt = new Date().toISOString();
      updatedOpportunity = opp;
      saveOpportunities(items);
      message = `Completed task "${task.name}".`;
    } else {
      throw new Error('Task not found');
    }
  } else if (action.type === 'create_reminder') {
    const opp = items.find((o) => o.id === action.opportunityId);
    if (opp && action.payload.daysBefore) {
      if (!opp.reminderDaysBefore.includes(action.payload.daysBefore)) {
        opp.reminderDaysBefore.push(action.payload.daysBefore);
        opp.reminderDaysBefore.sort((a, b) => b - a);
        opp.updatedAt = new Date().toISOString();
        updatedOpportunity = opp;
        saveOpportunities(items);
      }
    }
    notifs.unshift({
      id: `notif_rem_${Date.now()}`,
      type: 'deadline_reminder',
      opportunityId: opp?.id,
      opportunityName: opp?.name || action.payload.opportunityName || 'Scheduled Reminder',
      title: action.payload.title || `Reminder: ${opp?.name || 'Upcoming Opportunity'}`,
      message: action.payload.message || action.description || 'Upcoming scheduled reminder',
      timestamp: new Date().toISOString(),
      read: false,
      urgency: 'high',
    });
    saveNotifications(notifs);
    message = `Set reminder for ${opp?.name || action.payload.opportunityName || 'event'}.`;
  } else if (action.type === 'add_note') {
    const opp = items.find((o) => o.id === action.opportunityId);
    if (opp) {
      opp.notes = (opp.notes ? opp.notes + '\n\n' : '') + action.payload.note;
      opp.updatedAt = new Date().toISOString();
      updatedOpportunity = opp;
      saveOpportunities(items);
      message = `Added note to ${opp.name}.`;
    } else {
      // Standalone general note
      const newVn: VoiceNote = {
        id: `vn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        opportunityName: 'General Note',
        transcription: action.payload.note,
        summary: action.payload.note,
        createdAt: new Date().toISOString(),
      };
      voiceNotes.unshift(newVn);
      saveVoiceNotes(voiceNotes);
      message = `Saved note: "${action.payload.note}".`;
    }
  } else if (action.type === 'create_opportunity') {
    const payload = action.payload;
    const newOpp: Opportunity = {
      id: `opp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: payload.name || 'New Opportunity',
      websiteUrl: payload.websiteUrl || '',
      registrationUrl: payload.registrationUrl || '',
      category: payload.category || 'hackathon',
      organization: payload.organization || 'Independent',
      deadline: payload.deadline || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      eventDate: payload.eventDate,
      status: payload.status || 'Interested',
      notes: payload.notes || '',
      tasks: payload.tasks || [],
      tags: payload.tags || [],
      reminderDaysBefore: payload.reminderDaysBefore || [14, 7, 3, 1, 0],
      tracking: {
        lastChecked: null,
        status: 'not_checked',
        failedAttemptsCount: 0,
        changeLog: [],
      },
      provenance: { origin: 'manual', verifiedByCheck: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.unshift(newOpp);
    saveOpportunities(items);
    updatedOpportunity = newOpp;
    message = `Created opportunity "${newOpp.name}".`;
  }

  return { success: true, message, updatedOpportunity };
}

// POST Audio transcription using Gemini multimodal audio
app.post('/api/voice/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      res.status(400).json({ error: 'Audio data is required', success: false, transcription: '' });
      return;
    }

    const ai = getGeminiClient();
    const result = await transcribeAudioWithGemini(audioBase64, mimeType, ai);
    res.json(result);
  } catch (err: any) {
    console.error('Transcription route error:', err);
    res.status(500).json({
      success: false,
      transcription: '',
      error: err.message || 'Audio transcription failed',
    });
  }
});

// POST AI Assistant Chat grounded in user's opportunities & live web research
app.post('/api/assistant/chat', async (req, res) => {
  try {
    const { message, activeProposal } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const items = loadOpportunities();
    const voiceNotes = loadVoiceNotes();
    const notifs = loadNotifications();
    const ai = getGeminiClient();

    // Check for explicit or implicit live event research queries
    const lowerQ = message.toLowerCase().trim();
    const isPersonalTrackerQuery =
      /^(what|show|list)\s+(are\s+)?my\b/i.test(lowerQ) ||
      lowerQ.includes('in my tracker') ||
      lowerQ.includes('my opportunities') ||
      lowerQ.includes('my tasks') ||
      lowerQ.includes('what should i focus') ||
      lowerQ.includes('what should i work') ||
      lowerQ.includes('what do i need to do') ||
      lowerQ.includes('my voice') ||
      lowerQ.includes('i registered') ||
      lowerQ.includes('i applied');

    const isResearchTrigger =
      /^tell\s+me\s+about\b/i.test(lowerQ) ||
      /^what\s+is\b/i.test(lowerQ) ||
      /^check\b/i.test(lowerQ) ||
      /^find\s+(?:this\s+event|details|info|hackathon|ctf|competition|conference)\b/i.test(lowerQ) ||
      /^find\s+details\b/i.test(lowerQ) ||
      /^get\s+details\b/i.test(lowerQ) ||
      /^is\s+registration\s+open\b/i.test(lowerQ) ||
      /^are\s+applications\s+open\b/i.test(lowerQ) ||
      /^(?:when|what)\s+is\s+the\s+deadline\b/i.test(lowerQ) ||
      /^research\b/i.test(lowerQ) ||
      /^look\s*up\b/i.test(lowerQ) ||
      /^search\s+for\b/i.test(lowerQ) ||
      /details\s+(?:about|on|for)\b/i.test(lowerQ) ||
      /deadline\s+(?:for|of)\b/i.test(lowerQ) ||
      /registration\s+(?:for|status\s+of)\b/i.test(lowerQ) ||
      (/(?:find|lookup|check)\s+[a-z0-9]/i.test(lowerQ) && (lowerQ.includes('hackathon') || lowerQ.includes('ctf') || lowerQ.includes('fellowship') || lowerQ.includes('competition') || lowerQ.includes('conference'))) ||
      lowerQ.includes('ctf') ||
      lowerQ.includes('hackathon') ||
      lowerQ.includes('black hat') ||
      lowerQ.includes('summer of code') ||
      lowerQ.includes('gsoc');

    if (!isPersonalTrackerQuery && isResearchTrigger) {
      try {
        const research = await runEventResearchPipeline(message, undefined, ai);
        const proposals: AiActionProposal[] = [];
        let replyText = '';

        if (research.overallState === 'unable_to_verify') {
          replyText = `Could not verify this information.\n\n` +
            `Name:\n${research.eventName.value || message}\n\n` +
            `Organization:\nCould not verify\n\n` +
            `Deadline:\nCould not verify\n\n` +
            `Event date:\nCould not verify\n\n` +
            `Registration:\nCould not verify\n\n` +
            `Source:\nNone discovered\n\n` +
            `Last checked:\n${new Date(research.retrievalTimestamp).toLocaleString('en-US')}\n\n` +
            `Verification:\nUnverified\n\n` +
            `No authoritative sources could be retrieved. I will not guess or fabricate deadlines or registration links. If you have the direct website link, paste it and I will analyze the live page.`;
        } else {
          const verifiedName = research.eventName.value || message;
          const verifiedOrg = research.organization.value || 'Could not verify';
          
          let verifiedDeadline = 'Could not verify';
          if (research.deadline.conflicts && research.deadline.conflicts.length > 0) {
            verifiedDeadline = 'Source conflict detected';
          } else if (research.deadline.verificationStatus === 'verified' && research.deadline.value) {
            verifiedDeadline = research.deadline.value;
          }

          const verifiedEventDate = research.eventDate.value || 'Could not verify';
          const verifiedReg = research.registrationUrl.value || research.officialWebsite.value || 'Could not verify';
          const primarySourceUrl = research.sourcesDiscovered[0]?.url || research.officialWebsite.value || 'Could not verify';
          const lastCheckedTime = new Date(research.retrievalTimestamp).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          const hasConflicts = Boolean(
            (research.deadline.conflicts && research.deadline.conflicts.length > 0) ||
            research.deadline.verificationStatus === 'conflict'
          );

          const verificationLabel =
            hasConflicts
              ? 'Conflict'
              : research.overallState === 'verified'
              ? 'Verified'
              : 'Retrieved';

          replyText = `I found the official information.\n\n` +
            `Name:\n${verifiedName}\n\n` +
            `Organization:\n${verifiedOrg}\n\n` +
            `Deadline:\n${verifiedDeadline}\n\n` +
            `Event date:\n${verifiedEventDate}\n\n` +
            `Registration:\n${verifiedReg}\n\n` +
            `Source:\n${primarySourceUrl}\n\n` +
            `Last checked:\n${lastCheckedTime}\n\n` +
            `Verification:\n${verificationLabel}`;

          if (research.deadline.conflicts && research.deadline.conflicts.length > 0) {
            replyText += `\n\n⚠ **Source conflict detected.**\n` +
              `• Primary (${research.deadline.sourceUrl}): ${research.deadline.value}\n` +
              research.deadline.conflicts.map((c) => `• Discrepancy (${c.sourceUrl}): ${c.value}`).join('\n');
          }

          // Propose adding to tracker
          const oppPayload: Partial<Opportunity> = {
            name: research.eventName.value || verifiedName,
            websiteUrl: research.officialWebsite.value || research.sourcesDiscovered[0]?.url || '',
            registrationUrl: research.registrationUrl.value || '',
            category: research.category.value || 'competition',
            organization: research.organization.value || '',
            deadline: (research.deadline.value && research.deadline.value !== 'null' && /\d/.test(research.deadline.value)) ? research.deadline.value : new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            eventDate: research.eventDate.value || undefined,
            notes: research.description.value || `Researched from ${primarySourceUrl}`,
            tags: research.suggestedTags || ['verified-event'],
            tasks: (research.suggestedTasks || []).map((t, idx) => ({
              id: `task_${Date.now()}_${idx}`,
              name: t.name,
              priority: t.priority as any,
              completed: false,
            })),
            status: research.registrationStatus.value === 'Open' ? 'Planning to register' : 'Interested',
            verifiedFields: {
              deadline: research.deadline,
              registrationStatus: research.registrationStatus,
              eventDate: research.eventDate,
              websiteUrl: research.officialWebsite,
              registrationUrl: research.registrationUrl,
              organization: research.organization,
            },
            sources: research.sourcesDiscovered,
            lastResearchTimestamp: research.retrievalTimestamp,
            researchState: research.overallState,
          };

          const deadlineDisplay = (research.deadline.value && /\d/.test(research.deadline.value)) ? research.deadline.value : 'TBD';

          proposals.push({
            id: `prop_add_${Date.now()}`,
            type: 'create_opportunity',
            title: `Add ${verifiedName} to Tracker`,
            description: `Add ${research.category.value || 'opportunity'} (Deadline: ${deadlineDisplay})`,
            payload: oppPayload,
            status: 'pending',
          });

          replyText += `\n\nWould you like me to add **${verifiedName}** to your tracker? Say **"Add it"** or **"OK"** to save.`;
        }

        res.json({
          reply: replyText,
          proposals,
          suggestedPrompts: [
            'Add to Tracker',
            'Find details about HackMIT',
            'What deadlines are coming up in my tracker?',
          ],
          researchResult: research,
          isResearch: true,
        });
        return;
      } catch (err: any) {
        console.error('Research execution in assistant chat error:', err);
      }
    }

    // Process using assistant engine with natural confirmation & safety flow
    const engineResult = await processAssistantQuery({
      message,
      activeProposal,
      opportunities: items,
      voiceNotes,
      notifications: notifs,
      ai,
    });

    // If an action was naturally confirmed and executed during this query
    let updatedOpportunity: Opportunity | undefined;
    if (engineResult.actionExecuted) {
      try {
        const applyRes = applyActionInternal(
          engineResult.actionExecuted.action,
          items,
          notifs,
          voiceNotes
        );
        updatedOpportunity = applyRes.updatedOpportunity;
      } catch (applyErr: any) {
        console.error('Auto apply action error:', applyErr);
      }
    }

    res.json({
      reply: engineResult.reply,
      proposals: engineResult.proposals || [],
      suggestedPrompts: engineResult.suggestedPrompts || [
        'What should I work on today?',
        'Any deadlines this week?',
        'Which events am I registered for?',
      ],
      actionExecuted: engineResult.actionExecuted,
      actionDiscarded: engineResult.actionDiscarded,
      updatedOpportunity,
    });
  } catch (err: any) {
    console.error('Assistant error:', err);
    res.status(500).json({ error: err.message || 'AI Assistant processing failed' });
  }
});

// POST /api/assistant/apply-action - Execute confirmed action proposal
app.post('/api/assistant/apply-action', (req, res) => {
  try {
    const { action } = req.body;
    if (!action || !action.type) {
      res.status(400).json({ error: 'Action is required' });
      return;
    }

    const items = loadOpportunities();
    const notifs = loadNotifications();
    const voiceNotes = loadVoiceNotes();

    const result = applyActionInternal(action, items, notifs, voiceNotes);
    res.json(result);
  } catch (err: any) {
    console.error('Apply action error:', err);
    res.status(500).json({ error: err.message || 'Failed to execute action' });
  }
});

// ================= VOICE NOTES ENDPOINTS =================
app.get('/api/voice-notes', (req, res) => {
  const notes = loadVoiceNotes();
  const { opportunityId, query } = req.query;

  let filtered = notes;
  if (opportunityId && typeof opportunityId === 'string') {
    filtered = filtered.filter((n) => n.opportunityId === opportunityId);
  }

  if (query && typeof query === 'string') {
    const q = query.toLowerCase().trim();
    filtered = filtered.filter(
      (n) =>
        n.transcription.toLowerCase().includes(q) ||
        (n.summary && n.summary.toLowerCase().includes(q)) ||
        (n.opportunityName && n.opportunityName.toLowerCase().includes(q))
    );
  }

  res.json(filtered);
});

app.post('/api/voice-notes', async (req, res) => {
  try {
    const { opportunityId, opportunityName, transcription, audioDataUrl, durationSeconds } = req.body;
    if (!transcription || !transcription.trim()) {
      res.status(400).json({ error: 'Transcription text is required' });
      return;
    }

    const notes = loadVoiceNotes();
    const newNote: VoiceNote = {
      id: `vn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      opportunityId,
      opportunityName,
      transcription: transcription.trim(),
      audioDataUrl,
      durationSeconds,
      createdAt: new Date().toISOString(),
    };

    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await generateWithFallbacks(ai, {
          contents: `Summarize this spoken voice note in 1 punchy sentence. Text: "${transcription}"`,
        });
        newNote.summary = response.text?.trim();
      } catch {
        newNote.summary = transcription.slice(0, 100) + (transcription.length > 100 ? '...' : '');
      }
    } else {
      newNote.summary = transcription.slice(0, 100) + (transcription.length > 100 ? '...' : '');
    }

    notes.unshift(newNote);
    saveVoiceNotes(notes);
    res.json(newNote);
  } catch (err: any) {
    console.error('Error saving voice note:', err);
    res.status(500).json({ error: err.message || 'Failed to save voice note' });
  }
});

app.delete('/api/voice-notes/:id', (req, res) => {
  const { id } = req.params;
  let notes = loadVoiceNotes();
  notes = notes.filter((n) => n.id !== id);
  saveVoiceNotes(notes);
  res.json({ success: true });
});

// POST /api/voice/analyze - Natural speech intent analysis with actionable suggestions
app.post('/api/voice/analyze', async (req, res) => {
  try {
    const { transcription, currentOpportunityId } = req.body;
    if (!transcription || !transcription.trim()) {
      res.status(400).json({ error: 'Transcription is required' });
      return;
    }

    const items = loadOpportunities();
    const opportunitiesList = items.map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status,
      deadline: o.deadline,
    }));

    const ai = getGeminiClient();
    if (!ai) {
      const q = transcription.toLowerCase();
      let matched = items.find((o) => q.includes(o.name.toLowerCase()));
      if (!matched && currentOpportunityId) {
        matched = items.find((o) => o.id === currentOpportunityId);
      }

      let detectedStatus: OpportunityStatus | undefined;
      if (q.includes('registered') || q.includes('i registered')) detectedStatus = 'Registered';
      else if (q.includes('applied') || q.includes('i applied')) detectedStatus = 'Applied';
      else if (q.includes('planning to register')) detectedStatus = 'Planning to register';
      else if (q.includes('completed')) detectedStatus = 'Completed';

      const detectedTasks: Array<{ name: string; priority: 'low' | 'medium' | 'high' }> = [];
      if (q.includes('read rules') || q.includes('read the rules')) detectedTasks.push({ name: 'Read competition rules', priority: 'high' });
      if (q.includes('prepare environment') || q.includes('environment')) detectedTasks.push({ name: 'Prepare environment', priority: 'high' });
      if (q.includes('submit') || q.includes('proposal')) detectedTasks.push({ name: 'Submit required proposal', priority: 'high' });

      const fallbackResult: VoiceAnalysisResult = {
        transcription,
        detectedEvent: matched ? { name: matched.name, opportunityId: matched.id, matchedExisting: true } : undefined,
        detectedStatus,
        detectedTasks,
        detectedNotes: transcription,
        summary: transcription.slice(0, 120),
        confidence: 'medium',
      };
      res.json(fallbackResult);
      return;
    }

    const prompt = `Analyze this spoken voice note transcription from a developer tracking hackathons, CTFs, competitions, scholarships, and opportunities:
Transcription: "${transcription}"

Existing opportunities in database:
${JSON.stringify(opportunitiesList, null, 2)}
Currently active view opportunity ID (if any): "${currentOpportunityId || ''}"

Return a STRICT JSON object conforming to this schema:
{
  "detectedEvent": {
    "name": "Exact or inferred opportunity name",
    "opportunityId": "id from existing opportunities if it matches, or null if new/unmatched",
    "matchedExisting": boolean
  },
  "detectedStatus": "One of: Interested, Planning to register, Registered, Applied, Selected, In progress, Completed, Rejected, Not participating, or null if no status mentioned",
  "detectedTasks": [
    { "name": "Clear, concise actionable task statement", "priority": "high" | "medium" | "low" }
  ],
  "detectedNotes": "Important notes or details mentioned",
  "summary": "1 sentence executive summary of the voice note",
  "confidence": "high" | "medium" | "low"
}`;

    const response = await generateWithFallbacks(ai, {
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    let parsedResult: VoiceAnalysisResult;
    try {
      const parsed = JSON.parse(response.text || '{}');
      parsedResult = {
        transcription,
        detectedEvent: parsed.detectedEvent?.name ? parsed.detectedEvent : undefined,
        detectedStatus: parsed.detectedStatus || undefined,
        detectedTasks: Array.isArray(parsed.detectedTasks) ? parsed.detectedTasks : [],
        detectedNotes: parsed.detectedNotes || transcription,
        summary: parsed.summary || transcription.slice(0, 100),
        confidence: parsed.confidence || 'high',
      };
    } catch {
      parsedResult = {
        transcription,
        detectedTasks: [],
        detectedNotes: transcription,
        summary: transcription.slice(0, 100),
        confidence: 'low',
      };
    }

    res.json(parsedResult);
  } catch (err: any) {
    console.error('Voice analyze error:', err);
    res.status(500).json({ error: err.message || 'Voice analysis failed' });
  }
});

// POST /api/quick-capture/classify - Universal quick capture
app.post('/api/quick-capture/classify', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input || !input.trim()) {
      res.status(400).json({ error: 'Input text is required' });
      return;
    }

    const items = loadOpportunities();
    const isUrl = /^https?:\/\//i.test(input.trim());

    const ai = getGeminiClient();
    if (!ai) {
      if (isUrl) {
        res.json({
          type: 'opportunity_url',
          title: 'Web Opportunity URL',
          summary: `URL captured: ${input.trim()}`,
          suggestedOpportunity: {
            websiteUrl: input.trim(),
            name: 'Opportunity from Link',
            category: 'hackathon',
            deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          },
        });
      } else {
        res.json({
          type: 'note',
          title: 'Quick Capture Note',
          summary: input.trim().slice(0, 100),
          suggestedNote: { text: input.trim() },
        });
      }
      return;
    }

    const prompt = `Classify this user quick capture input into one of these types:
- 'opportunity_url': If it is a web URL pointing to a hackathon, competition, conference, program, or website.
- 'new_opportunity': If it describes a competition, event, or grant by name and date.
- 'task': If it is an action item or todo (e.g. "submit resume by Friday", "review rules").
- 'note': If it is general knowledge, feedback, or a reminder.

User input: "${input.trim()}"

Existing opportunities for reference:
${JSON.stringify(items.map((o) => ({ id: o.id, name: o.name })), null, 2)}

Return a STRICT JSON object:
{
  "type": "opportunity_url" | "new_opportunity" | "task" | "note",
  "title": "Short descriptive title",
  "summary": "1 sentence explanation of what was captured",
  "suggestedOpportunity": {
    "name": "...",
    "category": "hackathon" | "ctf" | "conference" | "scholarship" | "other",
    "websiteUrl": "...",
    "deadline": "YYYY-MM-DD"
  },
  "suggestedTask": {
    "name": "...",
    "priority": "high" | "medium" | "low",
    "opportunityId": "matching existing opportunity id if applicable"
  },
  "suggestedNote": {
    "text": "...",
    "opportunityId": "matching existing opportunity id if applicable"
  }
}`;

    const response = await generateWithFallbacks(ai, {
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const parsed: QuickCaptureClassification = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch (err: any) {
    console.error('Quick capture classify error:', err);
    res.status(500).json({ error: err.message || 'Quick capture classification failed' });
  }
});

// Notifications Endpoints
app.get('/api/notifications', (req, res) => {
  const notifs = loadNotifications();
  res.json(notifs);
});

app.put('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  const notifs = loadNotifications();
  const item = notifs.find((n) => n.id === id);
  if (item) {
    item.read = true;
    saveNotifications(notifs);
  }
  res.json({ success: true, item });
});

app.put('/api/notifications/read-all', (req, res) => {
  const notifs = loadNotifications();
  notifs.forEach((n) => (n.read = true));
  saveNotifications(notifs);
  res.json({ success: true, count: notifs.length });
});

app.delete('/api/notifications/:id', (req, res) => {
  const { id } = req.params;
  let notifs = loadNotifications();
  notifs = notifs.filter((n) => n.id !== id);
  saveNotifications(notifs);
  res.json({ success: true });
});

// Settings Endpoints
app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const newSettings: NotificationSettings = {
    ...DEFAULT_SETTINGS,
    ...req.body,
  };
  saveSettings(newSettings);
  res.json(newSettings);
});

// ================= VITE MIDDLEWARE / SPA SERVING =================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Opportunity Tracker server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
