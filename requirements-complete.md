# Media Server - Complete UX & Product Requirements

This document consolidates **all UX/product features suggested throughout our discussion**, from the initial UX pass through the latest interaction ideas.

The goal is to evolve the application into a polished, fast, privacy-first personal media experience rather than a generic CRUD media browser.

## Product Principles

1. Filesystem remains the source of truth for original media.
2. PostgreSQL stores metadata and application state.
3. Original media remains read-only to the application.
4. No external metadata scraping or sensitive external analytics.
5. UI adapts to the user's current task.
6. Defaults remain clean; advanced customization is progressive.
7. Mouse, keyboard, and touch work where applicable.
8. Respect `prefers-reduced-motion`.
9. Preserve user state where it improves continuity.
10. Avoid unnecessary API calls and expensive media processing.
11. Never silently delete or modify original media.
12. Privacy is a first-class UX concern.

## UX Pillars

- Discover
- Browse
- Watch
- Personalize
- Protect

---

# 1. View and Layout System

## View Modes

Support and persist:
- Grid
- Compact
- Large
- Cinematic
- List where appropriate

## Density

Support:
- Spacious
- Comfortable
- Compact
- Dense

Density affects card dimensions, gaps, padding, metadata spacing, and column count.

## View Presets

Provide:
- **Minimal:** large imagery, minimal metadata and controls
- **Comfortable:** balanced information and spacing
- **Detailed:** high information density
- **Cinematic:** large artwork, minimal text, strong visual emphasis
- **Custom:** activated when the user changes individual settings

## Per-Page Preferences

Allow different view/density settings by context, e.g. Library, Favorites, Collections. Persist by route/context.

---

# 2. Media Card UX

## Configurable Card Content

Allow control over title, performer, studio, tags, release date, duration, watch state, favorite state, and progress bar.

## Quick Actions

Contextual actions:
- Play
- Resume
- Favorite
- Add to collection
- Mark watched/unwatched
- Edit
- Details
- More

Show actions on hover/focus instead of permanently consuming card space.

## Content-Type-Aware Cards

**Video:** preview, play, resume, zoom, metadata.

**Photo:** zoom, gallery, metadata.

**Folder:** open, item count.

## Hover Timing

Suggested:
- 0-300ms: no expensive work
- ~300ms: contextual controls
- ~500-700ms: start preview

Cancel preview work when the pointer leaves. Never depend on hover on touch devices.

## Hover Intelligence

Initial hover -> controls; longer hover -> preview; extended hover -> expanded metadata. Keep this subtle and configurable.

---

# 3. Navigation and Continuity

## Breadcrumbs

Support deep paths such as:
`Library > Performer > Studio > Collection > Video`

## Back Navigation

Restore scroll position, filters, sort, search query, view mode, density, selected tab, and expanded sections.

## Scroll Restoration

Returning to a grid should restore the previous position rather than jumping to the top.

## Last Session

Optionally restore last route, collection, performer/studio, filters, sort, scroll position, and view configuration.

Possible UX: `Welcome back -> Continue where you left off`.

## Recently Browsed / Interacted

Track locally and separately from playback:
- Recently Viewed/Browsed
- Recently Played
- Recently Added
- Recently Edited
- Recently Favorited

---

# 4. Peek, Details, and Quick Edit

## Peek Panel

Inspect an item without leaving the current page. Show artwork, title, performers, studio, release date, description, tags, favorite/watch state, and progress.

Actions: Play, Resume, Favorite, Add to Collection, Edit, More.

Open from card action, keyboard shortcut, or context menu. Close with Close, Escape, or backdrop click where appropriate. Preserve underlying page state.

## Quick Edit

Allow common metadata changes directly from the peek/details surface. Avoid unnecessary navigation for simple edits.

---

# 5. Contextual UI

The UI should change based on the user's task.

### Browsing
Search, filters, sort, view controls, quick actions.

### Watching
Minimal navigation, player, queue, next item, playback controls.

### Managing
Selection mode, bulk actions, metadata panel, scan status.

### Privacy
Discreet mode and privacy controls.

Do not display every possible control simultaneously.

---

# 6. Command Palette

Expand existing `Ctrl/Cmd + K` into a full command/search surface.

### Search
Titles, performers, studios, tags, collections, folders.

### Commands
Resume last video, Surprise Me, Favorites, Collections, Library, Scan, Toggle Discreet Mode, Toggle Focus Mode, Appearance, Settings.

### Navigation
Home, Library, Performers, Studios, Collections, Favorites, Settings.

Display keyboard hints.

---

# 7. Search, Filters, Sorting, and Saved Searches

## Global Search

Search across media, performers, studios, tags, collections, and folders.

Group results into Media, Performers, Studios, Collections, and Folders.

Support keyboard navigation, instant results, highlighted matches, recent searches, and saved searches. Debounce requests.

## Advanced Filters

Composable filters:
- Performer
- Studio
- Tag
- Category
- Collection
- Year
- Duration
- Resolution
- Format
- Watched/unwatched
- Favorite
- Recently added

Show active filters and provide `Clear Filters`. Never silently reset filters.

## Sorting

Support Recently Added, Recently Watched, Most Played, Alphabetical, Duration, File Size, and Random. Persist preferences where useful.

## Saved Searches

Allow saving searches such as Unwatched, Favorites, year, duration, performer, or studio queries. Make them accessible from navigation/home.

## Surprise Me

Controlled random discovery with optional source, duration, and recently-watched exclusions. Generating a result must not change library state.

---

# 8. Homepage and Personalization

## Homepage Sections

Potential sections:
- Hero
- Continue Watching
- Recently Added
- Recently Watched
- Favorites
- Most Played
- Unwatched
- Recently Updated
- Recently Browsed
- Recently Interacted
- Collections
- Pinned
- Random Picks

Hide empty sections automatically.

## Customize Home

Allow enabling/disabling, reordering, limiting, and pinning sections. Use drag-and-drop where practical. Keep configuration behind a contextual `Customize Home` action.

## Continue Watching

Show artwork, title, progress bar, percentage, remaining time, and resume action. Support Resume, Start Over, and Remove from Continue Watching.

## Personal Homepage

Use local application behavior to make the home page useful without external analytics or AI recommendations.

## Pinned Home

Allow pinned performers, studios, collections, folders, and saved searches.

---

# 9. Performer, Studio, and Collection UX

## Performer Pages

Show hero/performer artwork, item counts, latest items, most watched, collections, and favorite state. Actions: Play, Shuffle, Favorite, Browse All.

## Studio Pages

Show artwork, item count, performer count, total duration where available, latest/popular/unwatched items, and collections. Actions: Browse, Shuffle, Filter.

## Collections

First-class destinations with hero artwork, name, description, item count, and total duration. Actions: Play All, Play From Here, Shuffle, Continue, Edit.

## Smart Collections

Provide query-based dynamic collections such as Favorites, Unwatched, Recently Added, Recently Watched, Most Played, and Recently Updated.

---

# 10. Queue and Playback

## Queue

Temporary queue with Add to Queue, Play Next, Remove, Reorder, Shuffle Queue, and Clear Queue. Accessible from player and browsing surfaces.

## Play All / Play From Here / Shuffle

Support consistently for collections, performers, studios, filtered library views, and search results where sensible.

## Full Player

Support play/pause, skip forward/back, volume, mute, fullscreen, PiP where supported, playback speed, previous/next, autoplay next, mark watched, restart, and resume.

## Mini Player

Allow browsing while playback continues. Show thumbnail, title, play/pause, progress, close, and expand.

## Player Preferences

Remember volume, playback speed, and relevant player preferences.

## Resume Prompt

When meaningful progress exists, offer `Resume` and `Start Over`. Do not prompt for effectively-new or completed videos.

## Up Next

Near the end of playback, show next item and `Play Next`. Allow autoplay configuration.

---

# 11. Cinema and Focus Modes

## Cinema Mode

Separate from Discreet Mode. Hide navigation chrome, minimize controls, maximize player/gallery, auto-hide controls, optionally show next item, and retain keyboard controls.

## Focus Mode

Reduce distractions by hiding sidebar, reducing secondary controls, emphasizing current content, and minimizing navigation.

Cinema = presentation. Focus = reduced distraction. Discreet = privacy.

---

# 12. Gallery and Artwork

## Gallery

Dedicated photo viewer supporting previous/next, zoom, fullscreen, thumbnails, slideshow, close, keyboard navigation, swipe, and pinch-to-zoom where practical.

## Artwork Management

Support Set Poster, Set Hero, Set Performer Image, Replace, Remove, and drag/drop upload where appropriate.

Clearly distinguish persistent artwork from regenerable cache assets.

## Focal Point Editor

Allow selecting an artwork focal point and use it when cropping hero, poster, performer, and collection imagery.

---

# 13. Bulk Operations and Context Menus

## Bulk Selection

Support Ctrl/Cmd-click, Shift-click, Select All, and Escape. Show a contextual action bar when items are selected.

Bulk actions: favorite/unfavorite, add/remove collection, add/remove tags, mark watched/unwatched, supported metadata edits.

Never silently delete or move originals.

## Context Menus

Desktop actions may include Play, Resume, Peek, Favorite, Add to Collection, Queue, Mark Watched, Edit, Open Folder, and More.

Provide equivalent long-press behavior on touch.

## Drag and Drop

Support media -> collection, media -> reorder collection, artwork -> artwork editor, and multiple media -> collection where appropriate.

---

# 14. Timeline and Discovery UX

For large chronological libraries, optionally provide timeline navigation by year/month. Clicking a period should filter or jump to that period.

## Recently Added Time Groups

Consider Today, Yesterday, This Week, and Earlier groupings, or relative labels such as `Added 2 hours ago`.

## Controlled Random Discovery

Surprise Me should support constraints rather than being a completely blind randomizer.

---

# 15. Scan and Library Intelligence

## Scan Progress

Show scan state, progress, files scanned, new, updated, moved, missing, skipped items, and current path/item.

States: Queued, Running, Completed, Failed, Cancelled.

Scanning should not unnecessarily block browsing.

## Incremental Scanning

Use mtime, size, and content hash. Preserve metadata, watch state, collections, and manual edits when files move/rename. Do not treat moved content as new when hash proves identity.

## What Changed

After a scan show a summary such as:
`+24 New | 8 Updated | 5 Moved | 2 Missing`

Provide `View Changes`.

---

# 16. Library Health

Create a dashboard for:
- total videos
- total photos
- storage
- unwatched
- favorites
- collections
- missing files
- duplicates
- last scan
- last backup
- cache size

Metrics should link to relevant views where useful.

## Duplicate Detection

Use content hashes. Show duplicate group, paths, sizes, hash, and discovery date. Only recommend cleanup; never auto-delete originals.

## Missing Media

Retain metadata and show title, expected path, last known path, missing-since date, and related metadata. Do not immediately delete records.

---

# 17. Cache UX

Clearly separate:

### Persistent
- database
- uploaded artwork
- preferences
- application state

### Regenerable
- posters
- hover previews
- generated thumbnails

Cache dashboard should show poster, preview, thumbnail, and total cache size.

Actions: rebuild missing, rebuild selected, clear cache.

Clearing generated cache must never delete originals, metadata, or persistent artwork.

---

# 18. Backup UX

## Backup Dashboard

Show last successful backup, size, destination, status, age, and retained count.

Actions: Back Up Now, Verify Backup, Restore.

Warn when backups are stale.

## Verification

Verify archive integrity, manifest, checksums, and database restoration where practical.

## Manifest

Include backup version, app version, schema version, timestamp, checksums, and included components.

---

# 19. Undo, Activity, and Feedback

## Undo

Use non-blocking undo for reversible actions such as favorites, collections, tags, metadata, and artwork changes.

Example: `Removed from Favorites [UNDO]`.

Use confirmation dialogs only for genuinely destructive actions.

## Activity Log

Track important events such as scans, backups, artwork changes, metadata changes, collection changes, privacy changes, and restores. Avoid unnecessary sensitive media details.

## Toasts

Provide immediate feedback for meaningful actions. Do not interrupt playback.

---

# 20. Loading, Empty, and Error States

## Loading

Prefer skeleton cards, skeleton metadata, progressive image loading, and meaningful long-operation indicators. Avoid layout shifts.

## Empty

Explain why the area is empty and offer a useful action.

Example:
`Nothing here yet. This collection doesn't contain any media. [Browse Library] [Add to Collection]`

## Error

Explain what happened, whether user data is safe, and how to recover. Avoid raw stack traces in normal UI.

---

# 21. Smart Image and Preview Performance

## Image Loading

Use:
`Placeholder -> low-resolution preview -> full image`

Requirements:
- lazy loading
- preload nearby items
- cancel unnecessary requests
- avoid loading thousands simultaneously

## Preview Performance

- activation delay
- preload only when useful
- cancel when pointer leaves
- avoid preview generation during rapid scrolling
- reuse cached previews
- avoid excessive ffmpeg work

---

# 22. Virtualized Grid

For large libraries:
- virtualize card rendering
- render visible/near-visible items only
- avoid thousands of DOM nodes
- preserve keyboard navigation
- preserve scroll behavior

Use a project-compatible virtualization solution.

---

# 23. Responsive and Touch UX

Support desktop, laptop, tablet, and mobile-sized layouts. Do not merely shrink desktop UI.

Adapt grid, sidebar, filters, player, action bars, dialogs, and peek panels.

## iPad / Touch

Do not depend on hover. Support long press, swipe, pinch-to-zoom, touch-friendly controls, responsive sidebar, bottom sheets where appropriate, and large player controls.

---

# 24. Accessibility

Support:
- keyboard navigation
- visible focus states
- semantic controls
- useful ARIA labels
- sufficient contrast
- screen-reader-friendly dialogs/panels

Cards must not become keyboard traps. Dialogs/panels must correctly manage focus.

## Keyboard Navigation

Potential shortcuts:

```text
J/K       Previous/Next
Enter     Open
Space     Preview/Play
P         Play
F         Favorite
C         Collection
W         Watched
E         Edit
Q         Queue
R         Random
/         Search
Esc       Close/Back
```

Do not trigger single-key shortcuts while typing. Document shortcuts in the command palette.

## Reduced Motion

Respect `prefers-reduced-motion`.

Provide animation settings:
- Full
- Reduced
- None

---

# 25. Theme and Appearance

Continue the existing appearance system.

Potential settings:
- light/dark/system
- accent
- card radius
- density
- typography scale
- tile size
- hero height
- animation level

Keep advanced controls behind Customize/Settings.

---

# 26. Personal UI Profiles

Provide UI presets without introducing multi-user complexity:

```text
My UI

● Cinematic
○ Minimal
○ Compact
○ Detailed
○ Custom
```

A profile can control tile size, density, metadata visibility, hover behavior, animations, homepage, player behavior, sidebar, and theme.

---

# 27. First-Run Experience

Minimal onboarding:

1. Choose media root.
2. Configure application.
3. Create account/password.
4. Run initial scan.
5. Show first library.

Do not overwhelm onboarding with advanced settings.

---

# 28. Progressive Disclosure

Basic controls are visible. Advanced controls appear through:
- Customize
- More
- Context menu
- Command palette
- Settings

Avoid turning the UI into a cockpit.

---

# 29. Privacy and Filesystem Safety

Never:
- scrape external metadata
- upload media externally
- upload sensitive metadata externally
- expose media without authentication
- expose previews/thumbnails without authentication
- bypass existing auth on new routes
- expose unblurred content through new components

Original media remains read-only. Generated content belongs in dedicated writable directories.

Never silently rename, move, or delete original media.

---

# 30. API and State Architecture

When implementing:
1. Inspect existing APIs first.
2. Reuse existing endpoints.
3. Add endpoints only when necessary.
4. Separate server state from UI state.
5. Use optimistic updates only with rollback.
6. Keep expensive operations asynchronous.
7. Reuse existing authentication/session mechanisms.
8. Centralize privacy behavior.

Avoid feature-specific duplicated state stores.

---

# 31. Performance Requirements

The UI must remain responsive with thousands of items.

- virtualize large grids
- lazy-load artwork
- debounce search
- avoid duplicate API calls
- cache appropriate data
- avoid expensive preview work during fast scrolling
- paginate/virtualize where appropriate
- keep background work from freezing browsing

---

# 32. Testing Requirements

Add/update tests for meaningful behavior.

### UI
- navigation
- filters
- search
- view preferences
- discreet mode
- player state
- bulk selection
- keyboard interactions
- touch interactions where applicable

### Server
- authentication
- new endpoints
- scanning
- content-hash matching
- backup behavior
- cache behavior

### Regression
Ensure scanning, playback, metadata, collections, favorites, watch state, and authentication continue to work.

---

# 33. Recommended Implementation Order

## Phase 1 - UX Foundation
- View modes
- Density
- View presets
- Per-page preferences
- Persistent scroll/navigation state
- Quick actions
- Peek panel
- Context menus
- Command palette

## Phase 2 - Discovery
- Search improvements
- Advanced filters
- Sorting
- Saved searches
- Surprise Me
- Recently Browsed
- Recently Interacted
- Smart Collections
- Pinned items
- Timeline browsing

## Phase 3 - Homepage
- Continue Watching
- Recently Added
- Recently Watched
- Favorites
- Recently Browsed
- Personalized sections
- Drag/drop homepage customization
- Last Session

## Phase 4 - Playback
- Queue
- Play All
- Play From Here
- Shuffle
- Mini Player
- Resume Prompt
- Up Next
- Player improvements
- Cinema Mode
- Focus Mode

## Phase 5 - Media Management
- Bulk selection
- Quick Edit
- Artwork management
- Focal Point Editor
- Gallery improvements
- Metadata improvements
- Drag/drop

## Phase 6 - Library Intelligence
- Scan progress
- Incremental scanning
- What Changed
- Library Health
- Missing Media
- Duplicate Detection

## Phase 7 - Reliability
- Cache Dashboard
- Backup Dashboard
- Backup Verification
- Backup Manifest
- Restore Verification
- Activity Log
- Undo System

## Phase 8 - Polish
- Responsive refinement
- iPad/touch UX
- Accessibility
- Reduced Motion
- Animation Controls
- Loading states
- Error states
- Empty states
- Smart image loading
- Grid virtualization
- PWA

---

# 34. What NOT to Build Yet

Avoid adding complexity merely because it sounds impressive.

Do not add unless explicitly requested:
- external metadata scraping
- cloud media storage
- AI recommendations
- social features
- multi-user account management
- public sharing
- unnecessary analytics
- automatic original-file cleanup
- transcoding
- external recommendation APIs

Keep the product focused on being an excellent private personal media library.

---

# 35. Definition of Done

A feature is complete only when:

- Existing functionality still works.
- Existing authentication is respected.
- Discreet Mode is respected.
- Original media remains protected/read-only.
- State persists where expected.
- Loading states exist.
- Empty states exist.
- Error states exist.
- Keyboard support exists where applicable.
- Touch support exists where applicable.
- Responsive behavior is tested.
- Expensive media operations are optimized.
- No unnecessary API calls are introduced.
- Sensitive data is not sent externally.
- Tests are added or updated.
- Existing design conventions are reused.
- No unnecessary dependency is introduced.
- The feature does not clutter the default UI.

---

# 36. Overall UX Goal

The finished application should feel like a **personal media operating system** rather than a database with thumbnails.

```text
                    PERSONAL MEDIA OS
                           |
          +----------------+----------------+
          |                |                |
       DISCOVER          BROWSE           WATCH
          |                |                |
       Search           Grid/List         Player
       Random           Filters           Queue
       Home             Collections       Next
          |                |                |
          +----------------+----------------+
                           |
                      PERSONALIZE
                           |
              Layout / Density / Views
              Homepage / Shortcuts
              Themes / UI Presets
                           |
                         PROTECT
                           |
              Discreet / Focus / Privacy
```

## Core Principle

> The application should adapt to the user's workflow instead of forcing the user to adapt to the application.

Prioritize, in order:

1. Consistency
2. Speed
3. Continuity
4. Privacy
5. Discoverability
6. Accessibility
7. Customization
8. Visual polish

Feature count is secondary to a coherent experience.
