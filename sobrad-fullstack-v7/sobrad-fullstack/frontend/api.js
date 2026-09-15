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

export function register(username, password) {
  return request('/auth/register', {
    method: 'POST',
    auth: false,
    body: { username, password },
  });
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

export function getChatHistory() {
  return request('/chat');
}

export function sendChatMessage(message) {
  return request('/chat', { method: 'POST', body: { message } });
}

export function clearChatHistory() {
  return request('/chat', { method: 'DELETE' });
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

// ---- study: analysis ----------------------------------------------------------

export function getStudyAnalysis() {
  return request('/study/analysis');
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

export { ApiError };
