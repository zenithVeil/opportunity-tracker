import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { INITIAL_SAMPLE_OPPORTUNITIES, INITIAL_NOTIFICATIONS } from './src/data/defaultOpportunities.js';
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
import { runEventResearchPipeline } from './server/researchPipeline.js';
import {
  processAssistantQuery,
  transcribeAudioWithGemini,
  computeDailyPriorities,
} from './server/assistantEngine.js';

dotenv.config();

const __filenameSafe = typeof import.meta?.url === 'string' ? fileURLToPath(import.meta.url) : (typeof __filename !== 'undefined' ? __filename : '');
const __dirnameSafe = typeof __dirname !== 'undefined' ? __dirname : (__filenameSafe ? path.dirname(__filenameSafe) : process.cwd());

const app = express();
const PORT = 3000;

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

function loadVoiceNotes(): VoiceNote[] {
  try {
    if (fs.existsSync(VOICE_NOTES_FILE)) {
      const raw = fs.readFileSync(VOICE_NOTES_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading voice notes file:', err);
  }
  saveVoiceNotes(INITIAL_VOICE_NOTES);
  return INITIAL_VOICE_NOTES;
}

function saveVoiceNotes(items: VoiceNote[]): void {
  try {
    fs.writeFileSync(VOICE_NOTES_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving voice notes file:', err);
  }
}

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

// Storage helpers
function loadOpportunities(): Opportunity[] {
  try {
    if (fs.existsSync(OPPORTUNITIES_FILE)) {
      const raw = fs.readFileSync(OPPORTUNITIES_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading opportunities file, falling back to sample:', err);
  }
  // Initialize with sample data
  saveOpportunities(INITIAL_SAMPLE_OPPORTUNITIES);
  return INITIAL_SAMPLE_OPPORTUNITIES;
}

function saveOpportunities(items: Opportunity[]): void {
  try {
    fs.writeFileSync(OPPORTUNITIES_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving opportunities file:', err);
  }
}

function loadNotifications(): AppNotification[] {
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      const raw = fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading notifications file:', err);
  }
  saveNotifications(INITIAL_NOTIFICATIONS);
  return INITIAL_NOTIFICATIONS;
}

function saveNotifications(items: AppNotification[]): void {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving notifications file:', err);
  }
}

function loadSettings(): NotificationSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading settings file:', err);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: NotificationSettings): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving settings file:', err);
  }
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
    if (!body.name || !body.deadline) {
      res.status(400).json({ error: 'Name and deadline are required.' });
      return;
    }

    const items = loadOpportunities();
    const newOpportunity: Opportunity = {
      id: `opp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: body.name.trim(),
      websiteUrl: body.websiteUrl?.trim() || '',
      registrationUrl: body.registrationUrl?.trim() || '',
      category: body.category || 'hackathon',
      organization: body.organization?.trim() || 'Independent',
      deadline: body.deadline,
      eventDate: body.eventDate || '',
      status: body.status || 'Interested',
      notes: body.notes || '',
      tasks: Array.isArray(body.tasks) ? body.tasks : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
      reminderDaysBefore: body.reminderDaysBefore || [14, 7, 3, 1, 0],
      provenance: body.provenance || { origin: 'manual', verifiedByCheck: false },
      tracking: {
        lastChecked: null,
        status: 'not_checked',
        failedAttemptsCount: 0,
        changeLog: [],
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
    const updated: Opportunity = {
      ...existing,
      ...req.body,
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
  const targetUrl = opp.websiteUrl;

  if (!targetUrl) {
    res.status(400).json({ error: 'No website URL configured for this opportunity.' });
    return;
  }

  // Strict rule: NEVER pretend a website was checked if it was not actually checked.
  // Validate URL format
  let validUrl: URL;
  try {
    validUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
  } catch {
    opp.tracking.status = 'error';
    opp.tracking.errorMessage = 'Unable to check website: Invalid URL format';
    opp.tracking.lastChecked = new Date().toISOString();
    opp.tracking.failedAttemptsCount = (opp.tracking.failedAttemptsCount || 0) + 1;
    saveOpportunities(items);
    res.json({ success: false, opportunity: opp, message: 'Invalid URL format' });
    return;
  }

  try {
    // Perform server-side fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9-second timeout

    let fetchResponse: Response;
    try {
      fetchResponse = await fetch(validUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OpportunityTrackerBot/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!fetchResponse.ok) {
      opp.tracking.status = 'error';
      opp.tracking.statusCode = fetchResponse.status;
      opp.tracking.errorMessage = `Unable to check website (HTTP ${fetchResponse.status} ${fetchResponse.statusText})`;
      opp.tracking.lastChecked = new Date().toISOString();
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
          message: `Unable to access website for "${opp.name}" repeatedly (HTTP ${fetchResponse.status}).`,
          timestamp: new Date().toISOString(),
          read: false,
          urgency: 'medium',
        });
        saveNotifications(notifs);
      }

      saveOpportunities(items);
      res.json({ success: false, opportunity: opp, message: opp.tracking.errorMessage });
      return;
    }

    const html = await fetchResponse.text();
    const { title, metaDescription, text } = extractTextFromHtml(html);
    const newHash = computeHash(`${title}|${metaDescription}|${text.slice(0, 1500)}`);
    const checkedAt = new Date().toISOString();

    // AI/Regex analysis of the webpage text
    let detectedDeadline = '';
    let detectedEventDate = '';
    let detectedStatus = '';
    let announcements: string[] = [];
    let summary = '';

    const ai = getGeminiClient();
    if (ai && text.length > 50) {
      try {
        const prompt = `Analyze this webpage content for the event/opportunity "${opp.name}".
Current stored deadline: ${opp.deadline}
Current stored event date: ${opp.eventDate || 'None'}
Webpage Title: ${title}
Webpage Content Sample:
${text.slice(0, 4500)}

Task:
Extract with high precision:
1. Registration or submission deadline (YYYY-MM-DD or exact date text found on page). If not found, say null.
2. Event start date (YYYY-MM-DD or text). If not found, say null.
3. Registration status (e.g. "Registration Open", "Submissions Closed", "Applications Live", "Upcoming").
4. Any critical announcements (e.g., date changes, extensions, format changes). List up to 2 items.
5. 1-sentence brief summary of the status on the page.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
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
        }
      } catch (geminiErr) {
        console.error('Gemini analysis error during tracking check:', geminiErr);
        // Fallback to text matching
        summary = metaDescription || title;
      }
    } else {
      // Fallback without AI: use page title and meta description
      summary = metaDescription || `${title} checked successfully`;
      detectedStatus = 'Website Active';
    }

    // Change Detection logic
    const prev = opp.tracking.previousSnapshot;
    const prevHash = opp.tracking.contentHash;
    const hasHashChanged = prevHash && prevHash !== newHash;
    const changeLogEntries: ChangeLogEntry[] = opp.tracking.changeLog || [];
    let isChanged = false;

    // Check if detected deadline differs from previous snapshot or stored deadline
    if (detectedDeadline && prev?.detectedDeadline && detectedDeadline !== prev.detectedDeadline) {
      isChanged = true;
      const entry: ChangeLogEntry = {
        id: `cl_${Date.now()}_1`,
        timestamp: checkedAt,
        field: 'deadline',
        oldVal: prev.detectedDeadline,
        newVal: detectedDeadline,
        description: `Website updated deadline from ${prev.detectedDeadline} to ${detectedDeadline}`,
      };
      changeLogEntries.unshift(entry);

      // Create notification
      const notifs = loadNotifications();
      notifs.unshift({
        id: `notif_chg_${Date.now()}`,
        type: 'website_changed',
        opportunityId: opp.id,
        opportunityName: opp.name,
        title: `Deadline Changed on Website!`,
        message: `Detected updated deadline on ${opp.name} website: ${detectedDeadline}`,
        timestamp: checkedAt,
        read: false,
        urgency: 'high',
      });
      saveNotifications(notifs);
    } else if (hasHashChanged && announcements.length > 0) {
      isChanged = true;
      const entry: ChangeLogEntry = {
        id: `cl_${Date.now()}_2`,
        timestamp: checkedAt,
        field: 'announcements',
        oldVal: prev?.textSnippet?.slice(0, 80) || 'Previous snapshot',
        newVal: announcements[0],
        description: `New announcement: ${announcements[0]}`,
      };
      changeLogEntries.unshift(entry);

      const notifs = loadNotifications();
      notifs.unshift({
        id: `notif_ann_${Date.now()}`,
        type: 'website_changed',
        opportunityId: opp.id,
        opportunityName: opp.name,
        title: `New Update on ${opp.name}`,
        message: announcements[0],
        timestamp: checkedAt,
        read: false,
        urgency: 'medium',
      });
      saveNotifications(notifs);
    }

    // Update tracking info
    opp.tracking = {
      lastChecked: checkedAt,
      status: isChanged ? 'changed' : 'active',
      statusCode: fetchResponse.status,
      contentHash: newHash,
      errorMessage: undefined,
      failedAttemptsCount: 0,
      verifiedInfo: {
        title,
        detectedDeadline: detectedDeadline || undefined,
        detectedEventDate: detectedEventDate || undefined,
        detectedStatus: detectedStatus || 'Active',
        announcements,
        summary: summary || title,
      },
      previousSnapshot: {
        checkedAt,
        title,
        textSnippet: text.slice(0, 300),
        detectedDeadline,
      },
      changeLog: changeLogEntries,
    };

    saveOpportunities(items);
    res.json({
      success: true,
      opportunity: opp,
      isChanged,
      message: isChanged ? 'Changes detected on website!' : 'Website checked. No critical changes detected.',
    });
  } catch (fetchErr: any) {
    console.error('Tracking fetch error:', fetchErr);
    const isTimeout = fetchErr.name === 'AbortError';
    const errorMsg = isTimeout
      ? 'Unable to check website: Request timed out'
      : `Unable to check website: ${fetchErr.message || 'Connection failed'}`;

    opp.tracking.status = 'error';
    opp.tracking.errorMessage = errorMsg;
    opp.tracking.lastChecked = new Date().toISOString();
    opp.tracking.failedAttemptsCount = (opp.tracking.failedAttemptsCount || 0) + 1;

    saveOpportunities(items);
    res.json({ success: false, opportunity: opp, message: errorMsg });
  }
});

// POST Check all websites
app.post('/api/tracking/check-all', async (req, res) => {
  const items = loadOpportunities();
  const trackable = items.filter((o) => o.websiteUrl && o.websiteUrl.startsWith('http'));

  let checkedCount = 0;
  let changedCount = 0;
  let errorCount = 0;

  for (const opp of trackable.slice(0, 10)) { // limit batch size to 10 for speed
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(opp.websiteUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 OpportunityTrackerBot/1.0',
        },
      });
      clearTimeout(timeoutId);

      const checkedAt = new Date().toISOString();
      if (resp.ok) {
        checkedCount++;
        const html = await resp.text();
        const { title, text } = extractTextFromHtml(html);
        const newHash = computeHash(`${title}|${text.slice(0, 1000)}`);
        const prevHash = opp.tracking.contentHash;

        if (prevHash && prevHash !== newHash) {
          changedCount++;
          opp.tracking.status = 'changed';
        } else {
          opp.tracking.status = 'active';
        }
        opp.tracking.lastChecked = checkedAt;
        opp.tracking.contentHash = newHash;
        opp.tracking.statusCode = resp.status;
        opp.tracking.errorMessage = undefined;
      } else {
        errorCount++;
        opp.tracking.status = 'error';
        opp.tracking.errorMessage = `Unable to check website (HTTP ${resp.status})`;
        opp.tracking.lastChecked = checkedAt;
      }
    } catch {
      errorCount++;
      opp.tracking.status = 'error';
      opp.tracking.errorMessage = 'Unable to check website: Connection timed out or failed';
      opp.tracking.lastChecked = new Date().toISOString();
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
      /^find\s+(?:this\s+event|details|info|hackathon|ctf|competition|conference)\b/i.test(lowerQ) ||
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
      (/(?:find|lookup|check)\s+[a-z0-9]/i.test(lowerQ) && (lowerQ.includes('hackathon') || lowerQ.includes('ctf') || lowerQ.includes('fellowship') || lowerQ.includes('competition')));

    if (!isPersonalTrackerQuery && isResearchTrigger) {
      try {
        const research = await runEventResearchPipeline(message, undefined, ai);
        const proposals: AiActionProposal[] = [];
        let replyText = '';

        if (research.overallState === 'unable_to_verify') {
          replyText = `🔎 **Researching current information...**\nSources found: 0\n\n` +
            `**Could not verify this information.**\n\n` +
            `No authoritative source could be discovered for "${message}".\n` +
            `Per strict verification rules, I will not guess or fabricate deadlines, URLs, or registration statuses. If you have the direct website link, you can paste it and I will analyze the live page.`;
        } else {
          const deadlineVerified = research.deadline.verificationStatus === 'verified' && research.deadline.value;
          const regVerified = research.registrationStatus.verificationStatus === 'verified';

          const formatSourceTypeLabel = (st: string) => {
            switch (st) {
              case 'official_event_website': return 'official event website';
              case 'official_registration_page': return 'official registration page';
              case 'official_rules_documentation': return 'official rules / documentation';
              case 'official_organization_announcement': return 'official announcement';
              case 'trusted_secondary_source': return 'trusted secondary source';
              default: return 'verified web source';
            }
          };

          replyText = `🔎 **Researching current information...**\nSources found: ${research.sourcesDiscovered.length}\n\n` +
            `### ${research.eventName.value}\n` +
            (research.organization.value ? `**Organization:** ${research.organization.value}\n\n` : '') +
            `**Deadline:**\n` +
            (deadlineVerified
              ? `${research.deadline.value}\n✓ Verified from ${formatSourceTypeLabel(research.deadline.sourceType)}\n\n`
              : research.deadline.verificationStatus === 'conflict'
              ? `⚠ Conflicting deadlines detected across sources\n\n`
              : `⚠ Deadline could not be verified.\n\n`) +
            `**Registration:**\n` +
            `${research.registrationStatus.value}\n` +
            (regVerified ? `✓ Verified\n\n` : `⚠ Status could not be verified\n\n`) +
            (research.eventDate.value
              ? `**Event date:**\n${research.eventDate.value}\n✓ Verified\n\n`
              : '') +
            (research.officialWebsite.value
              ? `**Official website:**\n[${research.officialWebsite.value}](${research.officialWebsite.value})\n\n`
              : '');

          if (research.deadline.conflicts && research.deadline.conflicts.length > 0) {
            replyText += `⚠ **Source Disagreement:**\n` +
              `• Primary: ${research.deadline.value} (${research.deadline.sourceUrl})\n` +
              research.deadline.conflicts.map((c) => `• Discrepancy: ${c.value} (${c.sourceUrl})`).join('\n') +
              `\n\n`;
          }

          // Build proposal to add to tracker
          const oppPayload: Partial<Opportunity> = {
            name: research.eventName.value,
            websiteUrl: research.officialWebsite.value || research.sourcesDiscovered[0]?.url || '',
            registrationUrl: research.registrationUrl.value || '',
            category: research.category.value,
            organization: research.organization.value,
            deadline: research.deadline.value || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            eventDate: research.eventDate.value || undefined,
            notes: research.description.value,
            tags: research.suggestedTags,
            tasks: research.suggestedTasks.map((t, idx) => ({
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

          proposals.push({
            id: `prop_add_${Date.now()}`,
            type: 'create_opportunity',
            title: `Add ${research.eventName.value} to Tracker`,
            description: `Add verified ${research.category.value} (${research.organization.value || 'Opportunity'}) with deadline ${research.deadline.value || 'TBD'}`,
            payload: oppPayload,
            status: 'pending',
          });
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
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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
