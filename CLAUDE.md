# Tessio — Task Manager

Tessio is P.J.'s personal task management app. Part of the tanzillo.ai family (Godfather-themed personal productivity suite). Built on a framework P.J. calls "things Nicole already figured out."

## What It Does
A kanban-style task manager with workstreams, tags, weekly views, daily/weekly reviews, and drag-and-drop organization. Designed to match how P.J. thinks about work.

## Status: Live

## Tech Stack
- **Framework**: Vue 3 (Composition API)
- **Build**: Vite
- **Database**: Supabase (PostgreSQL + auth)
- **Drag & Drop**: vuedraggable
- **Routing**: Vue Router
- **Hosting**: Vercel

## Project Structure
```
src/
  App.vue                # Root component
  main.js                # App entry point
  router/                # Vue Router config
  views/
    AppView.vue          # Main app view (authenticated)
    LoginView.vue        # Login page
  components/
    TaskItem.vue         # Individual task card
    TaskForm.vue         # Create/edit task form
    TaskColumn.vue       # Kanban column
    WeekView.vue         # Weekly calendar view
    DailyReview.vue      # Daily review workflow
    WeeklyReview.vue     # Weekly review workflow
    WorkstreamRow.vue    # Workstream grouping
    WorkstreamCell.vue   # Cell within workstream grid
    WorkstreamPicker.vue # Workstream selector
    TagFilter.vue        # Filter tasks by tags
    TagPicker.vue        # Tag selector
    SearchBar.vue        # Task search
    BiteModal.vue        # Quick-add task modal
    SettingsModal.vue    # User settings
  composables/
    useAuth.js           # Authentication state
    useTasks.js          # Task CRUD & state
    useTags.js           # Tag management
    useWorkstreams.js    # Workstream management
    useWeekLogic.js      # Weekly view logic
    useReviews.js        # Daily/weekly review logic
    useMultiSelect.js    # Multi-select tasks
    usePreferences.js    # User preferences
    useApiKey.js         # API key management
  styles/                # Global styles
  lib/                   # Shared utilities
public/                  # Static assets
supabase/                # Supabase config & migrations
tessio-ds/               # Design system
```

## Key Commands
- `npm run dev` — Start Vite dev server
- `npm run build` — Production build
- `npm run preview` — Preview production build

## Key Concepts
- **Workstreams**: High-level categories for organizing tasks (like projects or areas of responsibility)
- **Bites**: Quick-add tasks (the BiteModal)
- **Daily Review**: End-of-day workflow to review what got done and plan tomorrow
- **Weekly Review**: End-of-week workflow to review progress and plan the week ahead

## How It Fits in the Family
- **Genco** (coming soon) will create tasks in Tessio from email actions
- **Clemenza** (coming soon) will create follow-up tasks after meetings
- **Consigliere** (coming soon) will break projects into Tessio tasks
- **Luca** can reference Tessio tasks when scheduling work blocks
