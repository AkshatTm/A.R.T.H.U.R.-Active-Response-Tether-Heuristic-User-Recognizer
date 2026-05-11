# Contributing Guide

| Field | Value |
|-------|-------|
| **Product** | A.R.T.H.U.R. |
| **Last Updated** | 2026-04-17 |

---

## 1. Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/Sentry-AI.git
   cd Sentry-AI
   ```
3. **Set up** both environments following the [Setup Guide](SETUP_GUIDE.md)
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/<short-description>
   ```

---

## 2. Repository Structure

```
SentryOS_Project/
├── backend/         # Python 3.10+ / FastAPI — AI engine + BLE tether (Bleak)
├── frontend/        # Next.js 14 / React 18 / TypeScript — UI
├── *.md             # Documentation (root-level Markdown files)
└── README.md        # Project overview & quick start
```

- **Backend changes** go in `backend/`
- **Frontend changes** go in `frontend/src/`
- **Documentation changes** go in root-level `.md` files
- Do not mix backend and frontend code in a single module

---

## 3. Code Standards

### 3.1 Python (Backend)

| Rule | Standard |
|------|----------|
| **Formatter** | Follow PEP 8 conventions |
| **Type Hints** | Required on all function signatures |
| **Docstrings** | Required for modules, classes, and public functions (Google style) |
| **Imports** | Standard library → third-party → local (separated by blank lines) |
| **Naming** | `snake_case` for variables/functions, `PascalCase` for classes |
| **Constants** | `UPPER_SNAKE_CASE` at module level |
| **Async** | Use `async`/`await` for all I/O operations (BLE, WebSocket) |

### 3.2 TypeScript (Frontend)

| Rule | Standard |
|------|----------|
| **Strict Mode** | `strict: true` in `tsconfig.json` |
| **Lint** | `npm run lint` must pass (ESLint + next/lint config) |
| **Type Check** | `npx tsc --noEmit` must pass with zero errors |
| **Components** | Functional components only (no class components) |
| **Hooks** | Custom hooks prefixed with `use` (React convention) |
| **Naming** | `camelCase` for variables/functions, `PascalCase` for components/types |
| **CSS** | Tailwind utility classes + CSS custom properties. Use design tokens from `globals.css`, not hardcoded hex values in JSX |
| **Typography** | Use `--font-display` (Satoshi), `--font-body` (Space Grotesk), `--font-mono` (IBM Plex Mono) |

### 3.3 API Contract

All changes to the WebSocket payload schema must:
1. Update the TypeScript `SensorPayload` interface in `useSecuritySocket.ts`
2. Update the Python `SensorPayload` dataclass in `models.py`
3. Update the [API Reference](API_REFERENCE.md) documentation
4. Maintain backward compatibility or increment the protocol version

All changes to the BLE REST endpoints must:
1. Update the endpoint handler in `main.py`
2. Update the `useProximityTether.ts` hook
3. Update the [API Reference](API_REFERENCE.md) documentation

---

## 4. Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Build process, tooling, dependencies |

### Scopes

| Scope | Description |
|-------|-------------|
| `backend` | Python backend changes |
| `frontend` | Next.js frontend changes |
| `docs` | Documentation |
| `hooks` | Custom React hooks |
| `vision` | Vision pipeline (camera, face detection, color) |
| `ble` | Bluetooth tether (backend Bleak service or frontend REST hooks) |
| `ui` | UI components (TiltCard, GradientMesh, NumberFlip, etc.) |
| `auth` | Authentication flow (useAuthGuard, useSetupGuard) |

### Examples

```
feat(ble): add RSSI smoothing with exponential moving average
feat(ui): add TiltCard 3D perspective component
fix(hooks): resolve WebSocket reconnect race condition in Strict Mode
docs(api): add BLE REST endpoint documentation
refactor(backend): extract BLE config persistence into dedicated module
```

---

## 5. Pull Request Process

### 5.1 Before Submitting

- [ ] Code compiles: `npx tsc --noEmit` (frontend)
- [ ] Linting passes: `npm run lint` (frontend)
- [ ] Backend starts without errors: `python main.py`
- [ ] Frontend starts without errors: `npm run dev`
- [ ] WebSocket integration works (backend + frontend running together)
- [ ] BLE REST endpoints respond correctly (`/bluetooth/status`)
- [ ] Auth flow works (Login → Setup → Dashboard)
- [ ] Documentation updated if API or behavior changed
- [ ] Commit messages follow conventional format

### 5.2 PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- List of specific changes

## Testing
- How was this tested?
- Which routes/features were verified?

## Screenshots
(If UI changes — before/after)

## Checklist
- [ ] TypeScript compiles cleanly
- [ ] ESLint passes
- [ ] Backend starts without errors
- [ ] Tested with both backend and frontend running
- [ ] BLE pairing flow tested (or bypass verified)
- [ ] Documentation updated
```

### 5.3 Review Criteria

PRs will be evaluated on:
- **Correctness** — Does it work as described?
- **Type safety** — Are TypeScript types accurate and complete?
- **Contract compliance** — Does it respect ADR-01 (JSON schema), ADR-02 (fail-closed), etc.?
- **Performance** — Does it maintain sub-250ms end-to-end latency?
- **Privacy** — Does it avoid persisting or transmitting image data?
- **Design consistency** — Does it use the design token system and typography stack?

---

## 6. Architecture Decisions

If your change involves a significant architectural decision, document it as an ADR (Architecture Decision Record) in [Design.md](Design.md#6-architecture-decision-records-adrs):

| ID | Decision | Context | Status |
|----|----------|---------|--------|
| ADR-XX | Your decision | Why this choice was made | Proposed |

Existing ADRs (01–13) are enforced. Changes that violate enforced ADRs require explicit discussion and approval.

---

## 7. Key Constraints

These constraints are non-negotiable for all contributions:

| Constraint | Reason |
|-----------|--------|
| **No databases** | Stateless edge system by design (except `ble_config.json`) |
| **No cloud services** | Privacy-first; all processing is local |
| **No image persistence** | Frames must never be saved, logged, or transmitted |
| **No additional HTTP clients** (axios, etc.) | Native fetch and WebSocket APIs are sufficient |
| **No state management libraries** (Redux, etc.) | React Context + hooks are sufficient |
| **No frontend BLE libraries** (noble, etc.) | Backend handles BLE via Bleak |
| **MediaPipe for face detection** | Mandated for CPU performance on laptops |
| **Fail-closed security** | Any sensor failure must default to restrictive state |
| **Design tokens** | All colors/fonts must use CSS custom properties from `globals.css` |

---

## 8. Reporting Issues

When filing an issue, include:

1. **Environment:** OS, Python version, Node version, Chrome version
2. **Steps to reproduce:** Exact sequence that triggers the problem
3. **Expected behavior:** What should happen
4. **Actual behavior:** What actually happens
5. **Console output:** Backend logs and/or browser DevTools console
6. **Screenshots:** If the issue is visual
