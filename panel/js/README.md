# Panel JavaScript architecture

The panel source is split into ordered classic scripts to keep the current runtime and shared lexical scope intact without introducing a build step.

Load order is defined in `../index.html` and must be preserved:

1. `core.js` — shared constants, DOM helpers, custom controls, API client, editor state and common utilities.
2. `avatars.js` — avatar request queue, lazy loading and avatar rendering.
3. `views.js` — editor and page rendering functions.
4. `actions.js` — delegated action handlers.
5. `auth.js` — login, logout, session restoration, permission checks and panel event listeners.
6. `workspace.js` — division roster, calendar, tasks and final startup initialization.

**Important:** these files intentionally use classic `<script defer>` tags, not `type="module"`. They share the same global lexical environment, and the order matters. If migrating to ES modules later, explicitly export/import shared values and move startup into a dedicated entry point first.

Shared panel styling remains in `panel.css`; avoid duplicating shared component rules in page-specific CSS.
