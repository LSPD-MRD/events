# LSPD MRD Portal

Static portal and internal management panel for the LSPD Media Relations Division.

## Architecture

- `index.html` and `public/` — public portal, event pages, publication catalogue and assets.
- `panel/` — authenticated management panel. Its browser JavaScript is split by responsibility in `panel/js/`.
- `worker/worker.js` — Cloudflare Worker API for authentication, D1 records, event drafts, publication and workspace operations.
- `.github/workflows/pages.yml` — builds the GitHub Pages artefact from portal files. The Worker source is deliberately excluded.
- `.github/workflows/worker-tests.yml` — syntax checks and dependency-free regression tests.

The panel currently uses ordered classic scripts to share a common state and helper layer without a bundler. Keep the load order documented in [panel/js/README.md](panel/js/README.md). The Worker remains a single entrypoint because its deployment is managed separately in Cloudflare; splitting it into modules should be paired with a deliberate move to a reproducible Wrangler build.

## Development and validation

Requirements: Node.js 24 or a compatible current Node.js release. No npm dependencies are needed for the Worker tests.

From the repository root:

```sh
npm test --prefix worker
npm run check --prefix worker
```

The GitHub Actions workflow also checks syntax for the panel and public JavaScript files.

## Deployment

1. Changes to `main` trigger the GitHub Pages workflow.
2. `worker/worker.js` is **not** deployed by GitHub Pages. Deploy Worker changes separately in Cloudflare Workers.
3. Keep D1 bindings, GitHub tokens and Worker secrets in Cloudflare settings only; never commit them.
4. Verify authentication, publication, workspace saves and role permissions after a Worker deployment.

See [the security operations guide](docs/SECURITY-OPERATIONS.md) for required Cloudflare configuration and known privacy limitations.
