# Security and operations checklist

This document separates controls implemented in code from controls that still require configuration in Cloudflare or GitHub.

## Implemented in the repository

- Portal HTML is sanitized with a locally hosted DOMPurify build before it is inserted into the page.
- The Worker applies a server-side deny-list to event HTML and validates publication file signatures against the declared MIME type.
- JSON request bodies are capped at 15 MiB while streaming; publication files are capped at 10 MiB and avatars at 300 KiB.
- Login attempts are limited by account, IP address and account/IP pair in D1.
- Session tokens are held in `sessionStorage`; server-side sessions have a 12-hour absolute lifetime and a rolling idle expiry.
- Workspace writes use revision checks to reject stale concurrent updates.
- The schema compatibility routine runs once per Worker isolate rather than on every API request.
- The Pages workflow excludes the Worker source from the public site artefact.

## Cloudflare actions still required

1. **Remove `OWNER_SETUP_KEY` after confirming the existing Owner account works.** The setup route is locked once an Owner exists, but removing the secret reduces the impact of accidental misuse.
2. **Check `ALLOWED_ORIGIN`.** It should be exactly `https://lspd-mrd.github.io`, with no path and not `*`.
3. **Review `GH_TOKEN`.** Use a fine-grained token limited to the `LSPD-MRD/events` repository, with only the required Contents read/write permissions and metadata access.
4. **Add a Cloudflare WAF/rate-limiting rule** for `POST /auth/login` on the Worker hostname. The D1 controls in code provide a second layer, not a replacement for edge-level protection.
5. **Enable two-factor authentication** for GitHub and Cloudflare accounts with access to this project.

Do not paste secret values into issues, PR comments or chat.

## Important privacy limitation: internal communications

Files uploaded as `Communication interne` (`comm-interne`) or `Compte-rendu` are currently stored under `public/uploads/` and listed in a public JavaScript catalogue. **They are publicly accessible by URL even when the category is hidden in the portal.** Hiding a category is presentation, not access control.

Until private file storage is implemented, do not upload confidential or sensitive documents through these categories. The proper fix requires a private Cloudflare R2 bucket (or another private object store), a Worker binding and authenticated download routes, followed by migration/removal of any existing public copies. Creating the bucket/binding is a manual Cloudflare action and should be completed before that migration is merged.

## Remaining engineering work

- Add integration tests against a non-production D1 database for login, expiry, role permissions, logout, password changes and workspace conflicts. The current tests cover pure validation and the regression that previously caused HTTP 401 after login.
- Move private communications to private object storage and remove existing public copies after verifying the migration.
- Add conflict-aware retry/merge behavior for concurrent writes to shared GitHub-backed catalogues. Current GitHub SHA checks prevent silent overwrite but a concurrent edit can fail and must be retried.
- Continue modularizing and documenting Worker route handlers. Keep the current single entrypoint until deployment moves to a tested Wrangler build, rather than introducing imports the Dashboard copy/paste deployment may not resolve.
