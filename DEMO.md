# SaveDex demo on GitHub Pages

The public demo lives on [GitHub Pages](https://enros7500.github.io/savedex/).

The complete project is stored in this repository. Pages publishes **only** the static Angular demo build, never the local API, database, extractor, Codex session or environment files.

## Shared UI, separate runtime

- Normal build: `pnpm build`. The application uses its local backend.
- Local demo build: `pnpm build:demo`. Serve `apps/web/dist-demo/browser/` at `/`.
- Pages demo build: `pnpm build:demo:pages`. Serve that output at `/savedex/`.
- The Angular demo configuration replaces `core/demo-config.ts` with `core/demo-config.demo.ts` at build time. This is not a URL switch visitors can use to enable the real API.
- `core/demo-session.ts` provides a browser-local transport; unknown requests fail locally. It does not fall through to the API.
- `core/demo-fixture.ts` owns the one masked sample video, five museums and predefined agent responses.
- Demo language stays English. A prominent notice explains the simulation. Demo preferences stay in memory, and reset/reload cancels pending simulations.
- The legacy results route redirects to Explore in demo mode, keeping backend downloads out of the demo.

## Keeping the demo current

The demo reuses the actual Add, Processing, Explore and place-detail components. Improvements to those components appear in the demo when compiled again; there is no second copy of the UI to maintain.

`.github/workflows/demo-pages.yml` automatically builds, checks and publishes relevant pushes to `main` (application, contracts, scripts, dependency/configuration files and demo tests). Documentation-only changes do not redeploy. Use **Actions → Demo · GitHub Pages → Run workflow** to publish manually.

The `github-pages` deployment environment is separate from the local application's runtime. The workflow uses GitHub's short-lived Pages permissions; no model keys, personal data or production credentials are needed. Keep the Pages source set to **GitHub Actions**.

When a feature introduces a new backend action, implement its fixed simulation in `DemoSession` if it belongs in the demo, or hide that action in demo mode. Keep the fixed data and no-real-calls guarantee.

## Verification

On Windows after `scripts/setup.ps1`:

```powershell
.\scripts\pnpm.ps1 typecheck
.\scripts\pnpm.ps1 test
.\scripts\pnpm.ps1 build
.\scripts\pnpm.ps1 build:demo:pages
$env:SAVEDEX_DEMO_BASE_PATH='/savedex/'
.\scripts\pnpm.ps1 test:e2e:demo
```

The browser test serves the app beneath the Pages subdirectory, checks the logo and full user journey, locates all five museums, verifies English despite a stored Spanish preference, checks mobile layout/reduced motion, tests reset/reload and rejects API/SSE/fetch calls. Explicit visitor clicks on Google Maps can open that external website.

Generated bundles, local tools, environment files, historical reports and database files are excluded from Git. Screenshots published in the README use only the demo's illustrative dataset.

## Refresh README media

The README screenshots and animated walkthrough come from the same English, five-museum journey used by the demo browser check. Build the static demo first, then run:

```powershell
.\scripts\pnpm.ps1 build:demo:pages
& .\.tools\node-v22.23.4-win-x64\node.exe scripts/record-demo.mjs
python scripts/render-demo.py
```

Encoding requires Python with Pillow. Captures go to `assets/readme/`; temporary frames and animation metadata stay in `.cache/demo-ui/walkthrough/`. The recording starts with the fixed sample, follows simulated processing, reveals all five predefined research responses, and finishes on their map locations. The GIF opens with that final result before replaying the journey. Simulation notices remain visible.

To run the browser checks against the published demo instead of a local server:

```powershell
$env:SAVEDEX_DEMO_URL='https://enros7500.github.io/savedex/'
.\scripts\pnpm.ps1 test:e2e:demo
Remove-Item Env:SAVEDEX_DEMO_URL
```

Keep `SAVEDEX_DEMO_URL` unset when capturing a fresh local build. The hosted check exercises the fixed demo, including all five research responses, populated map, mobile layout, reduced motion and reset/reload. It rejects fetch/SSE attempts and checks for external resources and browser errors; it never processes real videos or invokes models.
