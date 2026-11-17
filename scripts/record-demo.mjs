// Capture the current English static demo through its verified browser journey.
// Build first: .\scripts\pnpm.ps1 build:demo:pages
process.env.SAVEDEX_DEMO_BASE_PATH ??= '/savedex/';
process.env.SAVEDEX_CAPTURE_README = '1';
await import('../tests/e2e/demo.mjs');
