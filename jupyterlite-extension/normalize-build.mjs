import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.join(directory, "labextension", "package.json");
const staticDirectory = path.join(directory, "labextension", "static");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (packageJson.jupyterlab?._build?.load) {
  packageJson.jupyterlab._build.load = packageJson.jupyterlab._build.load.replaceAll("\\", "/");
}
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

for (const name of fs.readdirSync(staticDirectory)) {
  const filePath = path.join(staticDirectory, name);
  if (name.endsWith(".map")) {
    fs.rmSync(filePath);
    continue;
  }
  if (name.endsWith(".js")) {
    const source = fs.readFileSync(filePath, "utf8").replace(/\n?\/\/# sourceMappingURL=.*$/u, "");
    fs.writeFileSync(filePath, source);
  }
}
