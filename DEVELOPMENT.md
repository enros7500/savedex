# SaveDex development and validation

[Overview](README.md) · [Demo runtime](DEMO.md) · [Local app behavior and data](LOCAL-APP.md)

### Development and demo builds

After building once, run `.\scripts\pnpm.ps1 dev` for live reload. Angular listens on `127.0.0.1:4200` and proxies `/api` to port 3210. Update `apps/web/proxy.conf.json` if the backend port changes.

```powershell
# Local application
.\scripts\pnpm.ps1 build

# Static demo hosted at /
.\scripts\pnpm.ps1 build:demo

# Static demo hosted at /savedex/
.\scripts\pnpm.ps1 build:demo:pages
```

Both demo commands write to `apps/web/dist-demo/browser/`, separately from the normal application build. Serve that directory from a static host. Demo transport and data are replaced at build time; details are in [DEMO.md](DEMO.md).

### Automatic publication

The [Demo · GitHub Pages workflow](.github/workflows/demo-pages.yml) runs for relevant pushes to `main` and can also be started manually. It checks types, runs synthetic tests, builds the app and demo, and verifies the demo in a browser before publishing. Documentation-only changes do not redeploy.

Only `apps/web/dist-demo/browser/` is uploaded. Environment files, SQLite databases, local extractor configuration and Codex sessions are outside the hosted artifact. Deployment uses GitHub's short-lived Pages permissions. Shared interface improvements reach the demo through the same main branch.

## Validation

```powershell
.\scripts\pnpm.ps1 typecheck
.\scripts\pnpm.ps1 test
.\scripts\pnpm.ps1 build
.\scripts\pnpm.ps1 test:e2e:all
```

Browser journeys cover processing, catalog, language persistence, place research and contextual extraction. They use temporary SQLite databases and simulated extractors/agents. Reports and screenshots stay under `.cache/`. These checks do not process personal data or invoke models.

To validate the Pages demo separately:

```powershell
.\scripts\pnpm.ps1 build:demo:pages
$env:SAVEDEX_DEMO_BASE_PATH='/savedex/'
.\scripts\pnpm.ps1 test:e2e:demo
```

The demo suite checks the full journey, five agent responses, English despite a stored Spanish preference, mobile layout, reduced motion, reset/reload and the absence of API/SSE/fetch calls or external resource requests.

<details>
<summary>Extractor verification and historical acceptance</summary>

```powershell
.\scripts\pnpm.ps1 extractor:verify
.\scripts\pnpm.ps1 contracts:generate
```

Extractor verification expects the sibling repository `../savedex-extractor` with its existing Windows installation under `work/asr-venv`. It checks synthetic fixtures, version, diagnostics and a controlled invalid request without processing real URLs or changing extractor code. Generated TypeScript types follow the extractor's JSON Schemas; progress events use a separate protocol.

The default extractor budget is 900 seconds plus a 20-second shutdown grace period. A `partial` result with exit code 2 is valid and retains its review reasons. Schema checks cover structure; extractor validation also checks references and semantic rules.

Historical real-media acceptance covered ten URLs: five successes, two partial results and three errors. A separate top-ten case returned two items with eight missing; exhaustive reprocessing did not improve recovery. Synthetic tests do not repeat those real extractions. Real-media acceptance is an explicit, separate operation using `scripts/acceptance-real.mjs`, the network and existing models. Its database stays under `.cache/delivery-7/real/`.

Historical delivery checks remain in `scripts/verify-delivery-1.mjs` through `scripts/verify-delivery-7.mjs`. Some require the sibling extractor, Chrome/Edge or free ports 3210/4200. Historical reports stay local because they may contain personal video metadata.

</details>

## Project structure

- `apps/web/`: Angular interface, shared screens and isolated demo runtime.
- `apps/api/`: local API, SQLite persistence, queue, extractor adapter and place agent.
- `packages/contracts/`: API contracts, extractor schemas and generated types.
- `scripts/`: Windows setup, startup, verification and maintenance tools.
- `tests/`: synthetic fixtures, unit tests and browser journeys.
- `assets/readme/`: reviewed screenshots of the public demo.

The local app uses HTTP and SSE on one loopback origin. A sequential worker invokes the existing extractor and stores results in SQLite.

## Tentative roadmap

- **V2:** library organization, more flexible search and multi-URL import.
- **V3:** review tools and tracking for incomplete collections.
- **V4:** packaged local distribution and portable storage.

These items are outside V1. Further Output refinement is planned for a later phase.
