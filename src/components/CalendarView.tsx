import React, { useState, useMemo } from 'react';
import { Opportunity } from '../types';
import { formatDate } from '../utils/dateUtils';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Target,
  CheckCircle2,
  CalendarDays,
  ListOrdered,
} from 'lucide-react';

interface CalendarViewProps {
  opportunities: Opportunity[];
  onSelectOpportunity: (opp: Opportunity) => void;
}

interface CalendarEventItem {
  id: string;
  opportunityId: string;
  opportunityName: string;
  category: string;
  type: 'deadline' | 'event_start' | 'task';
  title: string;
  date: string; // YYYY-MM-DD
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  opportunities,
  onSelectOpportunity,
}) => {
  const [viewStyle, setViewStyle] = useState<'calendar' | 'timeline'>('calendar');
  // Anchor month: Sep 2026 (month index 8)
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(8); // 8 is September (0-indexed)
  const [selectedDayEvents, setSelectedDayEvents] = useState<{
    dateStr: string;
    events: CalendarEventItem[];
  } | null>(null);

  // Compile all date milestones
  const allEvents: CalendarEventItem[] = useMemo(() => {
    const list: CalendarEventItem[] = [];

    opportunities.forEach((opp) => {
      // Deadline
      if (opp.deadline) {
        const datePart = opp.deadline.split('T')[0];
        list.push({
          id: `${opp.id}-deadline`,
          opportunityId: opp.id,
          opportunityName: opp.name,
          category: opp.category,
          type: 'deadline',
          title: `Deadline: ${opp.name}`,
          date: datePart,
        });
      }

      // Start Date
      if (opp.eventStartDate) {
        const datePart = opp.eventStartDate.split('T')[0];
        list.push({
          id: `${opp.id}-start`,
          opportunityId: opp.id,
          opportunityName: opp.name,
          category: opp.category,
          type: 'event_start',
          title: `Event Starts: ${opp.name}`,
          date: datePart,
        });
      }

      // Tasks with due dates
      opp.tasks.forEach((t) => {
        if (t.dueDate) {
          const datePart = t.dueDate.split('T')[0];
          list.push({
            id: `${opp.id}-task-${t.id}`,
            opportunityId: opp.id,
            opportunityName: opp.name,
            category: opp.category,
            type: 'task',
            title: `Task: ${t.name}`,
            date: datePart,
          });
        }
      });
    });

    return list;
  }, [opportunities]);

  // Calendar calculations
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Group events by YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    allEvents.forEach((ev) => {
      const existing = map.get(ev.date) || [];
      existing.push(ev);
      map.set(ev.date, existing);
    });
    return map;
  }, [allEvents]);

  // Sort timeline events chronologically
  const sortedTimelineEvents = useMemo(() => {
    return [...allEvents].sort((a, b) => a.date.localeCompare(b.date));
  }, [allEvents]);

  return (
    <div id="calendar-timeline-view" className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-cyan-400" />
            <span>Opportunity Calendar & Timeline</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Visualize registration deadlines, competition start dates, and milestones.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#1e293b] bg-[#0c101a] p-1">
            <button
              onClick={() => setViewStyle('calendar')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                viewStyle === 'calendar'
                  ? 'bg-[#1e293b] text-cyan-300 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Month Grid</span>
            </button>
            <button
              onClick={() => setViewStyle('timeline')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                viewStyle === 'timeline'
                  ? 'bg-[#1e293b] text-cyan-300 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListOrdered className="h-3.5 w-3.5" />
              <span>Roadmap Timeline</span>
            </button>
          </div>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="flex items-center gap-4 text-xs text-slate-400 border-b border-[#1e293b] pb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          <span>Registration Deadline</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
          <span>Event / Hackathon Start</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span>Task Milestone</span>
        </div>
      </div>

      {/* View: Month Grid */}
      {viewStyle === 'calendar' ? (
        <div className="space-y-4">
          {/* Month Navigator */}
          <div className="flex items-center justify-between rounded-xl border border-[#1e293b] bg-[#0c101a] px-4 py-3">
            <h2 className="text-base font-bold text-white">
              {monthNames[currentMonth]} {currentYear}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-[#162033] hover:text-white transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  setCurrentYear(2026);
                  setCurrentMonth(8);
                }}
                className="rounded-lg px-2.5 py-1 text-xs text-cyan-400 hover:bg-[#162033]"
              >
                Today (Sep 2026)
              </button>
              <button
                onClick={nextMonth}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-[#162033] hover:text-white transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Calendar Table */}
          <div className="rounded-xl border border-[#1e293b] bg-[#101524] overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-[#1e293b] bg-[#0e1320] text-center text-xs font-semibold uppercase text-slate-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="py-2.5">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-[#182236]">
              {/* Blank cells for offset */}
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-24 bg-[#090d16]/50 p-2" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const monthStr = String(currentMonth + 1).padStart(2, '0');
                const dayStr = String(dayNum).padStart(2, '0');
                const dateKey = `${currentYear}-${monthStr}-${dayStr}`;
                const eventsOnThisDay = eventsByDate.get(dateKey) || [];
                const isToday =
                  currentYear === 2026 && currentMonth === 8 && dayNum === 12;

                return (
                  <div
                    key={dateKey}
                    onClick={() => {
                      if (eventsOnThisDay.length > 0) {
                        setSelectedDayEvents({ dateStr: dateKey, events: eventsOnThisDay });
                      }
                    }}
                    className={`min-h-24 p-2 transition-colors ${
                      eventsOnThisDay.length > 0
                        ? 'cursor-pointer hover:bg-[#141d30]'
                        : 'hover:bg-[#0f1422]'
                    } ${isToday ? 'bg-cyan-950/20 ring-1 ring-inset ring-cyan-500/40' : ''}`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs ${
                          isToday
                            ? 'bg-cyan-500 font-bold text-black'
                            : 'text-slate-300'
                        }`}
                      >
                        {dayNum}
                      </span>

                      {eventsOnThisDay.length > 0 && (
                        <span className="text-[10px] font-bold text-cyan-400 font-mono">
                          {eventsOnThisDay.length} ev
                        </span>
                      )}
                    </div>

                    {/* Event pills in cell */}
                    <div className="space-y-1 mt-1">
                      {eventsOnThisDay.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${
                            ev.type === 'deadline'
                              ? 'bg-rose-950/70 text-rose-300 border border-rose-800/60'
                              : ev.type === 'event_start'
                              ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/60'
                              : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60'
                          }`}
                          title={ev.title}
                        >
                          {ev.type === 'deadline' ? '⏰ ' : ev.type === 'event_start' ? '🚀 ' : '✓ '}
                          {ev.opportunityName}
                        </div>
                      ))}
                      {eventsOnThisDay.length > 2 && (
                        <div className="text-[10px] text-slate-500 pl-1">
                          +{eventsOnThisDay.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Day Drawer/Modal Popup */}
          {selectedDayEvents && (
            <div className="rounded-xl border border-cyan-500/30 bg-[#0c1220] p-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">
                    Milestones for {formatDate(selectedDayEvents.dateStr)}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedDayEvents(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="space-y-2">
                {selectedDayEvents.events.map((ev) => {
                  const targetOpp = opportunities.find((o) => o.id === ev.opportunityId);
                  return (
                    <div
                      key={ev.id}
                      onClick={() => targetOpp && onSelectOpportunity(targetOpp)}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-[#1e293b] bg-[#101627] hover:border-cyan-500/50 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            ev.type === 'deadline'
                              ? 'bg-rose-500'
                              : ev.type === 'event_start'
                              ? 'bg-cyan-400'
                              : 'bg-emerald-400'
                          }`}
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-100">{ev.title}</div>
                          <div className="text-[11px] text-slate-400">{ev.opportunityName}</div>
                        </div>
                      </div>
                      <span className="text-cyan-400 text-xs hover:underline">View Opportunity &rarr;</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Timeline Roadmap View */
        <div className="space-y-4">
          <div className="relative border-l-2 border-[#1e293b] pl-6 ml-4 space-y-6">
            {sortedTimelineEvents.map((ev) => {
              const targetOpp = opportunities.find((o) => o.id === ev.opportunityId);
              return (
                <div
                  key={ev.id}
                  onClick={() => targetOpp && onSelectOpportunity(targetOpp)}
                  className="relative group cursor-pointer"
                >
                  {/* Dot on line */}
                  <span
                    className={`absolute -left-[31px] top-1.5 h-4 w-4 rounded-full border-2 border-[#090d16] ${
                      ev.type === 'deadline'
                        ? 'bg-rose-500'
                        : ev.type === 'event_start'
                        ? 'bg-cyan-400'
                        : 'bg-emerald-400'
                    }`}
                  />

                  <div className="rounded-xl border border-[#1e293b] bg-[#101524] p-3.5 transition-all hover:border-cyan-500/40 hover:bg-[#131b2e]">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono text-cyan-400 font-semibold">
                        {formatDate(ev.date)}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          ev.type === 'deadline'
                            ? 'bg-rose-500/20 text-rose-300'
                            : ev.type === 'event_start'
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {ev.type.replace('_', ' ')}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                      {ev.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">{ev.opportunityName}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
