import { useEffect, useMemo, useState } from 'react';
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

export default function Study() {
  const [tab, setTab] = useState('calendar');
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
        </div>

        {tab === 'calendar' && <CalendarTab subjects={subjects} />}
        {tab === 'goals' && <GoalsTab />}
        {tab === 'grades' && <GradesTab subjects={subjects} onSubjectsChange={loadSubjects} />}
      </div>
    </>
  );
}

// ============================== Calendar ==============================

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
        <div className="study-calendar-layout">
          <div className="study-calendar-card">
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

            <div className="study-cal-weekdays">
              {WEEKDAY_LABELS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>

            <div className="study-cal-grid study-week-grid">
              {weekGrid.map((date, i) => {
                const key = toDateKey(date);
                const isToday = key === todayKey();
                const isSelected = key === selectedKey;
                const count = eventsByDay[key]?.length || 0;
                return (
                  <button
                    type="button"
                    key={i}
                    className={`study-cal-cell study-week-cell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                    onClick={() => selectDate(date)}
                  >
                    <span className="study-cal-daynum">{date.getDate()}</span>
                    {count === 1 && <span className="study-cal-dot" />}
                    {count > 1 && <span className="study-cal-count">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <DayPanel {...dayPanelProps} />
        </div>
      )}

      {viewMode === 'day' && (
        <div className="study-day-view">
          <div className="study-calendar-card study-day-nav-card">
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
