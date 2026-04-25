#!/usr/bin/env node

/**
 * Generate TypeScript types for the Obsidian plugin from the OpenAPI schema.
 * Uses the same openapi-typescript package as the frontend.
 *
 * Usage: node scripts/generate-plugin-types.mjs
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const openapiJson = resolve(root, "docs/openapi.json");
const outputDir = resolve(root, "plugin/src/types");
const outputFile = resolve(outputDir, "api.generated.ts");

if (!existsSync(openapiJson)) {
  console.error(`ERROR: ${openapiJson} not found. Run 'make gen-openapi' first.`);
  process.exit(1);
}

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

console.log(`Generating plugin types from ${openapiJson}...`);

try {
  // Use the frontend's openapi-typescript (installed in frontend/node_modules)
  const npxCmd = `npx openapi-typescript "${openapiJson}" -o "${outputFile}"`;
  execSync(npxCmd, { cwd: resolve(root, "frontend"), stdio: "inherit" });
  console.log(`Plugin types written to ${outputFile}`);
} catch (err) {
  console.error("Failed to generate plugin types:", err);
  process.exit(1);
}
