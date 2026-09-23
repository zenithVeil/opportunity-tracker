import { GoogleGenAI, Type } from '@google/genai';
import { Opportunity, ChangeLogEntry, AppNotification, PerSourceTracking } from '../src/types.js';
import { fetchHtmlWithFallbacks } from './researchPipeline.js';
import { isSafePublicUrl } from './security/urlValidator.js';

// Resilient model caller with automatic fallbacks
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

// Helper to sanitize HTML to clean text
export function extractTextFromHtml(html: string): { title: string; metaDescription: string; text: string } {
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
  }

  let metaDescription = '';
  const metaMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  if (metaMatch) {
    metaDescription = metaMatch[1].trim();
  }

  // Remove scripts, styles, svg, noscript
  const cleaned = html
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
export function computeHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}

export interface SourceFactItem {
  sourceUrl: string;
  sourceLabel: string;
  deadline?: string;
  eventDate?: string;
  status?: string;
}

/**
 * Deterministic disagreement detection between extracted source facts
 */
export function detectSourceDisagreements(facts: SourceFactItem[]): string | null {
  const validDeadlines = facts.filter((f) => f.deadline && f.deadline.trim());
  const uniqueDeadlines = Array.from(new Set(validDeadlines.map((d) => d.deadline!.trim())));
  if (uniqueDeadlines.length > 1) {
    const parts = validDeadlines.map((d) => `${d.sourceLabel} reports "${d.deadline}"`);
    return `Conflicting deadlines detected across sources: ${parts.join(' while ')}`;
  }
  return null;
}

export type FetchSourceSuccess = {
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

export type FetchSourceFailure = {
  success: false;
  url: string;
  isPrimary: boolean;
  label: string;
  errorMessage: string;
  statusCode: number;
};

export type FetchSourceResult = FetchSourceSuccess | FetchSourceFailure;

export interface CheckMultiSourceOptions {
  timeoutMs?: number;
  onNotification?: (notif: AppNotification) => void;
  fetchFn?: (url: string, timeoutMs: number) => Promise<{ html: string; status: number } | null>;
  urlValidatorFn?: (url: string) => Promise<boolean>;
}

/**
 * Multi-source tracking check logic:
 * Fetches all of an opportunity's sources (websiteUrl + additionalSources) in parallel using Promise.allSettled.
 * Bounded by SSRF checks (isSafePublicUrl) and timeouts.
 * Reconciles facts across sources with Gemini, flags conflicts in conflictWarning,
 * tracks per-source content hashes, and records source-specific change log entries.
 */
export async function checkOpportunityMultiSource(
  opp: Opportunity,
  ai: GoogleGenAI | null,
  options?: number | CheckMultiSourceOptions
): Promise<{ isChanged: boolean; message: string; success: boolean }> {
  const opts: CheckMultiSourceOptions = typeof options === 'number' ? { timeoutMs: options } : (options || {});
  const timeoutMs = opts.timeoutMs ?? 9000;
  const onNotification = opts.onNotification;
  const fetchFn = opts.fetchFn ?? fetchHtmlWithFallbacks;
  const urlValidatorFn = opts.urlValidatorFn ?? isSafePublicUrl;

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

    // SSRF verification on every source URL
    const isSafe = await urlValidatorFn(validUrl.toString());
    if (!isSafe) {
      return {
        ...item,
        success: false,
        errorMessage: 'Blocked by SSRF security policy',
        statusCode: 403,
      };
    }

    const fetchResult = await fetchFn(validUrl.toString(), timeoutMs);
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
    if (opp.tracking.failedAttemptsCount >= 2 && onNotification) {
      onNotification({
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
          (s, idx) =>
            `--- Source ${idx + 1}: ${s.label} (${s.url}) ---
Page Title: ${s.title}
Meta Description: ${s.metaDescription}
Content Snippet:
${s.text.slice(0, 3500)}`
        )
        .join('\n\n');

      const prompt = `You are an automated opportunity and event intelligence monitor.
We are monitoring the opportunity "${opp.name}" across ${successfulSources.length} distinct web sources.

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
        announcements = Array.isArray(parsed.announcements) ? parsed.announcements : [];
        summary = parsed.summary || '';
        conflictWarning = parsed.conflictWarning || '';
        keyFactsSources = parsed.keyFactsSources || {};
      }
    } catch (aiErr) {
      console.warn('Gemini multi-source reconciliation warning:', aiErr);
    }
  } else {
    // Fallback when AI is not configured: extract title / basic heuristics
    summary = successfulSources.map((s) => `${s.label}: ${s.title}`).join(' | ');
  }

  // Conflict warning notification if a conflict was detected and wasn't already warned
  if (conflictWarning && conflictWarning !== opp.tracking.conflictWarning && onNotification) {
    onNotification({
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

    if (onNotification) {
      onNotification({
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
    }
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
