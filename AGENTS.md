# Repository Guidelines

## Project Structure & Module Organization

SmartCinema is a dependency-free, vanilla JavaScript commercial cinema booking app. `index.html` is the only consumer entry and `internal.html` is the noindex, admin-only operations entry. Application code lives in `src/`: `src/commercial.js` and `src/internal.js` are thin UI entry points, `src/domain/` owns catalog/booking/order/user rules, `src/application/commercial/` owns use cases, `src/infrastructure/` owns catalog, browser and Storage v1/v2/v3 migration adapters, and `src/ui/` owns accessible DOM controllers. Styles are split by consumer and operations concerns in `public/styles/`. Tests live in `tests/`, while detailed design and process notes are in `doc/`.

## Build, Test, and Development Commands

- `npm install`: confirms the Node project setup; there are currently no external dependencies.
- `npm start`: runs `scripts/server.js` and serves the app at `http://localhost:8080`.
- `npm test`: runs the custom test runner in `tests/runner.js`.
- `npm run lint`: placeholder command; no linter is configured.
- `npm run build`: placeholder command; no bundler is required for this pure browser app.

## Coding Style & Naming Conventions

Use ES modules, classes, and explicit imports. Match existing JavaScript formatting: 4-space indentation, semicolons, single quotes, and `PascalCase` class/module filenames such as `CommercialBookingService.js` and `CommercialSeatMapController.js`. Use `camelCase` for variables and methods. Keep CSS organized in the existing style files and prefer variables from `public/styles/variables.css` over hard-coded repeated values.

## Testing Guidelines

Tests use a lightweight custom framework, not Jest or Mocha. Add focused test files under `tests/` using the existing `test-*.js` naming pattern, then import them from `tests/runner.js` so `npm test` covers them. Prioritize deterministic coverage for catalog, ticket/seat rules, pricing, holds, inventory, order/refund behavior, migration and operations permissions. For UI changes, also run `tests/browser-regressions.html` and verify desktop/mobile views with `npm start`.

## Commit & Pull Request Guidelines

Recent history uses short summaries, often with prefixes such as `feat:` or version labels like `v4:`; keep commits concise and outcome-focused. Chinese or English messages are both acceptable, but be consistent within a change set. Pull requests should follow `doc/PULL_REQUEST_TEMPLATE.md`: describe what changed, why, how to verify, include screenshots for UI work, and confirm tests, browser checks, docs updates, and absence of secrets or generated artifacts.

## Security & Configuration Tips

Data is stored in LocalStorage behind repositories in `src/infrastructure/storage/`; do not commit exported user data or credentials. Keep changes scoped, avoid unrelated formatting churn, and update `README.md`, `TESTING.md`, or `doc/` when behavior or workflows change.
