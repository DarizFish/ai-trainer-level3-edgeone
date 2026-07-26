import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "https://www.aitrainer3.xyz/");
const configuredWaitMs = Number.parseInt(process.env.SMOKE_WAIT_MS ?? "0", 10);
const deploymentWaitMs = Number.isFinite(configuredWaitMs)
  ? Math.min(Math.max(configuredWaitMs, 0), 600_000)
  : 0;
const requestTimeoutMs = 30_000;
const manifestPath = "/labs/manifest.json";
const manifestLocal = "../public/labs/manifest.json";

const assets = [
  {
    path: "/lite/static/pyodide/pyodide.esm.js",
    local: "../public/lite/static/pyodide/pyodide.esm.js",
    mime: /^(?:application|text)\/javascript/i,
  },
  {
    path: "/lite/static/pyodide/pyodide.asm.js",
    local: "../public/lite/static/pyodide/pyodide.asm.js",
    mime: /^(?:application|text)\/javascript/i,
  },
  {
    path: "/labs/runtime/onnxruntime-web/1.27.0/ort.wasm.bundle.min.js",
    local: "../public/labs/runtime/onnxruntime-web/1.27.0/ort.wasm.bundle.min.js",
    mime: /^(?:application|text)\/javascript/i,
  },
  {
    path: "/labs/runtime/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.js",
    local: "../public/labs/runtime/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.js",
    mime: /^(?:application|text)\/javascript/i,
  },
  {
    path: "/labs/runtime/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.wasm",
    local: "../public/labs/runtime/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.wasm",
    mime: /^application\/wasm/i,
  },
];

function sha256(payload) {
  return createHash("sha256").update(payload).digest("hex");
}

function remoteUrl(path, cacheKey = "") {
  const url = new URL(path, baseUrl);
  if (cacheKey) url.searchParams.set("smoke", cacheKey);
  return url;
}

async function fetchRemote(path, cacheKey = "") {
  return fetch(remoteUrl(path, cacheKey), {
    cache: "no-store",
    headers: { "user-agent": "ai-trainer-production-smoke/1.0" },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

async function fetchWithTransientRetry(path, options = {}) {
  const attempts = options.attempts ?? 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(remoteUrl(path), {
        cache: "no-store",
        headers: { "user-agent": "ai-trainer-production-smoke/1.0" },
        redirect: options.redirect,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (response.status < 500 || attempt === attempts) return response;
      await response.arrayBuffer();
      lastError = new Error(`${path} returned transient HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await delay(attempt * 1_500);
  }

  throw lastError ?? new Error(`${path} failed without a response`);
}

async function fetchAssetWithTransientRetry(path, cacheKey) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchRemote(path, cacheKey);
      const payload = Buffer.from(await response.arrayBuffer());
      if (response.status < 500 || attempt === 3) return { response, payload };
      lastError = new Error(`${path} returned transient HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    }
    await delay(attempt * 1_500);
  }
  throw lastError ?? new Error(`${path} failed without a response`);
}

let deploymentPromise;
async function waitForExpectedDeployment() {
  if (deploymentPromise) return deploymentPromise;
  deploymentPromise = (async () => {
    const expectedHash = sha256(await readFile(new URL(manifestLocal, import.meta.url)));
    const deadline = Date.now() + deploymentWaitMs;
    let lastResult = "not requested";

    do {
      try {
        const response = await fetchRemote(manifestPath, expectedHash.slice(0, 12));
        const payload = Buffer.from(await response.arrayBuffer());
        const actualHash = sha256(payload);
        lastResult = `${response.status} ${response.headers.get("content-type") ?? ""} sha256=${actualHash}`;
        if (response.ok && actualHash === expectedHash) return;
      } catch (error) {
        lastResult = error instanceof Error ? error.message : String(error);
      }
      if (Date.now() >= deadline) break;
      await delay(Math.min(15_000, Math.max(deadline - Date.now(), 0)));
    } while (Date.now() <= deadline);

    throw new Error(`Production did not reach the checked-out runtime within ${deploymentWaitMs}ms: ${lastResult}`);
  })();
  return deploymentPromise;
}

test("production serves the checked-out runtime bytes with executable MIME types", {
  timeout: deploymentWaitMs + requestTimeoutMs * 2,
}, async () => {
  await waitForExpectedDeployment();

  for (const asset of assets) {
    const localPayload = await readFile(new URL(asset.local, import.meta.url));
    const expectedHash = sha256(localPayload);
    const response = await fetchRemote(asset.path, expectedHash.slice(0, 12));
    const remotePayload = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200, `${asset.path} must return 200`);
    assert.match(response.headers.get("content-type") ?? "", asset.mime, `${asset.path} has an invalid MIME type`);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(sha256(remotePayload), expectedHash, `${asset.path} differs from the deployed commit`);
  }
});

test("production serves every practical lab asset exactly as declared", {
  timeout: deploymentWaitMs + 180_000,
}, async () => {
  await waitForExpectedDeployment();

  const manifest = JSON.parse(await readFile(new URL(manifestLocal, import.meta.url), "utf8"));
  const declaredAssets = [...new Map(
    Object.values(manifest.tasks)
      .flatMap(task => task.assets ?? [])
      .map(asset => [asset.url, asset]),
  ).values()];

  for (let offset = 0; offset < declaredAssets.length; offset += 4) {
    const batch = declaredAssets.slice(offset, offset + 4);
    const responses = await Promise.all(batch.map(async asset => {
      const result = await fetchAssetWithTransientRetry(asset.url, asset.sha256.slice(0, 12));
      return { asset, ...result };
    }));
    for (const { asset, response, payload } of responses) {
      assert.equal(response.status, 200, `${asset.url} must return 200`);
      assert.equal(payload.length, asset.size, `${asset.url} has an unexpected byte length`);
      assert.equal(sha256(payload), asset.sha256, `${asset.url} differs from the lab manifest`);
    }
  }
});

test("production public routes and anonymous redirect stay healthy", {
  timeout: deploymentWaitMs + requestTimeoutMs * 2,
}, async () => {
  await waitForExpectedDeployment();

  for (const path of ["/", "/theory", "/theory/mock", "/practical", "/resources"]) {
    const response = await fetchWithTransientRetry(path);
    const body = await response.text();
    assert.equal(response.status, 200, `${path} must return 200`);
    assert.match(body, /人工智能训练师三级/, `${path} returned an unexpected document`);
  }

  const practicalMock = await fetchWithTransientRetry("/practical/mock", { redirect: "manual" });
  if ([302, 303, 307, 308].includes(practicalMock.status)) {
    assert.equal(practicalMock.headers.get("location"), "/practical");
  } else {
    const practicalMockBody = await practicalMock.text();
    assert.equal(practicalMock.status, 200, "/practical/mock should redirect or return EdgeOne's redirect document");
    assert.match(practicalMockBody, /id="__next-page-redirect"/);
    assert.match(practicalMockBody, /url=\/practical/);
    assert.match(practicalMockBody, /NEXT_REDIRECT;replace;\/practical;307;/);
  }

  const progress = await fetchWithTransientRetry("/progress", { redirect: "manual" });
  if ([302, 303, 307, 308].includes(progress.status)) {
    assert.match(progress.headers.get("location") ?? "", /\/account\?mode=login/);
  } else {
    const progressBody = await progress.text();
    assert.equal(progress.status, 200, "/progress should redirect or return EdgeOne's redirect document");
    assert.match(progressBody, /id="__next-page-redirect"/);
    assert.match(progressBody, /url=\/account\?mode=login(?:&amp;|&)return_to=%2Fprogress/);
    assert.match(progressBody, /NEXT_REDIRECT;replace;\/account\?mode=login/);
  }
});

test("production JupyterLite configuration points to the cache-busted JS runtime", {
  timeout: deploymentWaitMs + requestTimeoutMs * 2,
}, async () => {
  await waitForExpectedDeployment();

  const lab = await fetchRemote("/lite/lab/index.html?ui=20260724-runtime9");
  const labHtml = await lab.text();
  assert.equal(lab.status, 200);
  assert.match(labHtml, /config-utils\.js\?_=20260724-runtime9/);

  const config = await fetchRemote("/lite/config-utils.js?_=20260724-runtime9");
  const configSource = await config.text();
  assert.equal(config.status, 200);
  assert.match(configSource, /\/lite\/static\/pyodide\/pyodide\.esm\.js/);
  assert.doesNotMatch(configSource, /new URL\(pyodideSettings\.pyodideUrl/);
});
