# microsoft-qre-dashboard

## Development

The app lives in [`app/`](app/) (npm project, `node`/`npm` versions pinned in
`app/package.json`).

```sh
cd app
npm ci            # install dependencies
npm run typecheck # tsc --noEmit
npm run test      # vitest unit tests
```

### Pre-commit hook (fast checks)

A committed hook in [`.githooks/`](.githooks/) runs `typecheck` + unit tests
before each commit. Git hooks aren't shared automatically, so **activate it once
per clone**:

```sh
git config core.hooksPath .githooks
```

The hook runs only the fast checks. Slow real-engine / conformance tests
(spawning the Python `qdk.qre` estimator) are kept out of the commit path — name
them `*.conformance.test.ts` and run them via CI / a dedicated script instead.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same typecheck +
unit tests on pull requests and pushes to `week-2/team-3` and `main`.