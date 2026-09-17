import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { useToast } from '../ToastContext.jsx';

const EVENT_TYPES = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'exam', label: 'Exam' },
  { value: 'study', label: 'Study session' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'other', label: 'Other' },
];

const GOAL_CATEGORIES = [
  { value: 'graduation', label: 'Graduation' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'exam', label: 'Exam' },
  { value: 'other', label: 'Other' },
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CALENDAR_VIEW_MODES = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

// ---- Tasks + Deadlines constants (Task Management / Deadline Tracker) -----

const TASK_VIEW_MODES = [
  { value: 'active', label: 'Active' },
  { value: 'archive', label: 'Archive' },
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom (every N days)' },
];

const DEADLINE_EVENT_TYPES = ['assignment', 'exam'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(key, n) {
  const d = parseDateKey(key);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Sunday-start, matching WEEKDAY_LABELS / buildMonthGrid's convention below.
function startOfWeek(date) {
  const day = date.getDay();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
}

function buildWeekGrid(date) {
  const start = startOfWeek(date);
  const cells = [];
  for (let i = 0; i < 7; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

function formatDateKeyLong(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateShort(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ---- Week/Day time-grid helpers (CalendarTimeGrid below) --------------

const DAY_HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHourLabel(hour) {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

// Decorative "GMT-08"-style label for the time rail's top corner, matching
// the viewer's own offset. Only the whole-hour part is shown (like Google
// Calendar's own label) -- close enough for a decorative touch, not meant
// to handle half-hour-offset timezones precisely.
function gmtOffsetLabel() {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const hh = pad2(Math.floor(Math.abs(offsetMin) / 60));
  return `GMT${sign}${hh}`;
}

// Whole-calendar-days between today and `dateLike` (ISO date or datetime
// string), ignoring time-of-day -- 0 = today, positive = future, negative =
// overdue. Shared by the Tasks tab's "Skip to tomorrow" eligibility check and
// the Deadlines tab's "in N days" / "overdue by N days" labels.
function daysUntil(dateLike) {
  if (!dateLike) return null;
  const target = parseDateKey(toDateKey(new Date(dateLike)));
  const today = parseDateKey(todayKey());
  return Math.round((target - today) / 86400000);
}

function formatDaysRemaining(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'in 1 day';
  if (n > 1) return `in ${n} days`;
  if (n === -1) return 'overdue by 1 day';
  return `overdue by ${Math.abs(n)} days`;
}

// soon/later thresholds match the Grades tab's own "caution" register --
// nothing alarmist, just a quiet nudge.
function urgencyTier(n) {
  if (n < 0) return 'overdue';
  if (n <= 3) return 'soon';
  return 'later';
}

// ---- Today Mode helpers -----------------------------------------------
// Tasks carry an ISO due_date (or null). These compare by *calendar day*
// in the viewer's local time, not by timestamp, since "due today" should
// mean today regardless of what time of day the due_date happens to be.
// Moved here (from Home.jsx) along with the Today tab itself -- see
// TodayTab below.
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameLocalDay(isoString, ref) {
  if (!isoString) return false;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  return startOfLocalDay(d).getTime() === startOfLocalDay(ref).getTime();
}

function isAfterLocalDay(isoString, ref) {
  if (!isoString) return false;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  return startOfLocalDay(d).getTime() > startOfLocalDay(ref).getTime();
}

export default function Study() {
  // "Today Mode" used to live on Home, between the hero card and the stats
  // row. It's moved here as Study's first tab (see TodayTab below) so Study
  // opens on "Today" by default and Home stays just hero/stats/nav ring.
  const [tab, setTab] = useState('today');
  const [subjects, setSubjects] = useState([]);

  function loadSubjects() {
    return api
      .getSubjects()
      .then((data) => setSubjects(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  useEffect(() => {
    loadSubjects();
  }, []);

  return (
    <>
      <Topbar title="Study" />
      <div className="screen-inner study-screen">
        <div className="study-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'today'}
            className={`study-tab${tab === 'today' ? ' active' : ''}`}
            onClick={() => setTab('today')}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'calendar'}
            className={`study-tab${tab === 'calendar' ? ' active' : ''}`}
            onClick={() => setTab('calendar')}
          >
            Calendar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'goals'}
            className={`study-tab${tab === 'goals' ? ' active' : ''}`}
            onClick={() => setTab('goals')}
          >
            Goals
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'grades'}
            className={`study-tab${tab === 'grades' ? ' active' : ''}`}
            onClick={() => setTab('grades')}
          >
            Grades
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tasks'}
            className={`study-tab${tab === 'tasks' ? ' active' : ''}`}
            onClick={() => setTab('tasks')}
          >
            Tasks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'deadlines'}
            className={`study-tab${tab === 'deadlines' ? ' active' : ''}`}
            onClick={() => setTab('deadlines')}
          >
            Deadlines
          </button>
          {/* AI Weekly Review -- see ReviewTab below and backend
              routers/review.py for the feature. Added as its own tab,
              alongside whatever else lands here, rather than folded into an
              existing one. */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'review'}
            className={`study-tab${tab === 'review' ? ' active' : ''}`}
            onClick={() => setTab('review')}
          >
            Review
          </button>
          {/* AI Study Tools -- see AiToolsTab below and backend
              routers/ai_tools.py. Own tab, own sub-picker inside it (Explain /
              Quiz / Flashcards / Summarize / Study Plan / Explain a Mistake /
              Study Technique) rather than one tab per tool. */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ai-tools'}
            className={`study-tab${tab === 'ai-tools' ? ' active' : ''}`}
            onClick={() => setTab('ai-tools')}
          >
            AI Tools
          </button>
        </div>

        {tab === 'today' && <TodayTab />}
        {tab === 'calendar' && <CalendarTab subjects={subjects} />}
        {tab === 'goals' && <GoalsTab />}
        {tab === 'grades' && <GradesTab subjects={subjects} onSubjectsChange={loadSubjects} />}
        {tab === 'tasks' && <TasksTab subjects={subjects} />}
        {tab === 'deadlines' && <DeadlinesTab />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'ai-tools' && <AiToolsTab />}
      </div>
    </>
  );
}

// ================================ Today =================================
// "Today Mode" -- moved here from Home.jsx (was the .today-card between the
// hero card and the stats row there). Same behaviour: a short due-today
// checklist plus the single next-upcoming task, fetched client-side from
// the active task list rather than a dedicated backend filter.

function TodayTab() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [todayTasks, setTodayTasks] = useState([]);
  const [nextTask, setNextTask] = useState(null);
  const [todayLoaded, setTodayLoaded] = useState(false);
  const [activeFocusSession, setActiveFocusSession] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getTasks({ status: 'active' })
      .then((tasks) => {
        if (cancelled) return;
        const due = tasks.filter((t) => isSameLocalDay(t.due_date, now));
        const upcoming = tasks
          .filter((t) => isAfterLocalDay(t.due_date, now))
          .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
        setTodayTasks(due);
        setNextTask(upcoming[0] || null);
        setTodayLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setTodayLoaded(true);
      });
    api
      .getActiveFocusSession()
      .then((session) => {
        if (!cancelled) setActiveFocusSession(session || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [now]);

  function handleTodayCheckOff(id) {
    setTodayTasks((prev) => prev.filter((t) => t.id !== id));
    api.updateTask(id, { status: 'done' }).catch(() => {
      // Best effort -- if this fails the task simply reappears next visit.
    });
  }

  function handleTodaySkip(id) {
    setTodayTasks((prev) => prev.filter((t) => t.id !== id));
    api.rescheduleTaskTomorrow(id).catch(() => {
      // Best effort -- same as above.
    });
  }

  function handleStartFocus() {
    const topTaskId = todayTasks[0]?.id;
    navigate(topTaskId ? `/focus?task=${topTaskId}` : '/focus');
  }

  function handleHelpMeFocus() {
    navigate('/focus?emergency=1');
  }

  return (
    <div className="today-card">
      <p className="today-card-title">Today</p>

      {todayLoaded && todayTasks.length === 0 && (
        <p className="today-empty">
          Nothing due today — a good day to get ahead, or just rest.
        </p>
      )}

      {todayTasks.length > 0 && (
        <div className="today-list">
          {todayTasks.map((task) => (
            <div className="today-item" key={task.id}>
              <button
                type="button"
                className="today-item-check"
                onClick={() => handleTodayCheckOff(task.id)}
                aria-label={`Mark "${task.title}" done`}
              >
                ✓
              </button>
              <span className="today-item-title">{task.title}</span>
              <button
                type="button"
                className="today-item-skip"
                onClick={() => handleTodaySkip(task.id)}
              >
                skip → tomorrow
              </button>
            </div>
          ))}
        </div>
      )}

      {nextTask && (
        <p className="today-next">
          Next: <strong>{nextTask.title}</strong>
        </p>
      )}

      <div className="today-actions">
        <button type="button" className="btn btn-primary" onClick={handleStartFocus}>
          {activeFocusSession ? 'Continue Session' : 'Start Focus'}
        </button>
        <button type="button" className="btn-quiet today-help-link" onClick={handleHelpMeFocus}>
          Help me focus
        </button>
      </div>
    </div>
  );
}

// ============================== Calendar ==============================

const STUDY_HOUR_ROW_HEIGHT = 52;

// Shared Google-Calendar-style hour grid used by both Week view (7 day
// columns) and Day view (1 wide column) -- a time-of-day rail down the
// left, day headers across the top, all-day chips pinned above the hour
// rows (this app's calendar events only ever carry a date, no time-of-day,
// so they always render as all-day), and a live "now" line drawn on
// whichever column is actually today.
function CalendarTimeGrid({ days, eventsByDay, selectedKey, onSelectDay }) {
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // On mount (i.e. whenever Week/Day view is switched into, or Day view's
  // date changes since selectedKey is part of `days`), scroll the hour rail
  // to somewhere useful -- near the current time if today is in view,
  // otherwise a mid-morning default -- rather than dumping the viewer at
  // midnight every time.
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayInView = days.some((d) => toDateKey(d) === todayKey());
    const referenceHour = todayInView ? Math.max(0, now.getHours() - 2) : 7;
    scrollRef.current.scrollTop = referenceHour * STUDY_HOUR_ROW_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.map((d) => toDateKey(d)).join(',')]);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowPct = Math.min(100, Math.max(0, (nowMinutes / 1440) * 100));
  const columnTemplate = `var(--study-rail-width, 56px) repeat(${days.length}, 1fr)`;
  const todayKeyValue = todayKey();

  function handleColumnKeyDown(e, date) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectDay(date);
    }
  }

  return (
    <div className="study-timegrid-card" style={{ '--study-hour-row-height': `${STUDY_HOUR_ROW_HEIGHT}px` }}>
      <div className="study-timegrid-headerrow" style={{ gridTemplateColumns: columnTemplate }}>
        <div className="study-timegrid-corner">{gmtOffsetLabel()}</div>
        {days.map((date) => {
          const key = toDateKey(date);
          const isToday = key === todayKeyValue;
          const isSelected = key === selectedKey;
          return (
            <button
              type="button"
              key={key}
              className={`study-timegrid-daycol-header${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
              onClick={() => onSelectDay(date)}
            >
              <span className="study-timegrid-dow">{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              <span className="study-timegrid-daynum">{date.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="study-timegrid-alldayrow" style={{ gridTemplateColumns: columnTemplate }}>
        <div className="study-timegrid-corner-spacer" />
        {days.map((date) => {
          const key = toDateKey(date);
          const dayEvents = eventsByDay[key] || [];
          return (
            <div
              className="study-timegrid-allday-col"
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(date)}
              onKeyDown={(e) => handleColumnKeyDown(e, date)}
            >
              {dayEvents.map((ev) => (
                <span className={`study-allday-chip${ev.done ? ' done' : ''}`} key={ev.id} title={ev.title}>
                  {ev.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <div className="study-timegrid-scroll" ref={scrollRef}>
        <div className="study-timegrid-body" style={{ gridTemplateColumns: columnTemplate }}>
          <div className="study-timegrid-rail">
            {DAY_HOURS.map((h) => (
              <div className="study-timegrid-hour-label" key={h}>
                {formatHourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((date) => {
            const key = toDateKey(date);
            const isToday = key === todayKeyValue;
            const isSelected = key === selectedKey;
            return (
              <div
                className={`study-timegrid-daycol${isSelected ? ' selected' : ''}`}
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDay(date)}
                onKeyDown={(e) => handleColumnKeyDown(e, date)}
              >
                {DAY_HOURS.map((h) => (
                  <div className="study-timegrid-hour-row" key={h} />
                ))}
                {isToday && (
                  <div className="study-now-line" style={{ top: `${nowPct}%` }}>
                    <span className="study-now-dot" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarTab({ subjects }) {
  const showToast = useToast();
  const [viewMode, setViewMode] = useState('month');
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedKey, setSelectedKey] = useState(todayKey());
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', event_type: 'other', subject_id: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Day-notes state, keyed to whichever date is currently selected -- shared
  // by all three views since they all render the same DayPanel.
  const [noteText, setNoteText] = useState('');
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSavedFlash, setNoteSavedFlash] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const weekGrid = useMemo(() => buildWeekGrid(parseDateKey(selectedKey)), [selectedKey]);

  function loadEvents() {
    const start = toDateKey(new Date(year, month, 1));
    const end = toDateKey(new Date(year, month + 1, 0));
    return api
      .getStudyEvents(start, end)
      .then((data) => {
        setEvents(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  // Month/week/day views all share this one events fetch, keyed off the
  // month currently in view (`cursor`) -- switching views never refetches
  // by itself, only navigating past the currently-loaded month does.
  useEffect(() => {
    loadEvents();
    setFormOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // Week view's row can span into a neighbouring month (e.g. the last few
  // days of one month, first few of the next). When that happens, top up
  // `events` with that extra range so the week row's dot indicators are
  // accurate even though `cursor` (and the month-driven fetch above)
  // hasn't moved -- same idea as the month-navigation refetch, just for a
  // narrower range.
  useEffect(() => {
    if (viewMode !== 'week' || weekGrid.length === 0) return;
    const start = weekGrid[0];
    const end = weekGrid[6];
    const spillsOutside =
      start.getFullYear() !== year ||
      start.getMonth() !== month ||
      end.getFullYear() !== year ||
      end.getMonth() !== month;
    if (!spillsOutside) return;
    api
      .getStudyEvents(toDateKey(start), toDateKey(end))
      .then((data) => {
        if (!Array.isArray(data)) return;
        setEvents((prev) => {
          const map = new Map(prev.map((e) => [e.id, e]));
          data.forEach((e) => map.set(e.id, e));
          return Array.from(map.values());
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedKey]);

  // Load (or reload) the freeform note whenever the selected day changes,
  // alongside the events that are already keyed to selectedKey.
  useEffect(() => {
    let cancelled = false;
    setNoteLoaded(false);
    setNoteSavedFlash(false);
    api
      .getDayNote(selectedKey)
      .then((data) => {
        if (cancelled) return;
        setNoteText(data?.text || '');
        setNoteLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setNoteLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      const key = ev.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  const dayEvents = (eventsByDay[selectedKey] || [])
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));

  // Selects a date for any of the three views. If it falls outside the
  // month currently loaded for the grid, moves `cursor` there too so the
  // existing month-based fetch effect picks up events for it.
  function selectDate(date) {
    const key = toDateKey(date);
    setSelectedKey(key);
    if (date.getFullYear() !== year || date.getMonth() !== month) {
      setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  function goPrevMonth() {
    const next = new Date(year, month - 1, 1);
    setCursor(next);
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === next.getFullYear() && now.getMonth() === next.getMonth();
    setSelectedKey(isCurrentMonth ? todayKey() : toDateKey(next));
  }
  function goNextMonth() {
    const next = new Date(year, month + 1, 1);
    setCursor(next);
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === next.getFullYear() && now.getMonth() === next.getMonth();
    setSelectedKey(isCurrentMonth ? todayKey() : toDateKey(next));
  }
  function goToday() {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedKey(todayKey());
  }

  function goPrevWeek() {
    selectDate(addDays(selectedKey, -7));
  }
  function goNextWeek() {
    selectDate(addDays(selectedKey, 7));
  }
  function goThisWeek() {
    selectDate(new Date());
  }

  function goPrevDay() {
    selectDate(addDays(selectedKey, -1));
  }
  function goNextDay() {
    selectDate(addDays(selectedKey, 1));
  }
  function goTodayDay() {
    selectDate(new Date());
  }

  function openAddForm() {
    setEditingId(null);
    setForm({ title: '', event_type: 'other', subject_id: '', note: '' });
    setFormOpen(true);
    setError('');
  }

  function openEditForm(ev) {
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      event_type: ev.event_type,
      subject_id: ev.subject_id ? String(ev.subject_id) : '',
      note: ev.note || '',
    });
    setFormOpen(true);
    setError('');
  }

  async function handleSubmit() {
    const title = form.title.trim();
    if (!title) return;
    setSaving(true);
    setError('');
    try {
      const subjectId = form.subject_id ? Number(form.subject_id) : null;
      const note = form.note.trim() || null;
      if (editingId) {
        await api.updateStudyEvent(editingId, {
          title,
          event_type: form.event_type,
          subject_id: subjectId,
          note,
        });
      } else {
        await api.createStudyEvent({
          title,
          date: selectedKey,
          eventType: form.event_type,
          subjectId,
          note,
        });
      }
      setFormOpen(false);
      await loadEvents();
      showToast(editingId ? 'Event updated.' : 'Event added.');
    } catch (err) {
      setError(err.message || "Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteStudyEvent(id);
      await loadEvents();
      showToast('Event removed.');
    } catch (err) {
      showToast(err.message || "Couldn't remove that.");
    }
  }

  async function toggleDone(ev) {
    try {
      await api.updateStudyEvent(ev.id, { done: !ev.done });
      await loadEvents();
    } catch (err) {
      showToast(err.message || "Couldn't update that.");
    }
  }

  async function handleNoteBlur() {
    setNoteSaving(true);
    try {
      await api.updateDayNote(selectedKey, noteText);
      setNoteSavedFlash(true);
      setTimeout(() => setNoteSavedFlash(false), 1600);
    } catch (err) {
      showToast(err.message || "Couldn't save that note.");
    } finally {
      setNoteSaving(false);
    }
  }

  const dayPanelProps = {
    subjects,
    selectedKey,
    dayEvents,
    loaded,
    formOpen,
    setFormOpen,
    editingId,
    form,
    setForm,
    saving,
    error,
    openAddForm,
    openEditForm,
    handleSubmit,
    handleDelete,
    toggleDone,
    noteText,
    setNoteText,
    noteLoaded,
    noteSaving,
    noteSavedFlash,
    handleNoteBlur,
  };

  return (
    <div className="study-calendar-wrap">
      <div className="study-view-tabs" role="tablist">
        {CALENDAR_VIEW_MODES.map((v) => (
          <button
            type="button"
            role="tab"
            key={v.value}
            aria-selected={viewMode === v.value}
            className={`study-view-tab${viewMode === v.value ? ' active' : ''}`}
            onClick={() => setViewMode(v.value)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {viewMode === 'month' && (
        <div className="study-calendar-layout">
          <div className="study-calendar-card">
            <div className="study-cal-header">
              <button type="button" className="study-cal-nav" onClick={goPrevMonth} aria-label="Previous month">
                ‹
              </button>
              <div className="study-cal-title">
                <strong>
                  {MONTH_NAMES[month]} {year}
                </strong>
                <button type="button" className="btn-quiet study-today-btn" onClick={goToday}>
                  Today
                </button>
              </div>
              <button type="button" className="study-cal-nav" onClick={goNextMonth} aria-label="Next month">
                ›
              </button>
            </div>

            <div className="study-cal-weekdays">
              {WEEKDAY_LABELS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>

            <div className="study-cal-grid">
              {grid.map((date, i) => {
                if (!date) return <div key={i} className="study-cal-cell empty" />;
                const key = toDateKey(date);
                const isToday = key === todayKey();
                const isSelected = key === selectedKey;
                const dayHasEvents = Boolean(eventsByDay[key]?.length);
                return (
                  <button
                    type="button"
                    key={i}
                    className={`study-cal-cell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                    onClick={() => selectDate(date)}
                  >
                    <span className="study-cal-daynum">{date.getDate()}</span>
                    {dayHasEvents && <span className="study-cal-dot" />}
                  </button>
                );
              })}
            </div>
          </div>

          <DayPanel {...dayPanelProps} />
        </div>
      )}

      {viewMode === 'week' && (
        <div className="study-day-view">
          <div className="study-calendar-card study-timegrid-nav-card">
            <div className="study-cal-header">
              <button type="button" className="study-cal-nav" onClick={goPrevWeek} aria-label="Previous week">
                ‹
              </button>
              <div className="study-cal-title">
                <strong>
                  {formatDateShort(weekGrid[0])} – {formatDateShort(weekGrid[6])}
                </strong>
                <button type="button" className="btn-quiet study-today-btn" onClick={goThisWeek}>
                  This week
                </button>
              </div>
              <button type="button" className="study-cal-nav" onClick={goNextWeek} aria-label="Next week">
                ›
              </button>
            </div>
          </div>

          <CalendarTimeGrid
            days={weekGrid}
            eventsByDay={eventsByDay}
            selectedKey={selectedKey}
            onSelectDay={selectDate}
          />

          <DayPanel {...dayPanelProps} />
        </div>
      )}

      {viewMode === 'day' && (
        <div className="study-day-view">
          <div className="study-calendar-card study-timegrid-nav-card">
            <div className="study-cal-header">
              <button type="button" className="study-cal-nav" onClick={goPrevDay} aria-label="Previous day">
                ‹
              </button>
              <div className="study-cal-title">
                <strong>{formatDateKeyLong(selectedKey)}</strong>
                <button type="button" className="btn-quiet study-today-btn" onClick={goTodayDay}>
                  Today
                </button>
              </div>
              <button type="button" className="study-cal-nav" onClick={goNextDay} aria-label="Next day">
                ›
              </button>
            </div>
          </div>

          <CalendarTimeGrid
            days={[parseDateKey(selectedKey)]}
            eventsByDay={eventsByDay}
            selectedKey={selectedKey}
            onSelectDay={selectDate}
          />

          <DayPanel {...dayPanelProps} large />
        </div>
      )}
    </div>
  );
}

// Shared day-detail panel -- the event list + add/edit/delete UI and the
// freeform notes box, used as-is by month, week and day view so events and
// notes stay in sync no matter which view added/edited them.
function DayPanel({
  subjects,
  selectedKey,
  dayEvents,
  loaded,
  formOpen,
  setFormOpen,
  editingId,
  form,
  setForm,
  saving,
  error,
  openAddForm,
  openEditForm,
  handleSubmit,
  handleDelete,
  toggleDone,
  noteText,
  setNoteText,
  noteLoaded,
  noteSaving,
  noteSavedFlash,
  handleNoteBlur,
  large,
}) {
  return (
    <div className={`study-day-panel${large ? ' study-day-panel-large' : ''}`}>
      <div className="study-day-panel-head">
        <p className="eyebrow">{formatDateKeyLong(selectedKey)}</p>
        <button type="button" className="btn btn-primary study-add-btn" onClick={openAddForm}>
          + Add
        </button>
      </div>

      {loaded && dayEvents.length === 0 && !formOpen && (
        <p className="mood-empty">Nothing on this day yet.</p>
      )}

      <div className="study-event-list">
        {dayEvents.map((ev) => (
          <div className={`study-event-row${ev.done ? ' done' : ''}`} key={ev.id}>
            <label className="study-event-check">
              <input type="checkbox" checked={ev.done} onChange={() => toggleDone(ev)} />
            </label>
            <div className="study-event-body">
              <span className="study-event-title">{ev.title}</span>
              <span className="study-event-meta">
                {EVENT_TYPES.find((t) => t.value === ev.event_type)?.label || ev.event_type}
                {ev.subject_name ? ` · ${ev.subject_name}` : ''}
              </span>
              {ev.note && <span className="study-event-note">{ev.note}</span>}
            </div>
            <div className="study-event-actions">
              <button type="button" className="btn-quiet" onClick={() => openEditForm(ev)}>
                Edit
              </button>
              <button type="button" className="btn-quiet" onClick={() => handleDelete(ev.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="study-event-form">
          <div className="field">
            <label htmlFor="ev-title">Title</label>
            <input
              id="ev-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Chemistry homework"
            />
          </div>
          <div className="study-form-row">
            <div className="field">
              <label htmlFor="ev-type">Type</label>
              <select
                id="ev-type"
                value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ev-subject">Subject (optional)</label>
              <select
                id="ev-subject"
                value={form.subject_id}
                onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
              >
                <option value="">None</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ev-note">Note (optional)</label>
            <input
              id="ev-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Any detail"
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="study-form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={saving || !form.title.trim()}
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add event'}
            </button>
          </div>
        </div>
      )}

      <div className="study-day-notes">
        <div className="study-day-notes-head">
          <p className="eyebrow">Notes</p>
          {noteSaving && <span className="study-note-status">Saving…</span>}
          {!noteSaving && noteSavedFlash && <span className="study-note-status saved">Saved</span>}
        </div>
        <textarea
          className="study-day-notes-textarea"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onBlur={handleNoteBlur}
          disabled={!noteLoaded || noteSaving}
          placeholder="Jot down anything about this day…"
        />
      </div>
    </div>
  );
}

// ================================ Goals ================================

function GoalsTab() {
  const showToast = useToast();
  const [goals, setGoals] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'other', target_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [stepDrafts, setStepDrafts] = useState({});

  function loadGoals() {
    return api
      .getGoals()
      .then((data) => {
        setGoals(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  useEffect(() => {
    loadGoals();
  }, []);

  async function handleCreate() {
    const title = form.title.trim();
    if (!title) return;
    setSaving(true);
    setError('');
    try {
      await api.createGoal({
        title,
        description: form.description.trim() || null,
        category: form.category,
        targetDate: form.target_date || null,
      });
      setForm({ title: '', description: '', category: 'other', target_date: '' });
      setFormOpen(false);
      await loadGoals();
      showToast('Goal added.');
    } catch (err) {
      setError(err.message || "Couldn't save that goal.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStep(goal, step) {
    try {
      await api.updateGoalStep(goal.id, step.id, { done: !step.done });
      await loadGoals();
    } catch (err) {
      showToast(err.message || "Couldn't update that step.");
    }
  }

  async function addStep(goal) {
    const text = (stepDrafts[goal.id] || '').trim();
    if (!text) return;
    try {
      await api.createGoalStep(goal.id, text);
      setStepDrafts({ ...stepDrafts, [goal.id]: '' });
      await loadGoals();
    } catch (err) {
      showToast(err.message || "Couldn't add that step.");
    }
  }

  async function toggleGoalDone(goal) {
    try {
      await api.updateGoal(goal.id, { status: goal.status === 'done' ? 'active' : 'done' });
      await loadGoals();
    } catch (err) {
      showToast(err.message || "Couldn't update that goal.");
    }
  }

  async function removeGoal(goal) {
    try {
      await api.deleteGoal(goal.id);
      await loadGoals();
      showToast('Goal removed.');
    } catch (err) {
      showToast(err.message || "Couldn't remove that goal.");
    }
  }

  function progressFor(goal) {
    const total = goal.steps.length;
    if (!total) return 0;
    const done = goal.steps.filter((s) => s.done).length;
    return Math.round((done / total) * 100);
  }

  function formatTarget(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  return (
    <div className="study-goals">
      <button
        type="button"
        className="btn btn-primary study-new-goal-btn"
        onClick={() => setFormOpen((v) => !v)}
      >
        {formOpen ? 'Close' : '+ New goal'}
      </button>

      {formOpen && (
        <div className="study-goal-form">
          <div className="field">
            <label htmlFor="goal-title">Title</label>
            <input
              id="goal-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Graduate on time"
            />
          </div>
          <div className="field">
            <label htmlFor="goal-desc">Description (optional)</label>
            <textarea
              id="goal-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Any detail that helps"
            />
          </div>
          <div className="study-form-row">
            <div className="field">
              <label htmlFor="goal-category">Category</label>
              <select
                id="goal-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {GOAL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="goal-target">Target date (optional)</label>
              <input
                id="goal-target"
                type="date"
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
              />
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary study-goal-save-btn"
            onClick={handleCreate}
            disabled={saving || !form.title.trim()}
          >
            {saving ? 'Saving…' : 'Create goal'}
          </button>
        </div>
      )}

      <div className="study-goal-list">
        {loaded && goals.length === 0 && (
          <p className="mood-empty">No goals yet. Start with something small.</p>
        )}
        {goals.map((goal) => {
          const pct = progressFor(goal);
          const expanded = expandedId === goal.id;
          const targetLabel = formatTarget(goal.target_date);
          return (
            <div className={`study-goal-card${goal.status === 'done' ? ' done' : ''}`} key={goal.id}>
              <button
                type="button"
                className="study-goal-summary"
                onClick={() => setExpandedId(expanded ? null : goal.id)}
              >
                <div className="study-goal-summary-text">
                  <span className="study-goal-title">{goal.title}</span>
                  <span className="study-goal-meta">
                    {GOAL_CATEGORIES.find((c) => c.value === goal.category)?.label || goal.category}
                    {targetLabel ? ` · due ${targetLabel}` : ''}
                  </span>
                </div>
                <div className="study-goal-progress">
                  <div className="study-goal-progress-bar">
                    <div className="study-goal-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span>{pct}%</span>
                </div>
              </button>

              {expanded && (
                <div className="study-goal-detail">
                  {goal.description && <p className="study-goal-desc">{goal.description}</p>}
                  <div className="study-step-list">
                    {goal.steps.map((step) => (
                      <label className="study-step-row" key={step.id}>
                        <input type="checkbox" checked={step.done} onChange={() => toggleStep(goal, step)} />
                        <span className={step.done ? 'done' : ''}>{step.title}</span>
                      </label>
                    ))}
                    {goal.steps.length === 0 && (
                      <p className="mood-empty">No steps yet. Break it down below.</p>
                    )}
                  </div>
                  <div className="study-step-add">
                    <input
                      value={stepDrafts[goal.id] || ''}
                      onChange={(e) => setStepDrafts({ ...stepDrafts, [goal.id]: e.target.value })}
                      placeholder="Add a step"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addStep(goal);
                      }}
                    />
                    <button type="button" className="btn-quiet" onClick={() => addStep(goal)}>
                      Add
                    </button>
                  </div>
                  <div className="study-goal-detail-actions">
                    <button type="button" className="btn-quiet" onClick={() => toggleGoalDone(goal)}>
                      {goal.status === 'done' ? 'Mark active' : 'Mark done'}
                    </button>
                    <button type="button" className="btn-quiet" onClick={() => removeGoal(goal)}>
                      Delete goal
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================== Grades ================================

// Colour-codes chart dots by subject. Cycles through the app's own palette
// (primary/highlight plus a few muted extras) rather than hardcoding
// anything chart-library-specific -- there's no charting dependency here,
// just inline SVG.
const TREND_DOT_COLORS = [
  'var(--primary)',
  'var(--highlight)',
  '#f5a623',
  '#a56cc1',
  '#e2584c',
];

function trendSubjectOrder(series) {
  const order = [];
  series.forEach((p) => {
    if (!order.includes(p.subject_name)) order.push(p.subject_name);
  });
  return order;
}

function trendSubjectColor(name, order) {
  const idx = order.indexOf(name);
  return TREND_DOT_COLORS[idx % TREND_DOT_COLORS.length];
}

// Small hand-rolled inline SVG line chart -- no charting library. Plots each
// grade chronologically (x = entry order, y = score 0-100), with a dashed
// reference line at the passing threshold.
function StudyTrendChart({ series, threshold }) {
  if (!series || series.length === 0) return null;

  const W = 600;
  const H = 220;
  const padL = 34;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const n = series.length;
  const xFor = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yFor = (score) => padT + plotH - (Math.max(0, Math.min(100, score)) / 100) * plotH;

  const order = trendSubjectOrder(series);
  const linePoints = series.map((p, i) => `${xFor(i)},${yFor(p.score)}`).join(' ');
  const thresholdY = yFor(threshold);
  const gridValues = [0, 25, 50, 75, 100];

  const firstDate = new Date(series[0].date);
  const lastDate = new Date(series[n - 1].date);
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <div className="study-trend-chart-wrap">
      <svg
        className="study-trend-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Grade trend chart across ${n} entries`}
      >
        {gridValues.map((v) => (
          <line
            key={`grid-${v}`}
            x1={padL}
            x2={W - padR}
            y1={yFor(v)}
            y2={yFor(v)}
            className="study-trend-gridline"
          />
        ))}
        {gridValues.map((v) => (
          <text
            key={`label-${v}`}
            x={padL - 6}
            y={yFor(v) + 3.5}
            className="study-trend-axis-label"
            textAnchor="end"
          >
            {v}
          </text>
        ))}
        <line
          x1={padL}
          x2={W - padR}
          y1={thresholdY}
          y2={thresholdY}
          className="study-trend-threshold-line"
        />
        <polyline points={linePoints} className="study-trend-line" fill="none" />
        {series.map((p, i) => (
          <circle
            key={i}
            cx={xFor(i)}
            cy={yFor(p.score)}
            r={4.5}
            className="study-trend-dot"
            style={{ fill: trendSubjectColor(p.subject_name, order) }}
          >
            <title>{`${p.subject_name}: ${p.score}% (${new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`}</title>
          </circle>
        ))}
        <text x={padL} y={H - 6} className="study-trend-axis-label">
          {fmt(firstDate)}
        </text>
        <text x={W - padR} y={H - 6} className="study-trend-axis-label" textAnchor="end">
          {fmt(lastDate)}
        </text>
      </svg>
      {order.length > 1 && (
        <div className="study-trend-legend">
          {order.map((name) => (
            <span className="study-trend-legend-item" key={name}>
              <span
                className="study-trend-legend-dot"
                style={{ background: trendSubjectColor(name, order) }}
              />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GradesTab({ subjects, onSubjectsChange }) {
  const showToast = useToast();
  const [grades, setGrades] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [insights, setInsights] = useState(null);
  const [form, setForm] = useState({
    subject_name: '',
    label: '',
    score: '',
    date: todayKey(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Passing score is school-dependent, so it's a per-user setting rather
  // than a fixed number -- defaults to 70% (see User.passing_threshold on
  // the backend) until the user changes it here.
  const [threshold, setThreshold] = useState(70);
  const [thresholdLoaded, setThresholdLoaded] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState('70');
  const [savingThreshold, setSavingThreshold] = useState(false);

  function loadGrades() {
    return api
      .getGrades()
      .then((data) => {
        setGrades(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  function loadAnalysis() {
    return api.getStudyAnalysis().then(setAnalysis).catch(() => {});
  }

  function loadInsights() {
    return api.getStudyInsights().then(setInsights).catch(() => {});
  }

  function loadThreshold() {
    return api
      .getStudySettings()
      .then((data) => {
        const value = typeof data?.passing_threshold === 'number' ? data.passing_threshold : 70;
        setThreshold(value);
        setThresholdDraft(String(value));
        setThresholdLoaded(true);
      })
      .catch(() => setThresholdLoaded(true));
  }

  useEffect(() => {
    loadGrades();
    loadAnalysis();
    loadInsights();
    loadThreshold();
  }, []);

  async function handleSaveThreshold() {
    const value = Number(thresholdDraft);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      showToast("Passing score must be a number between 0 and 100.");
      return;
    }
    setSavingThreshold(true);
    try {
      await api.updateStudySettings(value);
      setThreshold(value);
      setEditingThreshold(false);
      await Promise.all([loadAnalysis(), loadInsights()]);
      showToast('Passing score updated.');
    } catch (err) {
      showToast(err.message || "Couldn't save that.");
    } finally {
      setSavingThreshold(false);
    }
  }

  async function handleSave() {
    const subjectName = form.subject_name.trim();
    const label = form.label.trim();
    const score = Number(form.score);
    if (!subjectName || !label || Number.isNaN(score)) return;
    setSaving(true);
    setError('');
    try {
      await api.createGrade({ subjectName, label, score, date: form.date });
      setForm({ subject_name: '', label: '', score: '', date: form.date });
      await Promise.all([loadGrades(), loadAnalysis(), loadInsights(), onSubjectsChange()]);
      showToast('Grade logged.');
    } catch (err) {
      setError(err.message || "Couldn't save that grade.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteGrade(id);
      await Promise.all([loadGrades(), loadAnalysis(), loadInsights()]);
      showToast('Removed.');
    } catch (err) {
      showToast(err.message || "Couldn't remove that.");
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  }

  const grouped = useMemo(() => {
    const map = {};
    grades.forEach((g) => {
      const key = g.subject_name || 'Unknown';
      if (!map[key]) map[key] = [];
      map[key].push(g);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [grades]);

  const flagged = analysis ? analysis.subjects.filter((s) => s.needs_focus) : [];

  return (
    <div className="study-grades">
      <div className="study-threshold-row">
        {editingThreshold ? (
          <>
            <label htmlFor="passing-threshold-input" className="study-threshold-label">
              Passing score
            </label>
            <input
              id="passing-threshold-input"
              type="number"
              min="0"
              max="100"
              className="study-threshold-input"
              value={thresholdDraft}
              onChange={(e) => setThresholdDraft(e.target.value)}
            />
            <span className="study-threshold-label">%</span>
            <button
              type="button"
              className="btn-quiet"
              onClick={handleSaveThreshold}
              disabled={savingThreshold}
            >
              {savingThreshold ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setEditingThreshold(false);
                setThresholdDraft(String(threshold));
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="study-threshold-label">
              Passing score: <strong>{thresholdLoaded ? `${threshold}%` : '…'}</strong>
            </span>
            <button type="button" className="btn-quiet" onClick={() => setEditingThreshold(true)}>
              Edit
            </button>
          </>
        )}
      </div>

      <div className="study-grade-form">
        <div className="field">
          <label htmlFor="grade-subject">Subject</label>
          <input
            id="grade-subject"
            list="study-subject-options"
            value={form.subject_name}
            onChange={(e) => setForm({ ...form, subject_name: e.target.value })}
            placeholder="e.g. Chemistry"
          />
          <datalist id="study-subject-options">
            {subjects.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>
        <div className="study-form-row study-grade-form-row">
          <div className="field">
            <label htmlFor="grade-label">Label</label>
            <input
              id="grade-label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Midterm 1"
            />
          </div>
          <div className="field">
            <label htmlFor="grade-score">Score (%)</label>
            <input
              id="grade-score"
              type="number"
              min="0"
              max="100"
              value={form.score}
              onChange={(e) => setForm({ ...form, score: e.target.value })}
              placeholder="0–100"
            />
          </div>
          <div className="field">
            <label htmlFor="grade-date">Date</label>
            <input
              id="grade-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary study-goal-save-btn"
          onClick={handleSave}
          disabled={saving || !form.subject_name.trim() || !form.label.trim() || form.score === ''}
        >
          {saving ? 'Saving…' : 'Log grade'}
        </button>
      </div>

      <div className="study-insights">
        <p className="eyebrow">Where to focus</p>
        {analysis ? (
          <>
            <p className="study-insights-summary">{analysis.summary}</p>
            {flagged.length > 0 && (
              <div className="study-insight-list">
                {flagged.map((s) => (
                  <div className="study-insight-row" key={s.subject_id}>
                    <span className="study-insight-subject">{s.subject_name}</span>
                    <span className="study-insight-tip">{s.tip}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mood-empty">…</p>
        )}
      </div>

      <div className="study-trend-section">
        <p className="eyebrow">Study progress</p>
        {insights ? (
          <>
            <p className="study-trend-summary">{insights.overall_summary}</p>
            {insights.series.length > 0 ? (
              <StudyTrendChart series={insights.series} threshold={threshold} />
            ) : (
              <p className="mood-empty">Log a few grades to see your trend here.</p>
            )}
          </>
        ) : (
          <p className="mood-empty">…</p>
        )}
      </div>

      <div className="study-grade-list">
        {loaded && grades.length === 0 && <p className="mood-empty">No grades logged yet.</p>}
        {grouped.map(([subjectName, list]) => (
          <div className="study-grade-group" key={subjectName}>
            <p className="study-grade-group-title">{subjectName}</p>
            {list
              .slice()
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((g) => (
                <div className="study-grade-row" key={g.id}>
                  <div className="study-grade-row-text">
                    <span className="study-grade-label">{g.label}</span>
                    <span className="study-grade-date">{formatDate(g.date)}</span>
                  </div>
                  {thresholdLoaded && g.score < threshold && (
                    <span className="study-caution-badge">Caution</span>
                  )}
                  <span className="study-grade-score">{g.score}%</span>
                  <button type="button" className="btn-quiet" onClick={() => handleDelete(g.id)}>
                    Delete
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ================================ Tasks =================================
// Task management: a top-level/subtask tree (GET /api/tasks?parent_id=0,
// then GET /api/tasks/{id} for each task's subtasks on expand), a create/
// edit form covering every Task field including recurrence and a "blocked
// by" dependency picker, search + tag filtering, and an Active/Archive
// switch. Smart Rescheduling ("Skip to tomorrow") shows up per-row whenever
// a task is active with a due date that's today or already past.

function emptyTaskForm(parentId) {
  return {
    title: '',
    description: '',
    tags: '',
    due_date: '',
    estimated_minutes: '',
    subject_id: '',
    parent_task_id: parentId ? String(parentId) : '',
    recurrence: 'none',
    recurrence_interval_days: '',
    notes: '',
    progress_percent: 0,
  };
}

function formatMinutes(mins) {
  if (mins == null) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function TasksTab({ subjects }) {
  const showToast = useToast();
  const [subView, setSubView] = useState('active');
  const [searchText, setSearchText] = useState('');
  const [tagText, setTagText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [topTasks, setTopTasks] = useState([]);
  const [archiveTasks, setArchiveTasks] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [subtasksByParent, setSubtasksByParent] = useState({});
  const [expanded, setExpanded] = useState({});
  const [allTasksFlat, setAllTasksFlat] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState(() => emptyTaskForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [depPick, setDepPick] = useState('');

  const didMountRef = useRef(false);
  const isSearching = Boolean(searchText.trim() || tagText.trim());

  const subjectsById = useMemo(() => {
    const map = {};
    subjects.forEach((s) => {
      map[s.id] = s.name;
    });
    return map;
  }, [subjects]);

  function loadAllTasksFlat() {
    return api
      .getTasks({})
      .then((data) => setAllTasksFlat(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  function loadTopTasks() {
    return api
      .getTasks({ parentId: 0 })
      .then((data) => {
        setTopTasks(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  function loadArchive() {
    return api
      .getTasks({ status: 'archived' })
      .then((data) => {
        setArchiveTasks(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  function loadSearch() {
    return api
      .getTasks({
        q: searchText.trim() || undefined,
        tag: tagText.trim() || undefined,
        status: subView === 'archive' ? 'archived' : undefined,
      })
      .then((data) => {
        setSearchResults(Array.isArray(data) ? data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  function refreshView() {
    setLoaded(false);
    if (isSearching) return loadSearch();
    if (subView === 'archive') return loadArchive();
    return loadTopTasks();
  }

  function reloadExpanded() {
    const ids = Object.keys(expanded).filter((id) => expanded[id]);
    return Promise.all(
      ids.map((id) =>
        api
          .getTask(Number(id))
          .then((detail) => {
            setSubtasksByParent((prev) => ({ ...prev, [id]: detail.subtasks || [] }));
          })
          .catch(() => {})
      )
    );
  }

  function refreshAll() {
    return Promise.all([refreshView(), loadAllTasksFlat(), reloadExpanded()]);
  }

  // Loads immediately on mount, then debounces re-fetching whenever the
  // search text, tag filter, or Active/Archive switch changes.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      loadAllTasksFlat();
      refreshView();
      return;
    }
    const t = setTimeout(() => {
      refreshView();
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, tagText, subView]);

  const knownTags = useMemo(() => {
    const set = new Set();
    allTasksFlat.forEach((t) => {
      (t.tags || '').split(',').forEach((tg) => {
        const trimmed = tg.trim();
        if (trimmed) set.add(trimmed);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allTasksFlat]);

  const taskById = useMemo(() => {
    const map = {};
    allTasksFlat.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [allTasksFlat]);

  function toggleExpand(taskId) {
    const key = String(taskId);
    const willOpen = !expanded[key];
    setExpanded((prev) => ({ ...prev, [key]: willOpen }));
    if (willOpen && !subtasksByParent[key]) {
      api
        .getTask(taskId)
        .then((detail) => {
          setSubtasksByParent((prev) => ({ ...prev, [key]: detail.subtasks || [] }));
        })
        .catch(() => {});
    }
  }

  function openCreateForm(parentId) {
    setEditingTask(null);
    setForm(emptyTaskForm(parentId));
    setFormOpen(true);
    setError('');
    setDepPick('');
  }

  function openEditForm(task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      tags: task.tags || '',
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      estimated_minutes: task.estimated_minutes != null ? String(task.estimated_minutes) : '',
      subject_id: task.subject_id ? String(task.subject_id) : '',
      parent_task_id: task.parent_task_id ? String(task.parent_task_id) : '',
      recurrence: task.recurrence || 'none',
      recurrence_interval_days:
        task.recurrence_interval_days != null ? String(task.recurrence_interval_days) : '',
      notes: task.notes || '',
      progress_percent: task.progress_percent ?? 0,
    });
    setFormOpen(true);
    setError('');
    setDepPick('');
  }

  function closeForm() {
    setFormOpen(false);
    setEditingTask(null);
    setError('');
  }

  async function handleSubmit() {
    const title = form.title.trim();
    if (!title) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        title,
        description: form.description.trim() || null,
        tags: form.tags.trim() || null,
        due_date: form.due_date || null,
        estimated_minutes: form.estimated_minutes !== '' ? Number(form.estimated_minutes) : null,
        subject_id: form.subject_id ? Number(form.subject_id) : null,
        parent_task_id: form.parent_task_id ? Number(form.parent_task_id) : null,
        recurrence: form.recurrence,
        recurrence_interval_days:
          form.recurrence === 'custom' && form.recurrence_interval_days !== ''
            ? Number(form.recurrence_interval_days)
            : null,
        notes: form.notes.trim() || null,
        progress_percent: Number(form.progress_percent) || 0,
      };
      if (editingTask) {
        await api.updateTask(editingTask.id, payload);
      } else {
        await api.createTask(payload);
      }
      closeForm();
      await refreshAll();
      showToast(editingTask ? 'Task updated.' : 'Task added.');
    } catch (err) {
      setError(err.message || "Couldn't save that task.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(task) {
    try {
      await api.deleteTask(task.id);
      if (editingTask && editingTask.id === task.id) closeForm();
      await refreshAll();
      showToast('Task removed.');
    } catch (err) {
      showToast(err.message || "Couldn't remove that task.");
    }
  }

  async function toggleDone(task) {
    try {
      await api.updateTask(task.id, { status: task.status === 'done' ? 'active' : 'done' });
      await refreshAll();
    } catch (err) {
      showToast(err.message || "Couldn't update that task.");
    }
  }

  async function toggleArchive(task) {
    try {
      await api.updateTask(task.id, { status: task.status === 'archived' ? 'active' : 'archived' });
      if (editingTask && editingTask.id === task.id) closeForm();
      await refreshAll();
      showToast(task.status === 'archived' ? 'Task restored.' : 'Task archived.');
    } catch (err) {
      showToast(err.message || "Couldn't update that task.");
    }
  }

  async function handleReschedule(task) {
    try {
      await api.rescheduleTaskTomorrow(task.id);
      await refreshAll();
      showToast('Moved to tomorrow.');
    } catch (err) {
      showToast(err.message || "Couldn't reschedule that task.");
    }
  }

  async function handleAddDependency() {
    if (!editingTask || !depPick) return;
    try {
      const updated = await api.addTaskDependency(editingTask.id, Number(depPick));
      setEditingTask(updated);
      setDepPick('');
      await refreshAll();
    } catch (err) {
      showToast(err.message || "Couldn't add that dependency.");
    }
  }

  async function handleRemoveDependency(dependsOnId) {
    if (!editingTask) return;
    try {
      await api.removeTaskDependency(editingTask.id, dependsOnId);
      setEditingTask((prev) =>
        prev ? { ...prev, depends_on: prev.depends_on.filter((id) => id !== dependsOnId) } : prev
      );
      await refreshAll();
    } catch (err) {
      showToast(err.message || "Couldn't remove that dependency.");
    }
  }

  function canReschedule(task) {
    if (task.status !== 'active' || !task.due_date) return false;
    return daysUntil(task.due_date) <= 0;
  }

  const parentOptions = allTasksFlat.filter((t) => !editingTask || t.id !== editingTask.id);
  const dependencyOptions = allTasksFlat.filter(
    (t) => editingTask && t.id !== editingTask.id && !(editingTask.depends_on || []).includes(t.id)
  );

  const rows = isSearching ? searchResults : subView === 'archive' ? archiveTasks : topTasks;
  const emptyMessage = isSearching
    ? 'No tasks match that search.'
    : subView === 'archive'
      ? 'No archived tasks.'
      : 'No tasks yet. Add your first one below.';
  const flatMode = isSearching || subView === 'archive';

  return (
    <div className="study-tasks">
      {!isSearching && (
        <div className="study-view-tabs" role="tablist">
          {TASK_VIEW_MODES.map((v) => (
            <button
              type="button"
              role="tab"
              key={v.value}
              aria-selected={subView === v.value}
              className={`study-view-tab${subView === v.value ? ' active' : ''}`}
              onClick={() => setSubView(v.value)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="study-tasks-toolbar">
        <input
          className="study-tasks-search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search tasks…"
          aria-label="Search tasks"
        />
        <input
          className="study-tasks-tag-filter"
          list="study-task-tag-options"
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="Filter by tag…"
          aria-label="Filter by tag"
        />
        <datalist id="study-task-tag-options">
          {knownTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="button" className="btn btn-primary study-add-btn" onClick={() => openCreateForm(null)}>
          + Add task
        </button>
      </div>

      {formOpen && (
        <TaskForm
          form={form}
          setForm={setForm}
          subjects={subjects}
          parentOptions={parentOptions}
          editingTask={editingTask}
          saving={saving}
          error={error}
          onCancel={closeForm}
          onSubmit={handleSubmit}
          dependencyOptions={dependencyOptions}
          depPick={depPick}
          setDepPick={setDepPick}
          onAddDependency={handleAddDependency}
          onRemoveDependency={handleRemoveDependency}
          taskById={taskById}
        />
      )}

      {loaded && rows.length === 0 && <p className="mood-empty">{emptyMessage}</p>}

      <div className="study-task-list">
        {rows.map((task) =>
          flatMode ? (
            <TaskRow
              key={task.id}
              task={task}
              taskById={taskById}
              subjectsById={subjectsById}
              onEdit={openEditForm}
              onToggleDone={toggleDone}
              onToggleArchive={toggleArchive}
              onDelete={handleDelete}
              onReschedule={handleReschedule}
              canReschedule={canReschedule}
              onAddSubtask={openCreateForm}
              expandable={false}
            />
          ) : (
            <TaskNode
              key={task.id}
              task={task}
              taskById={taskById}
              subjectsById={subjectsById}
              expanded={expanded}
              subtasksByParent={subtasksByParent}
              onToggleExpand={toggleExpand}
              onEdit={openEditForm}
              onToggleDone={toggleDone}
              onToggleArchive={toggleArchive}
              onDelete={handleDelete}
              onReschedule={handleReschedule}
              canReschedule={canReschedule}
              onAddSubtask={openCreateForm}
            />
          )
        )}
      </div>
    </div>
  );
}

// Recursive tree node: renders one task row plus (when expanded) its
// subtasks, fetched on demand via GET /api/tasks/{id}. Subtasks can
// themselves be expanded the same way, so the tree isn't limited to one
// level even though each individual fetch only returns one.
function TaskNode({
  task,
  taskById,
  subjectsById,
  expanded,
  subtasksByParent,
  onToggleExpand,
  onEdit,
  onToggleDone,
  onToggleArchive,
  onDelete,
  onReschedule,
  canReschedule,
  onAddSubtask,
}) {
  const key = String(task.id);
  const isOpen = Boolean(expanded[key]);
  const children = subtasksByParent[key];

  return (
    <div className="study-task-node">
      <TaskRow
        task={task}
        taskById={taskById}
        subjectsById={subjectsById}
        onEdit={onEdit}
        onToggleDone={onToggleDone}
        onToggleArchive={onToggleArchive}
        onDelete={onDelete}
        onReschedule={onReschedule}
        canReschedule={canReschedule}
        onAddSubtask={onAddSubtask}
        expandable
        isOpen={isOpen}
        onToggleExpand={() => onToggleExpand(task.id)}
      />
      {isOpen && (
        <div className="study-task-node-children">
          {children === undefined && <p className="mood-empty study-task-loading">Loading…</p>}
          {children && children.length === 0 && (
            <p className="mood-empty study-task-loading">No subtasks yet.</p>
          )}
          {children &&
            children.map((child) => (
              <TaskNode
                key={child.id}
                task={child}
                taskById={taskById}
                subjectsById={subjectsById}
                expanded={expanded}
                subtasksByParent={subtasksByParent}
                onToggleExpand={onToggleExpand}
                onEdit={onEdit}
                onToggleDone={onToggleDone}
                onToggleArchive={onToggleArchive}
                onDelete={onDelete}
                onReschedule={onReschedule}
                canReschedule={canReschedule}
                onAddSubtask={onAddSubtask}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  taskById,
  subjectsById,
  onEdit,
  onToggleDone,
  onToggleArchive,
  onDelete,
  onReschedule,
  canReschedule,
  onAddSubtask,
  expandable,
  isOpen,
  onToggleExpand,
}) {
  const tags = (task.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const estimated = formatMinutes(task.estimated_minutes);
  const actual = formatMinutes(task.actual_minutes);
  const blockedBy = (task.depends_on || []).map((id) => taskById[id]).filter(Boolean);
  const subjectName = task.subject_id ? subjectsById[task.subject_id] : null;

  return (
    <div
      className={`study-task-card${task.status === 'done' ? ' done' : ''}${task.status === 'archived' ? ' archived' : ''}`}
    >
      <div className="study-task-card-top">
        {expandable ? (
          <button
            type="button"
            className="study-task-expand-btn"
            onClick={onToggleExpand}
            aria-label={isOpen ? 'Collapse subtasks' : 'Expand subtasks'}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="study-task-expand-spacer" aria-hidden="true" />
        )}
        <label className="study-task-check">
          <input type="checkbox" checked={task.status === 'done'} onChange={() => onToggleDone(task)} />
        </label>
        <div className="study-task-body">
          <span className="study-task-title">{task.title}</span>
          <span className="study-task-meta">
            {task.due_date ? formatDateKeyLong(task.due_date.slice(0, 10)) : 'No due date'}
            {subjectName ? ` · ${subjectName}` : ''}
            {task.recurrence && task.recurrence !== 'none'
              ? ` · repeats ${task.recurrence === 'custom' ? `every ${task.recurrence_interval_days || 1}d` : task.recurrence}`
              : ''}
          </span>
          {task.description && <span className="study-task-desc">{task.description}</span>}
          {tags.length > 0 && (
            <div className="study-task-tags">
              {tags.map((t) => (
                <span className="study-task-tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {blockedBy.length > 0 && (
            <div className="study-task-blocked">Blocked by: {blockedBy.map((b) => b.title).join(', ')}</div>
          )}
          {(estimated || actual) && (
            <span className="study-task-durations">
              {estimated ? `Est. ${estimated}` : 'Est. —'} · {actual ? `Actual ${actual}` : 'Actual —'}
            </span>
          )}
        </div>
        <div className="study-goal-progress">
          <div className="study-goal-progress-bar">
            <div className="study-goal-progress-fill" style={{ width: `${task.progress_percent}%` }} />
          </div>
          <span>{task.progress_percent}%</span>
        </div>
      </div>

      <div className="study-task-actions">
        {canReschedule(task) && (
          <button type="button" className="btn-quiet" onClick={() => onReschedule(task)}>
            Skip to tomorrow
          </button>
        )}
        {task.status !== 'archived' && (
          <button type="button" className="btn-quiet" onClick={() => onAddSubtask(task.id)}>
            + Subtask
          </button>
        )}
        <button type="button" className="btn-quiet" onClick={() => onEdit(task)}>
          Edit
        </button>
        <button type="button" className="btn-quiet" onClick={() => onToggleArchive(task)}>
          {task.status === 'archived' ? 'Restore' : 'Archive'}
        </button>
        <button type="button" className="btn-quiet" onClick={() => onDelete(task)}>
          Delete
        </button>
      </div>
    </div>
  );
}

function TaskForm({
  form,
  setForm,
  subjects,
  parentOptions,
  editingTask,
  saving,
  error,
  onCancel,
  onSubmit,
  dependencyOptions,
  depPick,
  setDepPick,
  onAddDependency,
  onRemoveDependency,
  taskById,
}) {
  const blockedBy = editingTask
    ? (editingTask.depends_on || []).map((id) => taskById[id]).filter(Boolean)
    : [];

  return (
    <div className="study-task-form">
      <div className="field">
        <label htmlFor="task-title">Title</label>
        <input
          id="task-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Chemistry assignment"
        />
      </div>
      <div className="field">
        <label htmlFor="task-desc">Description (optional)</label>
        <textarea
          id="task-desc"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Any detail that helps"
        />
      </div>
      <div className="study-form-row">
        <div className="field">
          <label htmlFor="task-tags">Tags (comma-separated)</label>
          <input
            id="task-tags"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="School, Personal"
          />
        </div>
        <div className="field">
          <label htmlFor="task-due">Due date (optional)</label>
          <input
            id="task-due"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="task-estimate">Estimated minutes</label>
          <input
            id="task-estimate"
            type="number"
            min="0"
            value={form.estimated_minutes}
            onChange={(e) => setForm({ ...form, estimated_minutes: e.target.value })}
            placeholder="e.g. 45"
          />
        </div>
      </div>
      <div className="study-form-row">
        <div className="field">
          <label htmlFor="task-subject">Subject (optional)</label>
          <select
            id="task-subject"
            value={form.subject_id}
            onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
          >
            <option value="">None</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-parent">Parent task (optional)</label>
          <select
            id="task-parent"
            value={form.parent_task_id}
            onChange={(e) => setForm({ ...form, parent_task_id: e.target.value })}
          >
            <option value="">None (top-level)</option>
            {parentOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="study-form-row">
        <div className="field">
          <label htmlFor="task-recurrence">Repeats</label>
          <select
            id="task-recurrence"
            value={form.recurrence}
            onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
          >
            {RECURRENCE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {form.recurrence === 'custom' && (
          <div className="field">
            <label htmlFor="task-recurrence-days">Every N days</label>
            <input
              id="task-recurrence-days"
              type="number"
              min="1"
              value={form.recurrence_interval_days}
              onChange={(e) => setForm({ ...form, recurrence_interval_days: e.target.value })}
              placeholder="e.g. 3"
            />
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="task-progress">
          Progress <span className="study-task-progress-value">{form.progress_percent}%</span>
        </label>
        <input
          id="task-progress"
          type="range"
          min="0"
          max="100"
          value={form.progress_percent}
          onChange={(e) => setForm({ ...form, progress_percent: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label htmlFor="task-notes">Notes</label>
        <textarea
          id="task-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Freeform notes — no file uploads in this app, just text"
        />
      </div>

      {editingTask && (
        <div className="study-task-deps-editor">
          <p className="eyebrow">Blocked by</p>
          {blockedBy.length > 0 && (
            <div className="study-task-dep-chips">
              {blockedBy.map((b) => (
                <span className="study-task-dep-chip" key={b.id}>
                  {b.title}
                  <button
                    type="button"
                    onClick={() => onRemoveDependency(b.id)}
                    aria-label={`Remove dependency on ${b.title}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {blockedBy.length === 0 && <p className="mood-empty">Not blocked by anything.</p>}
          <div className="study-task-dep-add">
            <select value={depPick} onChange={(e) => setDepPick(e.target.value)}>
              <option value="">Choose a task…</option>
              {dependencyOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button type="button" className="btn-quiet" onClick={onAddDependency} disabled={!depPick}>
              Add
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="study-form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving || !form.title.trim()}>
          {saving ? 'Saving…' : editingTask ? 'Save changes' : 'Add task'}
        </button>
      </div>
    </div>
  );
}

// ============================== Deadlines ================================
// Merges StudyEvents (assignment/exam types) with active Tasks that have a
// due_date, sorted together by date, with a simple urgency badge and a
// naive "suggested study schedule" line (estimated_minutes spread evenly
// across the days remaining) for tasks.

function DeadlinesTab() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  function load() {
    const start = todayKey();
    const end = toDateKey(addDays(start, 120));
    return Promise.all([
      api.getStudyEvents(start, end).catch(() => []),
      api.getTasks({ status: 'active' }).catch(() => []),
      api.getSubjects().catch(() => []),
    ]).then(([events, tasks, subjects]) => {
      const subjectsById = {};
      (Array.isArray(subjects) ? subjects : []).forEach((s) => {
        subjectsById[s.id] = s.name;
      });
      const eventItems = (Array.isArray(events) ? events : [])
        .filter((ev) => DEADLINE_EVENT_TYPES.includes(ev.event_type) && !ev.done)
        .map((ev) => ({
          key: `event-${ev.id}`,
          kind: 'event',
          title: ev.title,
          date: ev.date,
          typeLabel: EVENT_TYPES.find((t) => t.value === ev.event_type)?.label || ev.event_type,
          subjectName: ev.subject_name,
        }));
      const taskItems = (Array.isArray(tasks) ? tasks : [])
        .filter((t) => t.due_date)
        .map((t) => ({
          key: `task-${t.id}`,
          kind: 'task',
          title: t.title,
          date: t.due_date,
          typeLabel: 'Task',
          subjectName: t.subject_id ? subjectsById[t.subject_id] : null,
          estimatedMinutes: t.estimated_minutes,
        }));
      const merged = [...eventItems, ...taskItems].sort((a, b) => new Date(a.date) - new Date(b.date));
      setItems(merged);
      setLoaded(true);
    });
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="study-deadlines">
      {loaded && items.length === 0 && (
        <p className="mood-empty">No upcoming assignments, exams or task deadlines.</p>
      )}
      <div className="study-deadline-list">
        {items.map((item) => {
          const n = daysUntil(item.date);
          const tier = urgencyTier(n);
          const daysRemaining = Math.max(n, 0);
          const suggestion =
            item.kind === 'task' && item.estimatedMinutes && n >= 0
              ? Math.round(item.estimatedMinutes / Math.max(1, daysRemaining))
              : null;
          return (
            <div className={`study-deadline-row study-deadline-${tier}`} key={item.key}>
              <div className="study-deadline-main">
                <span className="study-deadline-title">{item.title}</span>
                <span className="study-deadline-meta">
                  {item.typeLabel}
                  {item.subjectName ? ` · ${item.subjectName}` : ''}
                </span>
                {suggestion !== null && (
                  <span className="study-deadline-suggestion">~{suggestion} min/day until this is due</span>
                )}
              </div>
              <span className={`study-deadline-badge study-deadline-badge-${tier}`}>
                {formatDaysRemaining(n)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================ AI Weekly Review ============================
// "Your Weekly Review" -- computed live from the last 7 days (today back 6
// days) whenever this tab is opened, rather than pushed every Sunday (see
// backend routers/review.py's module docstring for why: this simple FastAPI
// app has no background job scheduler). Shows total study time, best focus
// day, the interrupted-sessions "biggest distraction" proxy, a mood trend,
// and an AI-narrated (deterministic-fallback) recommended-improvement card.

function formatStudyDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '0m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function formatReviewDate(iso) {
  if (!iso) return '';
  // iso here is a plain YYYY-MM-DD date string (no time-of-day), so parse it
  // the same explicit y/m/d way the calendar helpers above do -- avoids the
  // classic new Date('YYYY-MM-DD') UTC-midnight-rolls-back-a-day pitfall in
  // negative-UTC-offset timezones.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const MOOD_TREND_COPY = {
  improving: { label: 'Trending up', symbol: '↑' },
  steady: { label: 'Holding steady', symbol: '→' },
  declining: { label: 'Trending down', symbol: '↓' },
  not_enough_data: { label: 'Not enough data yet', symbol: '·' },
};

function ReviewTab() {
  const [review, setReview] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoaded(false);
    setError('');
    return api
      .getWeeklyReview()
      .then((data) => {
        setReview(data);
        setLoaded(true);
      })
      .catch((err) => {
        setError(err.message || "Couldn't load your weekly review.");
        setLoaded(true);
      });
  }

  useEffect(() => {
    load();
  }, []);

  if (!loaded) {
    return (
      <div className="study-review">
        <p className="mood-empty">…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="study-review">
        <p className="form-error" role="alert">
          {error}
        </p>
        <button type="button" className="btn-quiet" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  if (!review) return null;

  const hasAnyData = review.total_study_minutes > 0 || review.mood_trend !== 'not_enough_data';
  const moodCopy = MOOD_TREND_COPY[review.mood_trend] || MOOD_TREND_COPY.not_enough_data;
  const distractionText =
    review.interrupted_session_count > 0
      ? `Stopped ${review.interrupted_session_count} session${review.interrupted_session_count === 1 ? '' : 's'} early`
      : hasAnyData
        ? 'No sessions stopped early this week'
        : 'Not enough data yet to spot a pattern here';

  return (
    <div className="study-review">
      <div className="study-review-header">
        <p className="eyebrow">This Week</p>
        <h2 className="study-review-title">Your Weekly Review</h2>
        <p className="study-review-range">
          {formatReviewDate(review.window_start)} – {formatReviewDate(review.window_end)}
        </p>
      </div>

      {!hasAnyData ? (
        <p className="mood-empty study-review-empty">
          Nothing logged yet this week — that&rsquo;s alright. A focus session or a mood check-in is
          all it takes for this page to start filling in.
        </p>
      ) : (
        <div className="study-review-stat-grid">
          <div className="study-review-stat-card">
            <span className="study-review-stat-label">Total study time</span>
            <span className="study-review-stat-value">{formatStudyDuration(review.total_study_minutes)}</span>
          </div>
          <div className="study-review-stat-card">
            <span className="study-review-stat-label">Best focus day</span>
            <span className="study-review-stat-value">
              {review.best_focus_day
                ? formatReviewDate(review.best_focus_day)
                : 'Not yet — no completed sessions'}
            </span>
            {review.best_focus_day && (
              <span className="study-review-stat-sub">
                {formatStudyDuration(review.best_focus_day_minutes)}
              </span>
            )}
          </div>
          <div className="study-review-stat-card">
            <span className="study-review-stat-label">Biggest distraction</span>
            <span className="study-review-stat-value study-review-stat-value-small">{distractionText}</span>
          </div>
          <div className="study-review-stat-card">
            <span className="study-review-stat-label">Mood trend</span>
            <span className="study-review-stat-value">
              <span className="study-review-mood-symbol" aria-hidden="true">
                {moodCopy.symbol}
              </span>{' '}
              {moodCopy.label}
            </span>
          </div>
        </div>
      )}

      <div className="study-review-recommendation">
        <p className="eyebrow">Recommended improvement</p>
        <p className="study-review-recommendation-text">{review.recommended_improvement}</p>
      </div>
    </div>
  );
}

// ============================== AI Study Tools ==============================
// Client's request, verbatim: "The AI can explain concepts, quiz users,
// generate flashcards, summarise notes, create study plans, explain
// mistakes, suggest better learning techniques." One tab, one tool picker,
// one shared "Ask" flow -- see backend routers/ai_tools.py for the seven
// endpoints this drives.
//
// Every call can come back as `{ available: false }` (no ANTHROPIC_API_KEY
// configured on the server, or the AI call/its JSON parsing failed) -- that
// is shown as a calm explanatory note, never as an error/crash.

const AI_TOOLS_UNAVAILABLE_MESSAGE =
  "This needs the study assistant's AI key to be set up — ask whoever manages Sõbrad to add an ANTHROPIC_API_KEY on Render.";

const AI_TOOL_DEFS = [
  {
    key: 'explain',
    label: 'Explain',
    blurb: 'Explain a concept in plain, encouraging language.',
    fields: [
      {
        name: 'topicOrText',
        type: 'textarea',
        label: 'What do you want explained?',
        placeholder: 'e.g. Newton’s second law, or paste a confusing paragraph',
      },
    ],
  },
  {
    key: 'quiz',
    label: 'Quiz',
    blurb: 'Get quizzed on a topic, with answers you can reveal one at a time.',
    fields: [
      {
        name: 'topicOrText',
        type: 'textarea',
        label: 'Topic or text to be quizzed on',
        placeholder: 'e.g. The French Revolution',
      },
      {
        name: 'numQuestions',
        type: 'number',
        label: 'Number of questions',
        min: 1,
        max: 15,
        defaultValue: 5,
      },
    ],
  },
  {
    key: 'flashcards',
    label: 'Flashcards',
    blurb: 'Generate front/back flashcards for a topic.',
    fields: [
      {
        name: 'topicOrText',
        type: 'textarea',
        label: 'Topic or text for the flashcards',
        placeholder: 'e.g. Key vocabulary for cell biology',
      },
      {
        name: 'numCards',
        type: 'number',
        label: 'Number of cards',
        min: 1,
        max: 20,
        defaultValue: 8,
      },
    ],
  },
  {
    key: 'summarize',
    label: 'Summarize',
    blurb: 'Summarize a chunk of notes into the key points.',
    fields: [
      {
        name: 'text',
        type: 'textarea',
        label: 'Paste your notes',
        placeholder: 'Paste the notes you want summarized',
      },
    ],
  },
  {
    key: 'study-plan',
    label: 'Study Plan',
    blurb: 'Build a short, realistic plan toward a goal.',
    fields: [
      { name: 'goal', type: 'text', label: 'Goal', placeholder: 'e.g. Feel ready for the biology final' },
      { name: 'timeframe', type: 'text', label: 'Timeframe (optional)', placeholder: 'e.g. 3 weeks' },
      {
        name: 'subjects',
        type: 'text',
        label: 'Subjects involved (optional, comma-separated)',
        placeholder: 'e.g. Biology, Chemistry',
      },
    ],
  },
  {
    key: 'explain-mistake',
    label: 'Explain a Mistake',
    blurb: 'Understand why an answer was wrong, gently.',
    fields: [
      { name: 'question', type: 'textarea', label: 'The question', placeholder: 'What was being asked?' },
      { name: 'wrongAnswer', type: 'text', label: 'Your answer', placeholder: 'The answer you gave' },
      {
        name: 'correctAnswer',
        type: 'text',
        label: 'Correct answer (optional)',
        placeholder: 'Leave blank and the tutor will work it out',
      },
    ],
  },
  {
    key: 'study-technique',
    label: 'Study Technique',
    blurb: 'Get 2-3 concrete learning techniques for a challenge.',
    fields: [
      { name: 'subject', type: 'text', label: 'Subject (optional)', placeholder: 'e.g. Maths' },
      {
        name: 'challenge',
        type: 'textarea',
        label: 'What’s the challenge? (optional)',
        placeholder: 'e.g. I get distracted easily, or I forget things by test day',
      },
    ],
  },
];

function aiToolFormDefaults(toolDef) {
  const defaults = {};
  toolDef.fields.forEach((f) => {
    defaults[f.name] = f.defaultValue !== undefined ? String(f.defaultValue) : '';
  });
  return defaults;
}

function AiToolsTab() {
  const [toolKey, setToolKey] = useState(AI_TOOL_DEFS[0].key);
  const toolDef = AI_TOOL_DEFS.find((t) => t.key === toolKey) || AI_TOOL_DEFS[0];
  const [formsByTool, setFormsByTool] = useState(() => {
    const initial = {};
    AI_TOOL_DEFS.forEach((t) => {
      initial[t.key] = aiToolFormDefaults(t);
    });
    return initial;
  });
  const [resultsByTool, setResultsByTool] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revealedQuiz, setRevealedQuiz] = useState({});
  const [flippedCards, setFlippedCards] = useState({});

  const form = formsByTool[toolKey] || aiToolFormDefaults(toolDef);
  const result = resultsByTool[toolKey] || null;

  function setField(name, value) {
    setFormsByTool((prev) => ({ ...prev, [toolKey]: { ...prev[toolKey], [name]: value } }));
  }

  function selectTool(key) {
    setToolKey(key);
    setError('');
  }

  const canAsk = useMemo(() => {
    if (toolKey === 'study-technique') return true; // every field optional
    if (toolKey === 'study-plan') return Boolean(form.goal && form.goal.trim());
    if (toolKey === 'explain-mistake') {
      return Boolean(form.question && form.question.trim() && form.wrongAnswer && form.wrongAnswer.trim());
    }
    if (toolKey === 'summarize') return Boolean(form.text && form.text.trim());
    return Boolean(form.topicOrText && form.topicOrText.trim());
  }, [toolKey, form]);

  async function handleAsk() {
    if (!canAsk || loading) return;
    setLoading(true);
    setError('');
    setRevealedQuiz({});
    setFlippedCards({});
    try {
      let data;
      if (toolKey === 'explain') {
        data = await api.aiExplain(form.topicOrText.trim());
      } else if (toolKey === 'quiz') {
        data = await api.aiQuiz(form.topicOrText.trim(), Number(form.numQuestions) || 5);
      } else if (toolKey === 'flashcards') {
        data = await api.aiFlashcards(form.topicOrText.trim(), Number(form.numCards) || 8);
      } else if (toolKey === 'summarize') {
        data = await api.aiSummarize(form.text.trim());
      } else if (toolKey === 'study-plan') {
        const subjects = (form.subjects || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        data = await api.aiStudyPlan({
          goal: form.goal.trim(),
          timeframe: (form.timeframe || '').trim() || undefined,
          subjects,
        });
      } else if (toolKey === 'explain-mistake') {
        data = await api.aiExplainMistake({
          question: form.question.trim(),
          wrongAnswer: form.wrongAnswer.trim(),
          correctAnswer: (form.correctAnswer || '').trim() || undefined,
        });
      } else if (toolKey === 'study-technique') {
        data = await api.aiStudyTechnique({
          subject: (form.subject || '').trim() || undefined,
          challenge: (form.challenge || '').trim() || undefined,
        });
      }
      setResultsByTool((prev) => ({ ...prev, [toolKey]: data }));
    } catch (err) {
      setError(err.message || 'Something went wrong asking the study assistant.');
    } finally {
      setLoading(false);
    }
  }

  function renderField(f) {
    const value = form[f.name] ?? '';
    if (f.type === 'textarea') {
      return (
        <div className="field" key={f.name}>
          <label htmlFor={`ai-${toolKey}-${f.name}`}>{f.label}</label>
          <textarea
            id={`ai-${toolKey}-${f.name}`}
            value={value}
            placeholder={f.placeholder}
            onChange={(e) => setField(f.name, e.target.value)}
          />
        </div>
      );
    }
    if (f.type === 'number') {
      return (
        <div className="field" key={f.name}>
          <label htmlFor={`ai-${toolKey}-${f.name}`}>{f.label}</label>
          <input
            id={`ai-${toolKey}-${f.name}`}
            type="number"
            min={f.min}
            max={f.max}
            value={value}
            onChange={(e) => setField(f.name, e.target.value)}
          />
        </div>
      );
    }
    return (
      <div className="field" key={f.name}>
        <label htmlFor={`ai-${toolKey}-${f.name}`}>{f.label}</label>
        <input
          id={`ai-${toolKey}-${f.name}`}
          type="text"
          value={value}
          placeholder={f.placeholder}
          onChange={(e) => setField(f.name, e.target.value)}
        />
      </div>
    );
  }

  function renderResult() {
    if (!result) return null;
    if (!result.available) {
      return <p className="study-ai-unavailable">{AI_TOOLS_UNAVAILABLE_MESSAGE}</p>;
    }

    if (toolKey === 'explain' || toolKey === 'summarize' || toolKey === 'study-plan' || toolKey === 'explain-mistake') {
      const text = result.explanation || result.summary || result.plan || '';
      return (
        <div className="study-ai-result-text">
          {text.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      );
    }

    if (toolKey === 'quiz') {
      return (
        <div className="study-ai-quiz-list">
          {result.questions.map((q, i) => (
            <div className="study-ai-quiz-item" key={i}>
              <p className="study-ai-quiz-question">
                {i + 1}. {q.question}
              </p>
              {q.choices && q.choices.length > 0 && (
                <ul className="study-ai-quiz-choices">
                  {q.choices.map((c, ci) => (
                    <li key={ci}>{c}</li>
                  ))}
                </ul>
              )}
              {revealedQuiz[i] ? (
                <p className="study-ai-quiz-answer">Answer: {q.answer}</p>
              ) : (
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => setRevealedQuiz((prev) => ({ ...prev, [i]: true }))}
                >
                  Reveal answer
                </button>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (toolKey === 'flashcards') {
      return (
        <div className="study-ai-flashcard-list">
          {result.cards.map((c, i) => {
            const flipped = Boolean(flippedCards[i]);
            return (
              <button
                type="button"
                className={`study-ai-flashcard${flipped ? ' flipped' : ''}`}
                key={i}
                onClick={() => setFlippedCards((prev) => ({ ...prev, [i]: !prev[i] }))}
              >
                <span className="study-ai-flashcard-label">{flipped ? 'Back' : 'Front'}</span>
                <span className="study-ai-flashcard-text">{flipped ? c.back : c.front}</span>
                <span className="study-ai-flashcard-hint">Tap to flip</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (toolKey === 'study-technique') {
      return (
        <ul className="study-ai-technique-list">
          {result.techniques.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      );
    }

    return null;
  }

  return (
    <div className="study-ai-tools">
      <div className="study-ai-picker" role="tablist" aria-label="AI study tool">
        {AI_TOOL_DEFS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={toolKey === t.key}
            className={`study-ai-picker-btn${toolKey === t.key ? ' active' : ''}`}
            onClick={() => selectTool(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="study-ai-blurb">{toolDef.blurb}</p>

      <div className="study-ai-form">
        {toolDef.fields.map(renderField)}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary study-ai-ask-btn"
          onClick={handleAsk}
          disabled={!canAsk || loading}
        >
          {loading ? 'Asking…' : 'Ask'}
        </button>
      </div>

      {result && <div className="study-ai-result">{renderResult()}</div>}
    </div>
  );
}
