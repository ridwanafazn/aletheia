import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildOpenApiDocument } from "./openapi.js";

const target = fileURLToPath(new URL("../openapi.json", import.meta.url));
const document = buildOpenApiDocument();

writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`OpenAPI document written to ${target}`);
