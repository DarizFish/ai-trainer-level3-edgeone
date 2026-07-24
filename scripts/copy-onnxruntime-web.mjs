import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = "1.27.0";
const sourceDir = join(root, "node_modules", "onnxruntime-web", "dist");
const outputDir = join(root, "public", "labs", "runtime", "onnxruntime-web", version);
const files = [
  {
    source: "ort.wasm.bundle.min.mjs",
    output: "ort.wasm.bundle.min.js",
    sha256: "1db5e1c5cd2b860eed85e6eeff23e2aaa7cffcc407f67093bcc888f631b94ba9",
    replacements: [["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.js"]],
  },
  {
    source: "ort-wasm-simd-threaded.mjs",
    output: "ort-wasm-simd-threaded.js",
    sha256: "0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3",
  },
  {
    source: "ort-wasm-simd-threaded.wasm",
    output: "ort-wasm-simd-threaded.wasm",
    sha256: "d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6",
  },
];

const packageJson = JSON.parse(
  await readFile(join(root, "node_modules", "onnxruntime-web", "package.json"), "utf8"),
);
if (packageJson.version !== version) {
  throw new Error(`Expected onnxruntime-web ${version}, found ${packageJson.version}`);
}

await mkdir(outputDir, { recursive: true });
for (const file of files) {
  const source = join(sourceDir, file.source);
  let payload = await readFile(source);
  const actualHash = createHash("sha256").update(payload).digest("hex");
  if (actualHash !== file.sha256) {
    throw new Error(`${file.source} does not match onnxruntime-web ${version}: ${actualHash}`);
  }
  if (file.replacements) {
    let sourceText = payload.toString("utf8");
    for (const [from, to] of file.replacements) {
      sourceText = sourceText.replaceAll(from, to);
    }
    payload = Buffer.from(sourceText);
  }
  await writeFile(join(outputDir, file.output), payload);
}

console.log(`Copied verified onnxruntime-web ${version} WASM runtime (${files.length} files).`);
