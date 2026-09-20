// Small shared API client for SÕBRAD.
//
// Centralises the backend base URL, JSON fetch boilerplate, and attaching
// the bearer token, so components don't repeat any of this.

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(
  /\/+$/,
  ''
);

const TOKEN_KEY = 'sobrad_token';
const USERNAME_KEY = 'sobrad_username';
// Appearance preference ('light' | 'dark' | 'system') -- a pure client-side
// display preference, not user-account data, so it lives in localStorage
// only and never touches the backend. Kept in sync with the inline
// flash-prevention script in index.html.
const THEME_KEY = 'sobrad_theme';

// ---- token / session storage ----------------------------------------------

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUsername() {
  try {
    return window.localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
}

export function setSession(token, username) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    if (username) window.localStorage.setItem(USERNAME_KEY, username);
  } catch {
    // localStorage unavailable (private browsing, etc.) — session just
    // won't persist across reloads, which is an acceptable degradation.
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USERNAME_KEY);
  } catch {
    // ignore
  }
}

export function isAuthenticated() {
  return Boolean(getToken());
}

// ---- appearance (theme) preference -----------------------------------------
// 'system' is the default/current behaviour (follow the OS via
// prefers-color-scheme) and is represented by the ABSENCE of a stored value,
// not the string 'system' -- that way a fresh browser with nothing stored
// yet is indistinguishable from someone who explicitly picked System.

export function getThemePreference() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePreference(theme) {
  try {
    if (theme === 'light' || theme === 'dark') {
      window.localStorage.setItem(THEME_KEY, theme);
    } else {
      window.localStorage.removeItem(THEME_KEY);
    }
  } catch {
    // localStorage unavailable -- the choice just won't persist, same
    // graceful degradation as session storage above.
  }
}

// ---- core request helper ---------------------------------------------------

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Please try again.", 0);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      (data && (data.detail || data.message)) ||
      `Something went wrong (${response.status}).`;
    const friendly =
      typeof message === 'string' ? message : 'Something went wrong.';
    throw new ApiError(friendly, response.status);
  }

  return data;
}

// ---- auth -------------------------------------------------------------------

export function login(username, password) {
  return request('/auth/login', {
    method: 'POST',
    auth: false,
    body: { username, password },
  });
}

export function register(username, password, { securityQuestion, securityAnswer } = {}) {
  const body = { username, password };
  if (securityQuestion) body.security_question = securityQuestion;
  if (securityAnswer) body.security_answer = securityAnswer;
  return request('/auth/register', {
    method: 'POST',
    auth: false,
    body,
  });
}

// ---- auth: password reset (security-question based) -----------------------
// This app doesn't collect email addresses, so password reset is done via a
// security question set at registration (or later, from Settings) rather
// than an email link.

export function getSecurityQuestion(username) {
  return request(`/auth/security-question?username=${encodeURIComponent(username)}`, {
    auth: false,
  });
}

export function resetPassword({ username, securityAnswer, newPassword }) {
  return request('/auth/reset-password', {
    method: 'POST',
    auth: false,
    body: { username, security_answer: securityAnswer, new_password: newPassword },
  });
}

export function changePassword({ currentPassword, newPassword }) {
  return request('/auth/change-password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

export function setSecurityQuestion({ securityQuestion, securityAnswer }) {
  return request('/auth/security-question', {
    method: 'POST',
    body: { security_question: securityQuestion, security_answer: securityAnswer },
  });
}

// ---- settings: accessibility ------------------------------------------------

export function getAccessibilitySettings() {
  return request('/settings/accessibility');
}

export function updateAccessibilitySettings(patch) {
  return request('/settings/accessibility', { method: 'PATCH', body: patch });
}

// ---- stats --------------------------------------------------------------

export function getStats() {
  return request('/stats');
}

// ---- journal ------------------------------------------------------------

export function getJournalEntries() {
  return request('/journal');
}

export function createJournalEntry(text) {
  return request('/journal', { method: 'POST', body: { text } });
}

// ---- chat -----------------------------------------------------------------
// Each companion ('sobrad' | 'friends') now has its own fully separate
// thread server-side (see companions.js) -- every chat call is scoped to
// one companion, never the whole user.

export function getChatHistory(companion) {
  return request(`/chat?companion=${encodeURIComponent(companion)}`);
}

export function sendChatMessage(companion, message) {
  return request('/chat', { method: 'POST', body: { message, companion } });
}

export function clearChatHistory(companion) {
  return request(`/chat?companion=${encodeURIComponent(companion)}`, { method: 'DELETE' });
}

// ---- mood -----------------------------------------------------------------

export function getMoodEntries(limit = 10) {
  return request(`/mood?limit=${limit}`);
}

export function createMoodEntry(word) {
  return request('/mood', { method: 'POST', body: { word } });
}

// ---- breathing sessions ------------------------------------------------

export function createBreathingSession(minutes) {
  return request('/breathing-sessions', { method: 'POST', body: { minutes } });
}

// ---- study: subjects -------------------------------------------------------

export function getSubjects() {
  return request('/study/subjects');
}

export function createSubject(name) {
  return request('/study/subjects', { method: 'POST', body: { name } });
}

export function deleteSubject(id) {
  return request(`/study/subjects/${id}`, { method: 'DELETE' });
}

// ---- study: grades ----------------------------------------------------------

export function getGrades(subjectId) {
  const qs = subjectId ? `?subject_id=${subjectId}` : '';
  return request(`/study/grades${qs}`);
}

export function createGrade({ subjectName, label, score, date }) {
  return request('/study/grades', {
    method: 'POST',
    body: { subject_name: subjectName, label, score, date },
  });
}

export function deleteGrade(id) {
  return request(`/study/grades/${id}`, { method: 'DELETE' });
}

// ---- study: goals + steps ---------------------------------------------------

export function getGoals() {
  return request('/study/goals');
}

export function createGoal({ title, description, category, targetDate }) {
  return request('/study/goals', {
    method: 'POST',
    body: { title, description: description || null, category, target_date: targetDate || null },
  });
}

export function updateGoal(id, patch) {
  return request(`/study/goals/${id}`, { method: 'PATCH', body: patch });
}

export function deleteGoal(id) {
  return request(`/study/goals/${id}`, { method: 'DELETE' });
}

export function createGoalStep(goalId, title) {
  return request(`/study/goals/${goalId}/steps`, { method: 'POST', body: { title } });
}

export function updateGoalStep(goalId, stepId, patch) {
  return request(`/study/goals/${goalId}/steps/${stepId}`, { method: 'PATCH', body: patch });
}

export function deleteGoalStep(goalId, stepId) {
  return request(`/study/goals/${goalId}/steps/${stepId}`, { method: 'DELETE' });
}

// ---- study: calendar events --------------------------------------------------

export function getStudyEvents(start, end) {
  const params = [];
  if (start) params.push(`start=${start}`);
  if (end) params.push(`end=${end}`);
  const qs = params.length ? `?${params.join('&')}` : '';
  return request(`/study/events${qs}`);
}

export function createStudyEvent({ title, date, eventType, subjectId, note }) {
  return request('/study/events', {
    method: 'POST',
    body: {
      title,
      date,
      event_type: eventType || 'other',
      subject_id: subjectId || null,
      note: note || null,
    },
  });
}

export function updateStudyEvent(id, patch) {
  return request(`/study/events/${id}`, { method: 'PATCH', body: patch });
}

export function deleteStudyEvent(id) {
  return request(`/study/events/${id}`, { method: 'DELETE' });
}

// ---- study: day notes (freeform notes on the calendar) ----------------------

export function getDayNote(date) {
  return request(`/study/notes/${date}`);
}

export function updateDayNote(date, text) {
  return request(`/study/notes/${date}`, { method: 'PUT', body: { text } });
}

// ---- study: analysis ----------------------------------------------------------

export function getStudyAnalysis() {
  return request('/study/analysis');
}

// ---- study: AI-assisted insights + trend graph -------------------------------

export function getStudyInsights() {
  return request('/study/insights');
}

// ---- study: settings (configurable passing/caution threshold) ---------------

export function getStudySettings() {
  return request('/study/settings');
}

export function updateStudySettings(passingThreshold) {
  return request('/study/settings', {
    method: 'PATCH',
    body: { passing_threshold: passingThreshold },
  });
}

// ---- study: tasks (Task Management + Deadline Tracker) ----------------------

export function getTasks({ q, tag, status: statusFilter, parentId } = {}) {
  const params = [];
  if (q) params.push(`q=${encodeURIComponent(q)}`);
  if (tag) params.push(`tag=${encodeURIComponent(tag)}`);
  if (statusFilter) params.push(`status=${encodeURIComponent(statusFilter)}`);
  if (parentId !== undefined && parentId !== null) params.push(`parent_id=${parentId}`);
  const qs = params.length ? `?${params.join('&')}` : '';
  return request(`/tasks${qs}`);
}

export function getTask(id) {
  return request(`/tasks/${id}`);
}

export function createTask(payload) {
  return request('/tasks', { method: 'POST', body: payload });
}

export function updateTask(id, patch) {
  return request(`/tasks/${id}`, { method: 'PATCH', body: patch });
}

export function deleteTask(id) {
  return request(`/tasks/${id}`, { method: 'DELETE' });
}

export function addTaskDependency(id, dependsOnTaskId) {
  return request(`/tasks/${id}/dependencies`, {
    method: 'POST',
    body: { depends_on_task_id: dependsOnTaskId },
  });
}

export function removeTaskDependency(id, dependsOnTaskId) {
  return request(`/tasks/${id}/dependencies/${dependsOnTaskId}`, { method: 'DELETE' });
}

export function rescheduleTaskTomorrow(id) {
  return request(`/tasks/${id}/reschedule-tomorrow`, { method: 'POST' });
}

// ---- focus sessions (Focus Session Timer + Emergency Focus Mode) -----------

export function startFocusSession({ mode, plannedMinutes, taskId }) {
  return request('/focus/start', {
    method: 'POST',
    body: {
      mode,
      planned_minutes: plannedMinutes,
      ...(taskId ? { task_id: taskId } : {}),
    },
  });
}

export function getActiveFocusSession() {
  return request('/focus/active');
}

export function completeFocusSession(id, completed) {
  return request(`/focus/${id}/complete`, { method: 'POST', body: { completed } });
}

// ---- AI Weekly Review (Study > Review tab) -----------------------------
// Always-on "last 7 days" review, computed live -- see backend
// routers/review.py's module docstring for why this isn't push-scheduled.

export function getWeeklyReview(endDate) {
  const qs = endDate ? `?end_date=${endDate}` : '';
  return request(`/review/weekly${qs}`);
}

// ---- AI Study Tools (Study > AI Tools tab) ---------------------------------
// Each of these resolves to `{ available: false, ... }` (never throws, never
// 500s) whenever no ANTHROPIC_API_KEY is configured server-side, or the AI
// call/its JSON parsing failed -- see backend routers/ai_tools.py's module
// docstring. The frontend shows a calm explanatory message in that case
// rather than treating it as an error.

export function aiExplain(topicOrText) {
  return request('/ai-tools/explain', { method: 'POST', body: { topic_or_text: topicOrText } });
}

export function aiQuiz(topicOrText, numQuestions) {
  return request('/ai-tools/quiz', {
    method: 'POST',
    body: { topic_or_text: topicOrText, num_questions: numQuestions || undefined },
  });
}

export function aiFlashcards(topicOrText, numCards) {
  return request('/ai-tools/flashcards', {
    method: 'POST',
    body: { topic_or_text: topicOrText, num_cards: numCards || undefined },
  });
}

export function aiSummarize(text) {
  return request('/ai-tools/summarize', { method: 'POST', body: { text } });
}

export function aiStudyPlan({ goal, timeframe, subjects }) {
  return request('/ai-tools/study-plan', {
    method: 'POST',
    body: { goal, timeframe: timeframe || null, subjects: subjects && subjects.length ? subjects : null },
  });
}

export function aiExplainMistake({ question, wrongAnswer, correctAnswer }) {
  return request('/ai-tools/explain-mistake', {
    method: 'POST',
    body: { question, wrong_answer: wrongAnswer, correct_answer: correctAnswer || null },
  });
}

export function aiStudyTechnique({ subject, challenge } = {}) {
  return request('/ai-tools/study-technique', {
    method: 'POST',
    body: { subject: subject || null, challenge: challenge || null },
  });
}

export { ApiError };
