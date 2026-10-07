---
name: create-asc-floating-renderer
description: Create, modify, debug, or package Agent Session Center floating-window renderers — compact HTML/CSS status widgets that surface real CLI turn and session state in an always-on-top window. Use when implementing a built-in or user-installed floating renderer, connecting visuals to authoritative session snapshots, adding renderer controls or resize behavior, or working with the sandboxed renderer bridge.
---

# Create an Agent Session Center Floating Renderer

Produce a local, offline renderer driven by Agent Session Center's authoritative session snapshots. Preserve the sandbox and treat built-in and user renderers as implementations of the same contract.

The floating window is a **compact status surface**, not a decorative widget: it should make "what is running, what needs me, what just finished" readable at a glance. Prefer information density over illustration. Do not build animated characters, mascots, desktop pets, or character companions — visual weight that does not carry state is noise, and character renderers depend on third-party runtimes and licensed model assets this project does not distribute.

## Start from the repository

1. Read `shared/floating-window.ts` completely. Current source wins if this Skill is stale.
2. Read `electron/floating/FloatingRendererRegistry.ts` for how definitions are discovered, validated, and bounded.
3. Decide the delivery target:
   - Put user implementations in the directory opened by **Settings → Layout → Floating renderer → Open folder**.
   - Put product-owned implementations in `resources/floating-renderers/<id>/` and register them as `builtin/<id>` in `FloatingRendererRegistry`.
4. Do not edit user preferences or silently select/enable a renderer unless the user explicitly authorizes it.
5. If the public contract changes, update the shared types, preload validation, IPC boundary, docs, this Skill, and targeted tests together.

## Renderer package

Create one self-contained directory:

```text
my-renderer/
├─ manifest.json
├─ index.html
├─ style.css
├─ app.js
└─ assets/
```

Use schema version 1:

```json
{
  "schemaVersion": 1,
  "id": "my-renderer",
  "name": "My Renderer",
  "version": "0.1.0",
  "entry": "index.html",
  "width": 320,
  "minHeight": 180,
  "maxHeight": 600
}
```

Keep `id` lowercase with letters, digits, dots, underscores, or hyphens. Keep all paths relative and every individual asset below 16 MiB.

## Use only the renderer bridge

The page receives only `window.ascFloating`:

```ts
interface FloatingRendererApi {
  getSnapshot(): Promise<FloatingRendererSnapshot>
  onSnapshot(callback: (snapshot: FloatingRendererSnapshot) => void): () => void
  resizeToContent(height: number): Promise<void>
  setShape(rects: Array<{ x: number; y: number; width: number; height: number }>): Promise<void>
  focusSession(sessionId: string): Promise<boolean>
  disable(): Promise<void>
}
```

Subscribe before the initial read so no update is lost:

```js
const unsubscribe = window.ascFloating.onSnapshot(render)
window.ascFloating.getSnapshot().then(render)
window.addEventListener('pagehide', unsubscribe, { once: true })
```

Never access Node.js, `require`, PTY APIs, workspace APIs, Electron IPC, the network, or another renderer's directory. Do not weaken `contextIsolation`, `sandbox`, CSP, navigation blocking, or permission denial to make an implementation work.

## Render authoritative state

Treat every callback as a full replacement snapshot. Do not merge it into an independent session state machine.

Select the current session from the already activity-sorted `snapshot.sessions`; use the first item unless the design explicitly renders several sessions. Read:

```ts
interface FloatingSession {
  sessionId: string
  adapterId: string
  name?: string
  status: 'working' | 'needs-you' | 'done' | 'error' | 'idle' | 'exited'
  statusConfidence: 'high' | 'low'
  observerHealth: 'unconfirmed' | 'healthy' | 'stale' | 'lifecycle-only'
  detail?: string
  pendingAttentionCount: number
  lastActivityAt: number
  lastSeq: number
  activeTurnId?: string
  activeToolCount: number
  lastTurnOutcome?: 'completed' | 'cancelled' | 'failed'
}
```

Use the real turn fields directly:

- `activeTurnId`: identity of the currently running turn.
- `activeToolCount`: concurrent tools currently running.
- `lastTurnOutcome`: terminal outcome of the latest turn.
- `lastSeq`: latest authoritative projection sequence; ignore locally cached older work.
- `attention.sequence`: one-shot transition signal for `needs-you`, `done`, or `error`.

Always show canonical status even when `attentionEffectEnabled` is false. Only suppress attention animation/sound-like visual emphasis. Never replay an old attention sequence after effects are re-enabled.

Recommended visual mapping:

| State | Persistent indicator | One-shot transition |
| --- | --- | --- |
| `idle` | dimmed dot and resting row | settle |
| `working` | active dot plus a running summary | brief highlight |
| `needs-you` | prominent dot plus an attention badge | brief pulse |
| `done` | neutral dot plus a completion summary | brief pop |
| `error` | error-toned dot plus the message | brief shake |

Prefer text, status dots, badges, compact lists, and small charts over artwork: every pixel should answer a question. Surface the session name, adapter, detail line, and relative activity time; truncate rather than overflow.

Restart a one-shot animation only when `status`, `lastSeq`, or `attention.sequence` advances. Use CSS/Web Animations; do not synthesize pointer events against a canvas.

## Size and coordinates

Author layout in the manifest's unscaled CSS pixels. Agent Session Center applies the user's 60%–160% scale uniformly to the native window, web-content zoom, and native shape.

- Call `resizeToContent()` with intrinsic, unscaled content height.
- Pass unscaled CSS-pixel rectangles to `setShape()`.
- Do not apply another user-scale transform in the renderer.
- Handle viewport resize and device pixel ratio for Canvas/WebGL sharpness.
- Keep content inside the manifest width and height bounds.

## Canvas, WebGL, and third-party runtimes

The sandbox permits Canvas, WebGL, and local assets, but Agent Session Center ships **no third-party runtime and no character model**. If a design needs one — a 2D skeletal runtime, a model file, a sample asset set — the user must supply and licence it themselves. Do not add such runtimes, models, or sample assets to this repository.

Load every asset from a relative same-origin URL; CDN and remote fetches are blocked. Pause or reduce work while `document.hidden`, honor `prefers-reduced-motion`, and release animation handles, listeners, textures, and WebGL resources on unload.

## Irregular transparent windows

Call `setShape()` with no more than 1024 rectangles. Derive them from stable alpha regions or use a conservative motion envelope, leaving room for border glow, badge overflow, and attention bursts.

Windows and Linux clip both pixels and pointer hit-testing outside the shape. macOS keeps transparent visual fallback behavior. Do not recompute or submit the shape on every animation frame.

## Interaction and accessibility

- Provide an obvious drag region with `-webkit-app-region: drag`.
- Mark buttons and other controls `-webkit-app-region: no-drag`.
- Keep controls keyboard accessible and labelled.
- Use `focusSession(sessionId)` to return to the real Agent Session Center session.
- Use `disable()` only for an explicit close action.
- Apply `snapshot.appearance` when the design should follow Agent Session Center's current theme.

## Validate and deliver

1. Validate manifest paths and JavaScript syntax.
2. Type-check Agent Session Center after changing TypeScript or the public bridge.
3. Build Agent Session Center when registering or packaging a built-in renderer.
4. Run targeted `e2e/floating-window.spec.ts` cases first. After a failure, rerun only the failed case until fixed; do not repeatedly run the full E2E suite.
5. Verify empty, working, needs-you, done, error, effect-disabled, and scale states.
6. Verify a remote fetch is blocked and an invalid user renderer falls back to `builtin/default`.
7. Launch the real development app after the checks and tell the user where to select the renderer.

Report changed files, targeted checks, any skipped full regression, and the renderer directory/ID. If the renderer depends on any third-party runtime or asset, report the licence obligation explicitly.
