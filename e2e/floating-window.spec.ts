import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchApp, openSettings } from "./helpers";

interface FloatingInspect {
  state: {
    enabled: boolean;
    selectedRendererId: string;
    activeRendererId: string | null;
    activeError: string | null;
    attentionEffectEnabled: boolean;
    scale: number;
  };
  window: {
    bounds: { width: number; height: number };
    shapeRectCount: number;
    preferences: {
      contextIsolation: boolean;
      nodeIntegration: boolean;
      sandbox: boolean;
      webSecurity: boolean;
    };
    url: string;
  } | null;
}

function inspectFloating(app: ElectronApplication): Promise<FloatingInspect> {
  return app.evaluate(() =>
    (
      globalThis as unknown as {
        __ascMainDebug: { floatingWindowInspect(): FloatingInspect };
      }
    ).__ascMainDebug.floatingWindowInspect(),
  );
}

async function floatingPage(
  app: ElectronApplication,
  matches: (url: string) => boolean,
): Promise<Page> {
  await expect
    .poll(() => app.windows().some((candidate) => matches(candidate.url())), {
      timeout: 15_000,
    })
    .toBe(true);
  const page = app.windows().find((candidate) => matches(candidate.url()));
  if (!page) throw new Error("floating page disappeared");
  return page;
}

function projection(
  status: "working" | "needs-you" | "done" | "error",
  lastSeq: number,
) {
  return {
    sessionId: "floating-fixture",
    terminalId: "terminal-floating-fixture",
    adapterId: "fixture",
    name: "Floating fixture",
    status,
    statusConfidence: "high",
    observerHealth: "healthy",
    detail: status,
    pendingAttentionCount: status === "needs-you" ? 1 : 0,
    activeTurnId: `turn-${lastSeq}`,
    activeToolCount: status === "working" ? 1 : 0,
    correlation: {
      lastTurnOutcome:
        status === "done" ? "completed" : status === "error" ? "failed" : undefined,
    },
    lastActivityAt: Date.now(),
    lastSeq,
  };
}

async function publish(
  app: ElectronApplication,
  value: ReturnType<typeof projection>,
): Promise<void> {
  await app.evaluate((_electron, payload) => {
    (
      globalThis as unknown as {
        __ascMainDebug: {
          floatingWindowPublishProjection(projection: unknown): boolean;
        };
      }
    ).__ascMainDebug.floatingWindowPublishProjection(payload);
  }, value);
}

test("built-in renderer uses the sandbox API and surfaces attention transitions", async () => {
  const { app, window } = await launchApp({ createDefaultTerminal: false });
  try {
    await window.evaluate(() => window.floatingWindowApi.setEnabled(true));
    const floating = await floatingPage(
      app,
      (url) => new URL(url).searchParams.get("surface") === "floating",
    );
    await expect(floating.getByTestId("floating-window")).toBeVisible();

    const inspect = await inspectFloating(app);
    expect(inspect.state.activeRendererId).toBe("builtin/default");
    expect(inspect.window?.preferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
    expect(
      await floating.evaluate(() => ({
        rendererApi: typeof window.ascFloating,
        broadAgentApi: typeof window.agentApi,
        ptyApi: typeof window.ptyApi,
        nodeRequire: typeof (globalThis as Record<string, unknown>)["require"],
      })),
    ).toEqual({
      rendererApi: "object",
      broadAgentApi: "undefined",
      ptyApi: "undefined",
      nodeRequire: "undefined",
    });

    await publish(app, projection("working", 1));
    await publish(app, projection("needs-you", 2));
    await expect(floating.getByTestId("floating-window")).toHaveAttribute(
      "data-attention",
      "persistent",
    );

    await publish(app, projection("working", 3));
    await publish(app, projection("done", 4));
    await expect(floating.getByTestId("floating-window")).toHaveAttribute(
      "data-attention",
      "complete",
    );

    await window.evaluate(() =>
      window.floatingWindowApi.setAttentionEffectEnabled(false),
    );
    await publish(app, projection("error", 5));
    await expect(floating.getByTestId("floating-window")).toHaveAttribute(
      "data-attention",
      "none",
    );
  } finally {
    await app.close().catch(() => {});
  }
});

test("floating renderer size is persisted and uniformly applied", async () => {
  const { app, window } = await launchApp({ createDefaultTerminal: false });
  try {
    await window.evaluate(async () => {
      await window.floatingWindowApi.setEnabled(true);
      await window.floatingWindowApi.setScale(0.75);
    });
    await expect
      .poll(async () => (await inspectFloating(app)).window?.bounds)
      .toMatchObject({ width: 186 });
    expect((await inspectFloating(app)).state.scale).toBe(0.75);

    await window.evaluate(() => window.floatingWindowApi.setScale(1.4));
    await expect
      .poll(async () => (await inspectFloating(app)).window?.bounds)
      .toMatchObject({ width: 347 });
    expect((await inspectFloating(app)).state.scale).toBe(1.4);
  } finally {
    await app.close().catch(() => {});
  }
});

test("user renderer hot reloads in the same sandbox and falls back when invalid", async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), "asc-floating-e2e-"));
  const rendererDir = join(userDataDir, "floating-renderers", "sample");
  const modelDir = join(rendererDir, "models");
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(
    join(modelDir, "fixture.model3.json"),
    JSON.stringify({ name: "fixture-model" }),
  );
  writeFileSync(join(modelDir, "fixture.moc3"), new Uint8Array([1, 2, 3, 4]));
  writeFileSync(
    join(modelDir, "fixture.wasm"),
    new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
  );
  writeFileSync(
    join(rendererDir, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "sample",
      name: "Sample renderer",
      entry: "index.html",
    }),
  );
  const writeRenderer = (label: string): void => {
    writeFileSync(
      join(rendererDir, "index.html"),
      `<!doctype html><meta charset="utf-8"><body>${label}<output id="sandbox"></output><output id="local-asset">loading</output><output id="binary-asset">loading</output><output id="wasm-asset">loading</output><output id="remote-asset">loading</output><script>document.querySelector('#sandbox').textContent=[typeof window.ascFloating,typeof window.ptyApi,typeof require].join('|');fetch('./models/fixture.model3.json').then((response)=>response.json()).then((model)=>document.querySelector('#local-asset').textContent=model.name).catch(()=>document.querySelector('#local-asset').textContent='blocked');fetch('./models/fixture.moc3').then(async(response)=>document.querySelector('#binary-asset').textContent=response.headers.get('content-type')+':'+(await response.arrayBuffer()).byteLength).catch(()=>document.querySelector('#binary-asset').textContent='blocked');WebAssembly.instantiateStreaming(fetch('./models/fixture.wasm')).then(()=>document.querySelector('#wasm-asset').textContent='ready').catch(()=>document.querySelector('#wasm-asset').textContent='blocked');fetch('https://example.com/live2d.model3.json').then(()=>document.querySelector('#remote-asset').textContent='allowed').catch(()=>document.querySelector('#remote-asset').textContent='blocked')</script>`,
    );
  };
  writeRenderer("custom-v1");

  const { app, window } = await launchApp({
    userDataDir,
    createDefaultTerminal: false,
  });
  try {
    await window.evaluate(async () => {
      await window.floatingWindowApi.refreshRenderers();
      await window.floatingWindowApi.setRenderer("user/sample");
      await window.floatingWindowApi.setEnabled(true);
    });
    let custom = await floatingPage(app, (url) =>
      url.startsWith("asc-floating://sample/"),
    );
    await expect(custom.locator("body")).toContainText("custom-v1");
    await expect(custom.locator("#sandbox")).toHaveText(
      "object|undefined|undefined",
    );
    await expect(custom.locator("#local-asset")).toHaveText("fixture-model");
    await expect(custom.locator("#binary-asset")).toHaveText(
      "application/octet-stream:4",
    );
    await expect(custom.locator("#wasm-asset")).toHaveText("ready");
    await expect(custom.locator("#remote-asset")).toHaveText("blocked");

    writeRenderer("custom-v2");
    await expect
      .poll(
        async () => {
          const current = app
            .windows()
            .find((candidate) =>
              candidate.url().startsWith("asc-floating://sample/"),
            );
          return current
            ? current
                .locator("body")
                .textContent()
                .catch(() => "")
            : "";
        },
        { timeout: 15_000 },
      )
      .toContain("custom-v2");
    custom = await floatingPage(app, (url) =>
      url.startsWith("asc-floating://sample/"),
    );
    await expect(custom.locator("#sandbox")).toHaveText(
      "object|undefined|undefined",
    );
    await expect(custom.locator("#local-asset")).toHaveText("fixture-model");

    writeFileSync(join(rendererDir, "manifest.json"), "{ broken json");
    await expect
      .poll(async () => (await inspectFloating(app)).state.activeRendererId, {
        timeout: 15_000,
      })
      .toBe("builtin/default");
    const fallback = await inspectFloating(app);
    expect(fallback.state.selectedRendererId).toBe("user/sample");
    expect(fallback.state.activeError).toContain("已回退");
  } finally {
    await app.close().catch(() => {});
  }
});

test("settings copies the built-in renderer creation Skill without exposing its body", async () => {
  const { app, window } = await launchApp({ createDefaultTerminal: false });
  try {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("clipboard:write-text");
      ipcMain.handle("clipboard:write-text", (_event, text: unknown) => {
        (globalThis as Record<string, unknown>)["__ascCopiedSkill"] = text;
      });
    });

    await openSettings(window, "layout");
    const settings = window.getByTestId("settings-page");
    const copy = window.getByTestId("settings-floating-renderer-copy-skill");
    await expect(settings).toBeVisible();
    await expect(copy).toBeVisible();
    await expect(settings).not.toContainText("interface FloatingRendererApi");
    if (process.env["ASC_CAPTURE_FLOATING_SETTINGS"]) {
      const captureDir = resolve(__dirname, "../.dev-shots");
      mkdirSync(captureDir, { recursive: true });
      await settings.screenshot({
        path: join(captureDir, "floating-renderer-settings.png"),
      });
    }

    await copy.click();
    const copied = await app.evaluate(() =>
      String(
        (globalThis as Record<string, unknown>)["__ascCopiedSkill"] ?? "",
      ),
    );
    expect(copied).toContain("name: create-asc-floating-renderer");
    expect(copied).toContain("## Render authoritative state");
    expect(copied).toContain("activeTurnId");
    expect(copied).toContain("60%–160%");
    expect(copied).toContain("do not synthesize pointer events");
    await expect(copy).toContainText(/已复制|Copied|コピー済み|복사됨|已複製/);
  } finally {
    await app.close().catch(() => {});
  }
});
