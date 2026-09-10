import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.argv[2];
const port = Number(process.argv[3] ?? 9342);
const { skinStatus } = await import(pathToFileURL(join(root, "src", "injector.mjs")).href);
console.log(JSON.stringify(await skinStatus({ port, product: "workbuddy" }), null, 2));
