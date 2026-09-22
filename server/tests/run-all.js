/**
 * Runs every test suite in this directory, each in its own process so that a
 * suite which sets environment variables or caches a module cannot influence
 * the next one. Exits non-zero if any suite fails.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

let failed = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit",
  });
  if (result.status !== 0) failed++;
}

console.log(`\n${"=".repeat(60)}`);
if (failed === 0) {
  console.log(`All ${files.length} suites passed.`);
} else {
  console.log(`${failed} of ${files.length} suites FAILED.`);
  process.exit(1);
}
