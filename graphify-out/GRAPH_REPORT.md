# Graph Report - DST_sobrad1  (2026-09-24)

## Corpus Check
- 129 files · ~208,988 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 3, .bat 2, .example 1)

## Summary
- 922 nodes · 2370 edges · 52 communities (43 shown, 9 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 274 edges (avg confidence: 0.94)
- Token cost: 77,859 input · 0 output

## Community Hubs (Navigation)
- Frontend API Client
- Study Data Models
- Pydantic Schemas
- Companion Chat Backend
- Tasks & Search
- Family Invite Email
- Auth & DB Core
- Schema Validators
- AI Study Tools
- Study Page Constants
- Frontend Dependencies
- Auth Router
- App Shell & Auth Context
- Icons & Emergency FAB
- AI Weekly Review
- Companion Avatars
- Sidebar Navigation
- Tasks Tab UI
- Journal Backend
- Settings & Theme
- Calendar Tab UI
- Chat Panel UI
- Focus Session Backend
- Project Docs & Deployment
- Login & Family Join
- Insomnia Soundscape
- Journal Page UI
- FastAPI Entrypoint
- Multipart Upload Client
- Calendar Time Grid
- Topbar & Page Shells
- Focus Timer UI
- Goals Tab UI
- Grades Tab UI
- PWA Manifest
- Today Tab UI
- Breathing Exercise
- AI Tools Tab UI
- Profile Photo Router
- Lint Config
- Auth Session Helpers
- Family Sharing Settings
- Task Row Helpers
- Study Page Root
- Backend Start Script
- AI Explain Request
- AI Flashcards Request
- AI Quiz Request
- AI Study Plan Request
- Frontend Start Script
- Graphify Note

## God Nodes (most connected - your core abstractions)
1. `User` - 118 edges
2. `request()` - 77 edges
3. `CalendarTab()` - 32 edges
4. `useToast()` - 28 edges
5. `useAuth()` - 23 edges
6. `react` - 22 edges
7. `TasksTab()` - 22 edges
8. `get_current_user()` - 20 edges
9. `get_db()` - 17 edges
10. `Task` - 16 edges

## Surprising Connections (you probably didn't know these)
- `get_current_user()` --uses--> `User`  [INFERRED]
  sobrad-fullstack-v7/sobrad-fullstack/backend/app/auth.py → sobrad-fullstack-v7/sobrad-fullstack/backend/app/models.py
- `explain_concept()` --uses--> `User`  [INFERRED]
  sobrad-fullstack-v7/sobrad-fullstack/backend/app/routers/ai_tools.py → sobrad-fullstack-v7/sobrad-fullstack/backend/app/models.py
- `explain_mistake()` --uses--> `User`  [INFERRED]
  sobrad-fullstack-v7/sobrad-fullstack/backend/app/routers/ai_tools.py → sobrad-fullstack-v7/sobrad-fullstack/backend/app/models.py
- `generate_flashcards()` --uses--> `User`  [INFERRED]
  sobrad-fullstack-v7/sobrad-fullstack/backend/app/routers/ai_tools.py → sobrad-fullstack-v7/sobrad-fullstack/backend/app/models.py
- `quiz_me()` --uses--> `User`  [INFERRED]
  sobrad-fullstack-v7/sobrad-fullstack/backend/app/routers/ai_tools.py → sobrad-fullstack-v7/sobrad-fullstack/backend/app/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deployment Environment Configuration** — sobrad_fullstack_v7_sobrad_fullstack_backend_readme_sobrad_jwt_secret, sobrad_fullstack_v7_sobrad_fullstack_backend_readme_sobrad_cors_origins, sobrad_fullstack_v7_sobrad_fullstack_frontend_readme_vite_api_url, sobrad_fullstack_v7_sobrad_fullstack_readme_render_cloudflare_deployment [EXTRACTED 1.00]

## Communities (52 total, 9 thin omitted)

### Community 0 - "Frontend API Client"
Cohesion: 0.05
Nodes (77): acceptFamilyInvite(), addTaskDependency(), aiExplain(), aiExplainMistake(), aiFlashcards(), aiQuiz(), aiStudyPlan(), aiStudyTechnique() (+69 more)

### Community 1 - "Study Data Models"
Cohesion: 0.08
Nodes (72): Base, DayNote, Goal, GoalStep, Grade, Freeform notes on the calendar, separate from the structured StudyEvent list --…, StudyEvent, Subject (+64 more)

### Community 2 - "Pydantic Schemas"
Cohesion: 0.08
Nodes (35): BaseModel, pydantic, re, AccessibilitySettingsOut, AccessibilitySettingsUpdate, BreathingSessionCreate, BreathingSessionOut, DayNoteUpdate (+27 more)

### Community 3 - "Companion Chat Backend"
Cohesion: 0.10
Nodes (40): random, secrets, ChatMessage, Companion, A chat "friend" thread -- either one of the two auto-seeded built-in personas…, _build_reply(), _build_system_prompt(), clear_chat_history() (+32 more)

### Community 4 - "Tasks & Search"
Cohesion: 0.13
Nodes (38): Join table: `task_id` is blocked by `depends_on_task_id`., Task, TaskDependency, utcnow(), get, Session, Search the current user's Journal entries, Tasks, and Study subjects/ goals for…, search_everything() (+30 more)

### Community 5 - "Family Invite Email"
Cohesion: 0.10
Nodes (36): Exception, httpx, logging, EmailSendError, _invite_email_html(), Outbound transactional email for SOBRAD -- currently just the family-sharing…, Raised when a real send (RESEND_API_KEY is set) fails for any reason -- a…, Short, warm, on-brand HTML email body. SOBRAD is a calm, gentle mental-wellness… (+28 more)

### Community 6 - "Auth & DB Core"
Cohesion: 0.14
Nodes (25): datetime, fastapi, fastapi_security, HTTPAuthorizationCredentials, jwt, passlib_context, decode_access_token(), get_current_user() (+17 more)

### Community 7 - "Schema Validators"
Cohesion: 0.09
Nodes (9): field_validator, CompanionCreate, CompanionUpdate, GoalCreate, GoalUpdate, StudyEventCreate, TaskCreate, TaskUpdate (+1 more)

### Community 8 - "AI Study Tools"
Cohesion: 0.13
Nodes (29): Any, json, _call_anthropic_json(), _call_anthropic_text(), explain_concept(), explain_mistake(), _extract_json(), generate_flashcards() (+21 more)

### Community 9 - "Study Page Constants"
Cohesion: 0.09
Nodes (27): AI_TOOL_DEFS, buildWeekGrid(), CALENDAR_VIEW_MODES, DAY_HOURS, DEADLINE_EVENT_TYPES, DeadlinesTab(), EVENT_TYPES, FOCUS_MODES (+19 more)

### Community 10 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (26): oxlint, playwright, @types/react, @types/react-dom, vite, @vitejs/plugin-react, dependencies, react (+18 more)

### Community 11 - "Auth Router"
Cohesion: 0.19
Nodes (25): base64, create_access_token(), hash_password(), normalize_security_answer(), Normalize a security-question answer before hashing/comparing it, so trivial…, verify_password(), change_password(), get_security_question() (+17 more)

### Community 12 - "App Shell & Auth Context"
Cohesion: 0.13
Nodes (17): react-dom, App(), RootRedirect(), AuthContext, useAuth(), sobrad_fullstack_v7_sobrad_fullstack_frontend_src_index, Family(), FamilyChildView() (+9 more)

### Community 13 - "Icons & Emergency FAB"
Cohesion: 0.13
Nodes (14): EmergencyFab(), base, BreatheIcon(), CameraIcon(), ChevronRightIcon(), CloseIcon(), EmergencyIcon(), GoalIcon() (+6 more)

### Community 14 - "AI Weekly Review"
Cohesion: 0.13
Nodes (22): collections, _as_aware_utc(), _build_ai_recommendation(), _compute_focus_stats(), _deterministic_recommendation(), _format_minutes(), _format_review_stats(), get_weekly_review() (+14 more)

### Community 15 - "Companion Avatars"
Cohesion: 0.14
Nodes (16): sobrad_fullstack_v7_sobrad_fullstack_frontend_src_assets_friends_avatar, sobrad_fullstack_v7_sobrad_fullstack_frontend_src_assets_sobrad_avatar, BUILTIN_AVATARS, BUILTIN_GREETINGS, bundledAvatar(), greetingFor(), initialFor(), isBuiltinCompanion() (+8 more)

### Community 16 - "Sidebar Navigation"
Cohesion: 0.13
Nodes (15): BackIcon(), ChatIcon(), FamilyIcon(), HomeIcon(), LogoutIcon(), MoonIcon(), SettingsIcon(), StudyIcon() (+7 more)

### Community 17 - "Tasks Tab UI"
Cohesion: 0.19
Nodes (20): DayPanel(), emptyTaskForm(), TasksTab(), closeForm(), handleAddDependency(), handleDelete(), handleRemoveDependency(), handleReschedule() (+12 more)

### Community 18 - "Journal Backend"
Cohesion: 0.26
Nodes (19): JournalEntry, create_journal_entry(), delete_journal_entry_file(), delete_journal_entry_photo(), get_journal_entry_file(), get_journal_entry_photo(), _get_owned_entry(), _journal_entry_out() (+11 more)

### Community 19 - "Settings & Theme"
Cohesion: 0.12
Nodes (14): getThemePreference(), setThemePreference(), AccessibilitySection(), APPEARANCE_OPTIONS, AppearanceSection(), ChangePasswordSection(), PRESET_QUESTIONS, SecurityQuestionSection() (+6 more)

### Community 20 - "Calendar Tab UI"
Cohesion: 0.18
Nodes (16): addDays(), buildMonthGrid(), CalendarTab(), goNextDay(), goNextWeek(), goPrevDay(), goPrevWeek(), goThisWeek() (+8 more)

### Community 21 - "Chat Panel UI"
Cohesion: 0.16
Nodes (11): ChatPanel(), handleKeyDown(), handleSend(), MoreIcon(), CompanionRow(), formatRowTimestamp(), truncate(), EmailSection() (+3 more)

### Community 22 - "Focus Session Backend"
Cohesion: 0.24
Nodes (15): FocusSession, _as_aware_utc(), complete_focus_session(), get_active_focus_session(), get_focus_history(), _get_open_session(), datetime, get (+7 more)

### Community 23 - "Project Docs & Deployment"
Cohesion: 0.15
Nodes (15): Optional AI Chat Replies (Anthropic), Data Model (User, JournalEntry, MoodEntry, BreathingSession, ChatMessage), SOBRAD FastAPI Backend, JWT Bearer Auth Flow (HS256, 7-day), SOBRAD_CORS_ORIGINS, SOBRAD_JWT_SECRET, Backend requirements.txt, Frontend index.html (+7 more)

### Community 24 - "Login & Family Join"
Cohesion: 0.14
Nodes (7): sobrad_fullstack_v7_sobrad_fullstack_frontend_src_assets_dst_logo, sobrad_fullstack_v7_sobrad_fullstack_frontend_src_assets_dst_logo_white, FamilyJoin(), Login(), PRESET_QUESTIONS, ResetFlow(), ROTATOR_LINES

### Community 25 - "Insomnia Soundscape"
Cohesion: 0.24
Nodes (11): createFoamNoiseBuffer(), createNoiseBuffer(), formatRemaining(), Insomnia(), hardStop(), scheduleSwellCycle(), start(), stop() (+3 more)

### Community 26 - "Journal Page UI"
Cohesion: 0.24
Nodes (11): formatDate(), Journal(), forgetPhotoUrl(), handleFileChosen(), handlePhotoChosen(), handleRemoveFile(), handleRemovePhoto(), handleSave() (+3 more)

### Community 27 - "FastAPI Entrypoint"
Cohesion: 0.18
Nodes (10): dotenv, fastapi_middleware_cors, fastapi_responses, fastapi_staticfiles, os, pathlib, health_check(), get (+2 more)

### Community 28 - "Multipart Upload Client"
Cohesion: 0.21
Nodes (11): ApiError, downloadJournalFile(), getCompanionAvatarBlobUrl(), getJournalPhotoBlobUrl(), getToken(), isAuthenticated(), requestMultipart(), uploadCompanionAvatar() (+3 more)

### Community 29 - "Calendar Time Grid"
Cohesion: 0.26
Nodes (11): goNextMonth(), goPrevMonth(), goToday(), CalendarTimeGrid(), daysUntil(), load(), formatHourLabel(), gmtOffsetLabel() (+3 more)

### Community 30 - "Topbar & Page Shells"
Cohesion: 0.44
Nodes (5): react, react-router-dom, SoundOffIcon(), SoundOnIcon(), Topbar()

### Community 31 - "Focus Timer UI"
Cohesion: 0.25
Nodes (5): setSession(), FocusTab(), handleStartAnother(), formatFocusClock(), playGentleChime()

### Community 32 - "Goals Tab UI"
Cohesion: 0.36
Nodes (7): GoalsTab(), addStep(), handleCreate(), loadGoals(), removeGoal(), toggleGoalDone(), toggleStep()

### Community 33 - "Grades Tab UI"
Cohesion: 0.44
Nodes (7): GradesTab(), handleDelete(), handleSave(), handleSaveThreshold(), loadAnalysis(), loadGrades(), loadInsights()

### Community 34 - "PWA Manifest"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 35 - "Today Tab UI"
Cohesion: 0.29
Nodes (4): isAfterLocalDay(), isSameLocalDay(), startOfLocalDay(), TodayTab()

### Community 36 - "Breathing Exercise"
Cohesion: 0.43
Nodes (6): Breathing(), pause(), saveElapsed(), start(), stopAudio(), tick()

### Community 37 - "AI Tools Tab UI"
Cohesion: 0.33
Nodes (4): aiToolFormDefaults(), AiToolsTab(), renderField(), setField()

### Community 38 - "Profile Photo Router"
Cohesion: 0.33
Nodes (6): delete_profile_photo(), delete, put, Session, UploadFile, upload_profile_photo()

### Community 39 - "Lint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 40 - "Auth Session Helpers"
Cohesion: 0.50
Nodes (4): clearSession(), getMe(), getUsername(), AuthProvider()

### Community 41 - "Family Sharing Settings"
Cohesion: 0.83
Nodes (4): FamilySharingSection(), handleRevoke(), handleSend(), loadInvites()

### Community 42 - "Task Row Helpers"
Cohesion: 0.50
Nodes (4): formatDateKeyLong(), formatMinutes(), TaskRow(), canReschedule()

## Knowledge Gaps
- **68 isolated node(s):** `start.sh script`, `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 241 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `User` connect `Study Data Models` to `Companion Chat Backend`, `Tasks & Search`, `Family Invite Email`, `Auth & DB Core`, `Profile Photo Router`, `AI Study Tools`, `Auth Router`, `AI Weekly Review`, `Journal Backend`, `Focus Session Backend`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `useToast()` connect `Chat Panel UI` to `Goals Tab UI`, `Grades Tab UI`, `Family Sharing Settings`, `Study Page Constants`, `App Shell & Auth Context`, `Icons & Emergency FAB`, `Companion Avatars`, `Tasks Tab UI`, `Settings & Theme`, `Calendar Tab UI`, `Login & Family Join`, `Journal Page UI`, `Focus Timer UI`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `react` connect `Topbar & Page Shells` to `Study Page Constants`, `Frontend Dependencies`, `App Shell & Auth Context`, `Icons & Emergency FAB`, `Sidebar Navigation`, `Settings & Theme`, `Chat Panel UI`, `Login & Family Join`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 100 inferred relationships involving `User` (e.g. with `get_current_user()` and `explain_concept()`) actually correct?**
  _`User` has 100 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `CalendarTab()` (e.g. with `handleNoteBlur()` and `openAddForm()`) actually correct?**
  _`CalendarTab()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `start.sh script`, `$schema`, `plugins` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend API Client` be split into smaller, more focused modules?**
  _Cohesion score 0.04995004995004995 - nodes in this community are weakly interconnected._