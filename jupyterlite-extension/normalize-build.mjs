import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.join(directory, "labextension", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (packageJson.jupyterlab?._build?.load) {
  packageJson.jupyterlab._build.load = packageJson.jupyterlab._build.load.replaceAll("\\", "/");
}
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
