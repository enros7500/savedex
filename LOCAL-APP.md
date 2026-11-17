# SaveDex local app guide

[Overview and setup](README.md#run-locally) · [Development](DEVELOPMENT.md) · [Public demo](DEMO.md)

## Local app and public-demo build

Both versions use the same source and main branch. They are selected at build time, not by a URL parameter or an in-app switch.

| | Local app | Public demo |
|---|---|---|
| Video input | Instagram and YouTube URLs | One fixed, masked sample |
| Processing | Existing local extractor | Browser-only simulation |
| Place research | Installed Codex CLI and its session | Predefined responses |
| Library storage | Local SQLite database | In memory; reset on reload |
| Interface language | English by default; Spanish available | English only |
| Backend connection | Local HTTP API and SSE | None |

**Restart demo** restores the initial state. Each visitor has an independent temporary session. The demo does not download videos, invoke the extractor or models, or connect to the local API. Visitor-initiated links such as Google Maps open an external website.

In the local app, extracted names, titles and evidence retain their source language. The **English / Español** selector stores the interface preference in the browser. Routes use `/#add`, `/#processing`, `/#explore` and `/#results`; older Spanish bookmarks redirect while preserving parameters.

## Processing and place research

Videos are processed sequentially. **Stop** lets the active video finish before pausing the queue. Ctrl+C requests backend shutdown after the active video; closing the browser does not stop extraction. Removing a completed attempt from Processing hides it in that browser while retaining history and providing Undo. Pending or active work stays visible.

Instagram titles use public HTML metadata without downloading media. If metadata is unavailable, the URL remains the title. A title never counts as an extracted place. Completed attempts without places appear under **Needs attention**.

Place research uses the installed Codex CLI, its existing ChatGPT session and `gpt-6-sol`. It consumes session usage and consults web sources using the place's name, address and location context. Confirmed coordinates, descriptions and sources are stored separately from the original extraction; ambiguous places remain pending review. Up to two photos may be returned when their reuse can be confirmed.

Research runs one task at a time in an ephemeral read-only sandbox with a 180-second limit. Interrupted tasks can be retried and do not restart automatically. Set `SAVEDEX_CODEX_EXE` in `.env` to override the CLI path.

## Privacy and local data

Application data defaults to `data/savedex.sqlite`. Set `SAVEDEX_DATABASE` to use another persistent location. Relative paths resolve against the repository root. The root `.env` is loaded independently of the launch directory; existing environment variables take precedence. To back up data, stop the server and copy the database together with its associated SQLite files.

Keep real libraries, extracted media metadata, credentials, environment files, browser profiles and generated reports private. `.gitignore` excludes `.env`, databases, `data/`, `.cache/`, local tools and historical `docs/` reports. The screenshots above contain only the demo's illustrative dataset. The extractor's bundled schema license is included at `packages/contracts/schemas/EXTRACTOR-LICENSE`; dependencies retain their own licenses.
