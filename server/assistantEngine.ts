import { GoogleGenAI } from '@google/genai';
import {
  Opportunity,
  VoiceNote,
  AiActionProposal,
  AppNotification,
  OpportunityStatus,
} from '../src/types.js';

export interface DailyPriorityItem {
  opportunityId: string;
  opportunityName: string;
  deadlineText: string;
  daysRemaining: number;
  status: OpportunityStatus;
  urgencyScore: number;
  priorityTasks: string[];
  reason: string;
}

/**
 * Lightweight, explainable scoring system for daily recommendations.
 * Factors:
 * 1. Deadline urgency (0-2 days = highest, 3-7 days = high, 8-14 days = medium)
 * 2. Registration / Participation status (Registered/Applied carry higher urgency for deliverables)
 * 3. High-priority incomplete tasks
 */
export function computeDailyPriorities(opportunities: Opportunity[], refDate: Date = new Date()): DailyPriorityItem[] {
  const refMs = refDate.getTime();
  const scored: DailyPriorityItem[] = [];

  for (const opp of opportunities) {
    if (opp.status === 'Completed' || opp.status === 'Rejected' || opp.status === 'Not participating') {
      continue;
    }

    let diffDays: number | null = null;
    let deadlineText = 'No deadline';
    if (opp.deadline && opp.deadline.trim()) {
      const deadlineDate = new Date(opp.deadline);
      if (!isNaN(deadlineDate.getTime())) {
        diffDays = Math.ceil((deadlineDate.getTime() - refMs) / (1000 * 60 * 60 * 24));
        deadlineText = opp.deadline.slice(0, 10);
      }
    }
    
    // Skip if deadline was more than 3 days ago
    if (diffDays !== null && diffDays < -3) continue;

    let score = 0;
    let reasonParts: string[] = [];

    // 1. Deadline urgency (only when a valid deadline exists)
    if (diffDays === null) {
      score += 10;
      reasonParts.push('No deadline scheduled');
    } else if (diffDays <= 0) {
      score += 120;
      reasonParts.push('Deadline is today or already due');
    } else if (diffDays <= 2) {
      score += 100;
      reasonParts.push(`Deadline is in ${diffDays} day${diffDays === 1 ? '' : 's'}`);
    } else if (diffDays <= 7) {
      score += 70;
      reasonParts.push(`Deadline is in ${diffDays} days`);
    } else if (diffDays <= 14) {
      score += 40;
      reasonParts.push(`Deadline in ~2 weeks`);
    } else {
      score += 15;
    }

    // 2. Status weighting
    if (opp.status === 'Registered') {
      score += 35;
      reasonParts.push('You are registered');
    } else if (opp.status === 'In progress') {
      score += 30;
      reasonParts.push('Active in progress');
    } else if (opp.status === 'Planning to register') {
      score += 20;
      reasonParts.push('Planning to register');
    } else if (opp.status === 'Applied') {
      score += 15;
    }

    // 3. Pending tasks weighting
    const pendingTasks = (opp.tasks || []).filter((t) => !t.completed);
    const highPriTasks = pendingTasks.filter((t) => t.priority === 'high');

    if (highPriTasks.length > 0) {
      score += highPriTasks.length * 25;
      reasonParts.push(`${highPriTasks.length} high-priority task${highPriTasks.length > 1 ? 's' : ''}`);
    } else if (pendingTasks.length > 0) {
      score += pendingTasks.length * 8;
    }

    scored.push({
      opportunityId: opp.id,
      opportunityName: opp.name,
      deadlineText,
      daysRemaining: diffDays ?? 999,
      status: opp.status,
      urgencyScore: score,
      priorityTasks: highPriTasks.length > 0 ? highPriTasks.map(t => t.name) : pendingTasks.slice(0, 2).map(t => t.name),
      reason: reasonParts.join(' • '),
    });
  }

  return scored.sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Natural language affirmation detection.
 * Enforces strict unambiguity: rejects questions, hesitations, and contrastive conjunctions.
 */
export function isAffirmation(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const raw = text.trim();

  // Any question mark indicates a clarifying question or doubt, NOT an affirmation
  if (raw.includes('?')) return false;

  const clean = raw.toLowerCase().replace(/[.,!;:()]+$/, '').trim();

  // Hesitation or contrastive clauses indicate lack of unambiguous consent
  const hesitationPatterns = [
    /\b(but|wait|hold on|not yet|dont|don't|cancel|stop|nevermind|except|later|maybe|if|unless)\b/i,
    /\b(tell me|what is|how do|what are|why|explain)\b/i
  ];
  for (const pattern of hesitationPatterns) {
    if (pattern.test(clean)) {
      return false;
    }
  }

  const exactAffirmations = [
    'ok', 'okay', 'yes', 'yep', 'yeah', 'yea', 'sure', 'do it', 'save it', 'save', 'confirm',
    'go ahead', 'proceed', 'sounds good', 'do that', 'make it so', 'apply', 'please do',
    'yes please', 'yes do it', 'save note', 'create it', 'add it', 'right', 'correct',
    'looks good', 'approved', 'yes confirm', 'confirm save'
  ];
  if (exactAffirmations.includes(clean)) return true;

  // Only match leading affirmation if remainder contains purely affirmative words (e.g. "yes please", "sure go ahead")
  const leadingAffirmation = /^(yes|ok|okay|sure|save|confirm|proceed)\b/i;
  if (leadingAffirmation.test(clean)) {
    const remainder = clean.replace(leadingAffirmation, '').trim();
    if (!remainder) return true;
    const allowedFollowers = ['please', 'do it', 'go ahead', 'thanks', 'thank you', 'save it', 'add it'];
    return allowedFollowers.some(f => remainder === f || remainder === `please ${f}`);
  }

  return false;
}

/**
 * Natural language rejection detection.
 */
export function isRejection(text: string): boolean {
  const clean = text.toLowerCase().trim().replace(/[.,!?:;]+$/, '');
  const exactRejections = [
    'no', 'cancel', 'dont', "don't", 'stop', 'discard', 'nevermind', 'never mind',
    'dont save', "don't save", "don't save it", 'dont do it', "don't do it",
    'abort', 'reject', 'no thanks', 'skip'
  ];
  if (exactRejections.includes(clean)) return true;
  if (/^(no|cancel|stop|discard|never\s*mind|don't\s*save)\b/i.test(clean)) return true;
  return false;
}

/**
 * Natural language edit detection.
 */
export function isEditRequest(text: string): boolean {
  const clean = text.toLowerCase().trim();
  return (
    clean === 'edit' ||
    clean.startsWith('edit:') ||
    clean.startsWith('change ') ||
    clean.startsWith('modify ') ||
    clean.startsWith('make it ') ||
    clean.startsWith('instead ') ||
    clean.includes('remind me instead') ||
    clean.includes('change deadline to')
  );
}

export interface AssistantChatContext {
  message: string;
  activeProposal?: AiActionProposal | null;
  opportunities: Opportunity[];
  voiceNotes: VoiceNote[];
  notifications: AppNotification[];
  ai: GoogleGenAI | null;
}

export interface AssistantChatResult {
  reply: string;
  proposals?: AiActionProposal[];
  suggestedPrompts?: string[];
  actionExecuted?: {
    action: AiActionProposal;
    message: string;
  };
  actionDiscarded?: boolean;
}

/**
 * Main natural language assistant processor.
 * Adheres to:
 * - Natural confirmation flow: user confirms with "OK", "Yes", "Save it", "Do it" -> executes action.
 * - Natural cancellation flow: user rejects with "No", "Cancel", "Don't save it" -> discards action with NO database changes.
 * - Edit flow: user says "Edit" or modifies the proposed action -> updates proposal.
 * - NO [OK, Save] button: only [Edit] and [Cancel] buttons are displayed.
 * - Confirmation Safety: database changes only occur after clear confirmation. Normal queries answer immediately.
 * - Explainable daily prioritization for "What should I work on today?".
 * - Concise, friendly responses ("Got it 😊", "Sure, I'll check.", "Done 👍").
 */
export async function processAssistantQuery(
  context: AssistantChatContext
): Promise<AssistantChatResult> {
  const { message, activeProposal, opportunities, voiceNotes, notifications, ai } = context;
  const rawQ = message.trim();
  const lowerQ = rawQ.toLowerCase();

  // 1. ACTIVE PROPOSAL CONFIRMATION CHECK
  if (activeProposal && activeProposal.status === 'pending') {
    if (isAffirmation(lowerQ)) {
      let confirmMessage = 'Done 👍 Action executed.';
      if (activeProposal.type === 'add_note') {
        confirmMessage = 'Done 👍 Saved it as a note.';
      } else if (activeProposal.type === 'create_reminder') {
        confirmMessage = 'Done 👍 Created reminder.';
      } else if (activeProposal.type === 'create_task') {
        confirmMessage = `Done 👍 Created task "${activeProposal.payload?.name || 'New Task'}".`;
      } else if (activeProposal.type === 'create_opportunity') {
        confirmMessage = `Done 👍 Added "${activeProposal.payload?.name || 'Opportunity'}" to your tracker.`;
      } else if (activeProposal.type === 'update_status') {
        confirmMessage = `Done 👍 Updated status to ${activeProposal.payload?.status}.`;
      } else if (activeProposal.type === 'complete_task') {
        confirmMessage = 'Done 👍 Marked task as complete.';
      }

      return {
        reply: confirmMessage,
        actionExecuted: {
          action: { ...activeProposal, status: 'applied' },
          message: confirmMessage,
        },
        suggestedPrompts: [
          'What should I work on today?',
          'Any deadlines this week?',
          'What tasks are incomplete?',
        ],
      };
    }

    if (isRejection(lowerQ)) {
      return {
        reply: 'Cancelled 👍 No changes were made.',
        actionDiscarded: true,
        proposals: [],
        suggestedPrompts: [
          'What should I work on today?',
          'What deadlines do I have this week?',
          'Add a note',
        ],
      };
    }

    if (isEditRequest(lowerQ)) {
      // Modify proposal
      let updatedPayload = { ...(activeProposal.payload || {}) };
      let newDesc = activeProposal.description;

      if (lowerQ.includes('three days') || lowerQ.includes('3 days')) {
        updatedPayload.daysBefore = 3;
        newDesc = 'Remind 3 days before the deadline';
      } else if (lowerQ.includes('tomorrow')) {
        updatedPayload.daysBefore = 1;
        newDesc = 'Remind tomorrow';
      } else if (lowerQ.includes('one day') || lowerQ.includes('1 day')) {
        updatedPayload.daysBefore = 1;
        newDesc = 'Remind 1 day before deadline';
      }

      const updatedProposal: AiActionProposal = {
        ...activeProposal,
        description: newDesc,
        payload: updatedPayload,
      };

      return {
        reply: `Got it 😊 I updated the proposal:\n\n**${updatedProposal.title}**\n${updatedProposal.description}\n\nShould I do that?`,
        proposals: [updatedProposal],
      };
    }
  }

  // 2. CHECK FOR NATURAL DATA-MODIFICATION INTENTS (Confirmation Safety Rule)
  // A. Note Creation: "Remember that I need to finish the AI presentation"
  const noteMatch = rawQ.match(/^(?:remember\s+that|note\s+that|add\s+(?:this\s+)?to\s+(?:my\s+)?notes?|create\s+(?:a\s+)?note|take\s+(?:a\s+)?note|save\s+(?:as\s+)?note|new\s+note[:\s]*)(.*)/i);
  if (noteMatch && noteMatch[1].trim()) {
    const noteText = noteMatch[1].trim().replace(/^[:,-]\s*/, '');
    // Try to match an existing opportunity
    const matchedOpp = opportunities.find((o) =>
      noteText.toLowerCase().includes(o.name.toLowerCase()) ||
      (o.organization && noteText.toLowerCase().includes(o.organization.toLowerCase()))
    );

    const proposal: AiActionProposal = {
      id: `prop_note_${Date.now()}`,
      type: 'add_note',
      title: matchedOpp ? `Add Note to ${matchedOpp.name}` : 'Save Note',
      description: `Create note: "${noteText}"${matchedOpp ? ` for ${matchedOpp.name}` : ''}`,
      opportunityId: matchedOpp?.id,
      opportunityName: matchedOpp?.name,
      payload: { note: noteText },
      status: 'pending',
    };

    return {
      reply: `I understood that you want to save this as a note:\n\n**Note:** ${noteText}${matchedOpp ? `\n*(linked to ${matchedOpp.name})*` : ''}\n\nShould I do that?`,
      proposals: [proposal],
      suggestedPrompts: ['OK', 'Cancel', 'Edit'],
    };
  }

  // B. Reminder Creation: "Remind me two days before the deadline", "Remind me tomorrow"
  const reminderMatch = rawQ.match(/^(?:remind\s+me|set\s+(?:a\s+)?reminder|create\s+(?:a\s+)?reminder|alert\s+me)\s+(.*)/i);
  if (reminderMatch && reminderMatch[1].trim()) {
    const reminderDetails = reminderMatch[1].trim();
    // Check if mentions days before
    let daysBefore = 1;
    if (/(\d+)\s+days?\s+before/i.test(reminderDetails)) {
      const m = reminderDetails.match(/(\d+)\s+days?\s+before/i);
      if (m) daysBefore = parseInt(m[1], 10);
    } else if (/two\s+days?\s+before/i.test(reminderDetails)) {
      daysBefore = 2;
    } else if (/three\s+days?\s+before/i.test(reminderDetails)) {
      daysBefore = 3;
    } else if (/tomorrow/i.test(reminderDetails)) {
      daysBefore = 1;
    }

    const matchedOpp = opportunities.find((o) =>
      reminderDetails.toLowerCase().includes(o.name.toLowerCase()) ||
      (o.organization && reminderDetails.toLowerCase().includes(o.organization.toLowerCase()))
    ) || opportunities[0];

    const proposal: AiActionProposal = {
      id: `prop_rem_${Date.now()}`,
      type: 'create_reminder',
      title: `Set Reminder for ${matchedOpp?.name || 'Opportunity'}`,
      description: `Remind ${daysBefore} day${daysBefore === 1 ? '' : 's'} before deadline`,
      opportunityId: matchedOpp?.id,
      opportunityName: matchedOpp?.name,
      payload: {
        daysBefore,
        opportunityId: matchedOpp?.id,
        opportunityName: matchedOpp?.name,
        title: `Reminder: ${matchedOpp?.name || 'Upcoming Opportunity'}`,
        message: `Deadline approaching in ${daysBefore} days`,
      },
      status: 'pending',
    };

    return {
      reply: `I understood that you want to set a reminder ${daysBefore} day${daysBefore === 1 ? '' : 's'} before the deadline${matchedOpp ? ` for **${matchedOpp.name}**` : ''}.\n\nShould I do that?`,
      proposals: [proposal],
      suggestedPrompts: ['OK', 'Cancel', 'Edit'],
    };
  }

  // C. Task Creation: "Create a task to finish the application"
  const taskMatch = rawQ.match(/^(?:create\s+(?:a\s+)?task|add\s+(?:a\s+)?task|new\s+task)\s+(?:to\s+)?(.*)/i);
  if (taskMatch && taskMatch[1].trim()) {
    const taskDetails = taskMatch[1].trim();
    const matchedOpp = opportunities.find((o) =>
      taskDetails.toLowerCase().includes(o.name.toLowerCase()) ||
      (o.organization && taskDetails.toLowerCase().includes(o.organization.toLowerCase()))
    ) || opportunities[0];

    const cleanTaskName = taskDetails
      .replace(new RegExp(`for\\s+${matchedOpp?.name}`, 'i'), '')
      .replace(/^[:,-]\s*/, '')
      .trim();

    const proposal: AiActionProposal = {
      id: `prop_task_${Date.now()}`,
      type: 'create_task',
      title: `Add Task to ${matchedOpp?.name || 'Opportunity'}`,
      description: `Create task: "${cleanTaskName}"`,
      opportunityId: matchedOpp?.id,
      opportunityName: matchedOpp?.name,
      payload: {
        name: cleanTaskName,
        priority: lowerQ.includes('high') || lowerQ.includes('urgent') ? 'high' : 'medium',
      },
      status: 'pending',
    };

    return {
      reply: `I understood that you want to create a task:\n\n• **${cleanTaskName}**${matchedOpp ? ` for **${matchedOpp.name}**` : ''}\n\nShould I do that?`,
      proposals: [proposal],
      suggestedPrompts: ['OK', 'Cancel', 'Edit'],
    };
  }

  // D. Status Update: "Mark this as registered", "Mark DEF CON CTF as registered", "I registered for..."
  const statusMatch = rawQ.match(/(?:mark|set|update)\s+(.*?)\s+(?:as|to)\s+(registered|applied|in progress|completed|planning to register|interested)/i) ||
    rawQ.match(/^i\s+(registered|applied)\s+(?:for\s+)?(.*)/i);

  if (statusMatch) {
    let targetStatus: OpportunityStatus = 'Registered';
    let targetName = '';

    if (rawQ.toLowerCase().startsWith('i registered')) {
      targetStatus = 'Registered';
      targetName = statusMatch[2] || '';
    } else if (rawQ.toLowerCase().startsWith('i applied')) {
      targetStatus = 'Applied';
      targetName = statusMatch[2] || '';
    } else {
      targetName = statusMatch[1] || '';
      const rawStatus = (statusMatch[2] || '').toLowerCase();
      if (rawStatus.includes('registered')) targetStatus = 'Registered';
      else if (rawStatus.includes('applied')) targetStatus = 'Applied';
      else if (rawStatus.includes('completed')) targetStatus = 'Completed';
      else if (rawStatus.includes('progress')) targetStatus = 'In progress';
      else if (rawStatus.includes('plan')) targetStatus = 'Planning to register';
      else targetStatus = 'Interested';
    }

    const matchedOpp = opportunities.find((o) =>
      targetName && (o.name.toLowerCase().includes(targetName.toLowerCase()) ||
      (o.organization && o.organization.toLowerCase().includes(targetName.toLowerCase())))
    ) || opportunities[0];

    const proposal: AiActionProposal = {
      id: `prop_stat_${Date.now()}`,
      type: 'update_status',
      title: `Update Status: ${matchedOpp.name}`,
      description: `Change status from "${matchedOpp.status}" to "${targetStatus}"`,
      opportunityId: matchedOpp.id,
      opportunityName: matchedOpp.name,
      payload: { status: targetStatus },
      status: 'pending',
    };

    return {
      reply: `I understood that you want to mark **${matchedOpp.name}** as **${targetStatus}**.\n\nShould I do that?`,
      proposals: [proposal],
      suggestedPrompts: ['OK', 'Cancel', 'Edit'],
    };
  }

  // E. Opportunity Creation: "Add this hackathon to my tracker and remind me two days before the deadline"
  const addOppMatch = rawQ.match(/^(?:add|track)\s+(?:this\s+)?(hackathon|ctf|workshop|competition|program|event)?\s*(?:named\s+)?(.*)/i);
  if (addOppMatch && (lowerQ.includes('to my tracker') || lowerQ.includes('to tracker') || lowerQ.includes('remind me'))) {
    let extractedName = addOppMatch[2]
      ? addOppMatch[2].replace(/to\s+(?:my\s+)?tracker.*/i, '').replace(/and\s+remind.*/i, '').trim()
      : 'New Hackathon';
    if (!extractedName || extractedName.length < 2) extractedName = 'New Opportunity';

    let daysBefore = 2;
    if (/three\s+days?\s+before/i.test(rawQ) || /3\s+days?\s+before/i.test(rawQ)) daysBefore = 3;
    else if (/one\s+day\s+before/i.test(rawQ) || /1\s+day\s+before/i.test(rawQ)) daysBefore = 1;

    const proposal: AiActionProposal = {
      id: `prop_add_${Date.now()}`,
      type: 'create_opportunity',
      title: `Add ${extractedName} to Tracker`,
      description: `Add to tracker and set reminder ${daysBefore} days before deadline`,
      payload: {
        name: extractedName,
        category: 'hackathon',
        deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        status: 'Interested',
        reminderDaysBefore: [daysBefore, 7, 14],
      },
      status: 'pending',
    };

    return {
      reply: `I understood that you want to add **${extractedName}** to your tracker and create a reminder ${daysBefore} days before the deadline.\n\nShould I do that?`,
      proposals: [proposal],
      suggestedPrompts: ['OK', 'Cancel', 'Edit'],
    };
  }

  // 3. READ-ONLY QUERY HANDLING (Answering directly using stored tracker data)
  // A. "What should I work on today?" / "What do I need to do today?"
  if (
    lowerQ.includes('what should i') ||
    lowerQ.includes('what do i need to do') ||
    lowerQ.includes('focus on today') ||
    lowerQ.includes('work on today') ||
    lowerQ.includes('priorities for today')
  ) {
    const priorities = computeDailyPriorities(opportunities);
    if (priorities.length === 0) {
      return {
        reply: 'All clear today! 😊 You have no urgent deadlines or pending high-priority tasks in your tracker.',
        suggestedPrompts: ['What deadlines do I have this week?', 'Show registered events'],
      };
    }

    const top = priorities.slice(0, 3);
    const lines = top.map((p, idx) => {
      const taskSnippet = p.priorityTasks.length > 0 ? `\n  • **Next task:** ${p.priorityTasks[0]}` : '';
      return `${idx + 1}. **${p.opportunityName}** (${p.reason})${taskSnippet}`;
    });

    return {
      reply: `Here is what you should focus on today:\n\n${lines.join('\n\n')}`,
      suggestedPrompts: ['What deadlines do I have this week?', 'Which events am I registered for?'],
    };
  }

  // B. "Any deadlines this week?" / "Deadlines coming up"
  if (lowerQ.includes('deadline') || lowerQ.includes('this week') || lowerQ.includes('upcoming')) {
    const refDate = new Date('2026-09-12');
    const upcoming = opportunities
      .map((o) => {
        const diff = Math.ceil((new Date(o.deadline).getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        return { ...o, diff };
      })
      .filter((o) => o.diff >= 0 && o.diff <= 14)
      .sort((a, b) => a.diff - b.diff);

    if (upcoming.length === 0) {
      return {
        reply: 'You have no deadlines approaching in the next two weeks 😊',
        suggestedPrompts: ['What should I work on today?', 'Which events am I registered for?'],
      };
    }

    const lines = upcoming.slice(0, 4).map((u) => {
      const diffStr = u.diff === 0 ? 'Today!' : u.diff === 1 ? 'Tomorrow' : `in ${u.diff} days`;
      return `• **${u.name}** — ${u.deadline.slice(0, 10)} (*${diffStr}*) [Status: ${u.status}]`;
    });

    return {
      reply: `Here are your upcoming deadlines:\n\n${lines.join('\n')}`,
      suggestedPrompts: ['What should I work on today?', 'Which events am I registered for?'],
    };
  }

  // C. "Which events am I registered for?" / "Registered opportunities"
  if (lowerQ.includes('registered') || lowerQ.includes('applied')) {
    const registered = opportunities.filter((o) => o.status === 'Registered' || o.status === 'Selected' || o.status === 'Applied');
    if (registered.length === 0) {
      return {
        reply: 'You are not currently marked as registered or applied for any events.',
        suggestedPrompts: ['What should I work on today?', 'Show upcoming hackathons'],
      };
    }

    const lines = registered.map((r) => `• **${r.name}** (${r.organization}) — Status: *${r.status}*, Deadline: ${r.deadline.slice(0, 10)}`);
    return {
      reply: `You are participating in **${registered.length}** event${registered.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}`,
      suggestedPrompts: ['What should I work on today?', 'Any deadlines this week?'],
    };
  }

  // D. "What tasks are incomplete?" / "Show my tasks"
  if (lowerQ.includes('task') || lowerQ.includes('todo')) {
    const pendingTasks: Array<{ oppName: string; taskName: string; priority: string }> = [];
    opportunities.forEach((o) => {
      (o.tasks || []).filter((t) => !t.completed).forEach((t) => {
        pendingTasks.push({ oppName: o.name, taskName: t.name, priority: t.priority });
      });
    });

    if (pendingTasks.length === 0) {
      return {
        reply: 'Great job! 🎉 You have completed all tasks in your tracker.',
        suggestedPrompts: ['What should I work on today?', 'Any deadlines this week?'],
      };
    }

    const lines = pendingTasks.slice(0, 5).map((t) => `• **${t.oppName}**: ${t.taskName} \`[${t.priority.toUpperCase()}]\``);
    return {
      reply: `You have **${pendingTasks.length} incomplete tasks**:\n\n${lines.join('\n')}`,
      suggestedPrompts: ['What should I work on today?', 'Any deadlines this week?'],
    };
  }

  // 4. GEMINI REASONING WITH FALLBACK
  if (ai) {
    try {
      const summaryContext = opportunities.map((o) => ({
        id: o.id,
        name: o.name,
        category: o.category,
        deadline: o.deadline,
        status: o.status,
        tasks: o.tasks?.map((t) => ({ name: t.name, completed: t.completed, priority: t.priority })),
      }));

      const prompt = `You are the friendly, fast, intelligent assistant for Opportunity Tracker.
Today is: 2026-09-12.
Stored Opportunities: ${JSON.stringify(summaryContext)}

User Query: "${rawQ}"

DIRECTIVES:
1. Respond concisely and naturally. Prefer short friendly phrases like "Got it 😊", "Done 👍", "Sure, I'll check."
2. Ground all answers strictly in the stored data. Never invent facts.
3. If proposing a database change (e.g. note, task, reminder, status, opportunity), format:
   "I understood that you want to [action]. Should I do that?"
   AND append:
   \`\`\`json:actions
   [{ "id": "act_${Date.now()}", "type": "add_note" | "create_task" | "create_reminder" | "update_status" | "create_opportunity", "title": "...", "description": "...", "payload": { ... } }]
   \`\`\`
4. If it's a question about existing data, answer immediately and directly with no code block.`;

      // Prioritize gemini-3.8-flash first for high speed and reliability, then gemini-flash-latest, gemini-3.1-flash-lite
      const models = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
      for (const model of models) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
          });

          const rawText = (response.text || '').trim();
          let cleanReply = rawText;
          let proposals: AiActionProposal[] = [];

          const actionMatch = rawText.match(/```json:actions\s*([\s\S]*?)\s*```/);
          if (actionMatch) {
            try {
              const parsed = JSON.parse(actionMatch[1]);
              if (Array.isArray(parsed)) {
                proposals = parsed.map((p, idx) => ({
                  id: p.id || `prop_${Date.now()}_${idx}`,
                  type: p.type || 'update_status',
                  title: p.title || 'Proposed Update',
                  description: p.description || '',
                  opportunityId: p.opportunityId,
                  opportunityName: p.opportunityName,
                  payload: p.payload || {},
                  status: 'pending',
                }));
              }
            } catch {
              // ignore parse err
            }
            cleanReply = rawText.replace(/```json:actions\s*[\s\S]*?\s*```/, '').trim();
          }

          if (cleanReply) {
            return {
              reply: cleanReply,
              proposals,
              suggestedPrompts: [
                'What should I work on today?',
                'Any deadlines this week?',
                'Which events am I registered for?',
              ],
            };
          }
        } catch (modelErr: any) {
          const errStr = String(modelErr?.message || modelErr);
          const is503 = errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('high demand');
          if (is503) {
            console.warn(`Assistant model ${model} temporarily busy (503). Switching to fallback...`);
          } else {
            console.warn(`Model ${model} query failed:`, modelErr.message || modelErr);
          }
        }
      }
    } catch (err: any) {
      console.warn('Gemini reasoning fallback triggered:', err.message || err);
    }
  }

  // Default friendly fallback
  return {
    reply: `I can help you track deadlines, prioritize daily work, set reminders, take voice notes, and research hackathons or CTFs 😊 What would you like to do?`,
    suggestedPrompts: [
      'What should I work on today?',
      'Any deadlines this week?',
      'Which events am I registered for?',
      'Remember that I need to finish my slides',
    ],
  };
}

/**
 * Transcribe base64 audio data using Gemini multimodal audio capabilities with model fallback.
 */
export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType = 'audio/webm',
  aiClient: GoogleGenAI | null
): Promise<{ success: boolean; transcription: string; error?: string }> {
  if (!aiClient) {
    return {
      success: false,
      transcription: '',
      error: 'Gemini API client is not configured',
    };
  }

  // Support models with multimodal audio capabilities, prioritizing specialized audio models
  const models = ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-flash-latest'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await aiClient.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe the spoken words in this audio exactly as uttered. Return ONLY the transcription text, nothing else. If no speech is present, return empty string.',
              },
            ],
          },
        ],
      });

      const text = (response.text || '').trim();
      return {
        success: true,
        transcription: text,
      };
    } catch (err: any) {
      lastError = err.message || String(err);
      const is503 = lastError.includes('503') || lastError.includes('UNAVAILABLE') || lastError.includes('high demand');
      if (is503) {
        console.warn(`Audio transcription model ${model} temporarily busy (503). Trying fallback...`);
      } else {
        console.warn(`Audio transcription model ${model} error:`, lastError);
      }
    }
  }

  return {
    success: false,
    transcription: '',
    error: lastError || 'Audio transcription failed on all fallback models',
  };
}


