# Panel JavaScript architecture

The panel uses ordered classic scripts and no build step. Keep the load order in `../index.html`: later files rely on shared helpers and state declared earlier.

1. `core.js` — shared DOM helpers, custom selects/date picker, dialogs and common UI utilities.
2. `editor-model.js` — event editor model, defaults, constants, API client and shared editor state.
3. `avatars.js` — avatar request queue, lazy loading and avatar rendering.
4. `publications.js` — publication management UI and upload/delete actions.
5. `portal.js` — public portal settings and category management.
6. `logs-access.js` — audit logs and account/access management.
7. `profile.js` — account profile and avatar editing.
8. `preview.js` — event preview iframe and preview synchronization.
9. `editor.js` — editor state loading, navigation, draft/publish controls, theme and event-page selector.
10. `actions.js` — delegated action map.
11. `auth.js` — login/logout, session restoration, permissions and panel event listeners.
12. `workspace.js` — division roster, calendar, tasks and final startup initialization.

These files intentionally use classic `<script defer>` tags, not `type="module"`. Top-level declarations share the browser's global lexical environment; changing the order or converting to modules requires explicit imports/exports and a dedicated startup entry point.

Shared styling stays in `panel.css` so controls, cards, forms, and modals keep one consistent design system.
