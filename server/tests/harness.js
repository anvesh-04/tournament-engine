/**
 * Minimal zero-dependency test harness.
 * The project has no test framework installed and these tests must run with a
 * bare `node server/tests/<file>.js`, so this wraps node's own assert with
 * pass/fail reporting and a non-zero exit code on failure.
 *
 * Tests are queued rather than run inline so that async test bodies (bcrypt,
 * mongoose validation) are awaited in order instead of racing the report.
 */
const assert = require("assert");

const queue = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  queue.push({ kind: "test", name, fn });
}

function suite(title) {
  queue.push({ kind: "suite", title });
}

async function run() {
  for (const item of queue) {
    if (item.kind === "suite") {
      console.log(`\n${item.title}\n${"-".repeat(item.title.length)}`);
      continue;
    }
    try {
      await item.fn();
      passed++;
      console.log(`  PASS  ${item.name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${item.name}`);
      console.log(`        ${String(err.message).split("\n").join("\n        ")}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

/** Asserts that an async function rejects, optionally matching the message. */
async function rejects(fn, messageSubstring) {
  let threw = null;
  try {
    await fn();
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, "expected the call to throw, but it resolved");
  if (messageSubstring) {
    assert.ok(
      String(threw.message).includes(messageSubstring),
      `expected error message to include "${messageSubstring}", got "${threw.message}"`
    );
  }
  return threw;
}

module.exports = { test, suite, run, rejects, assert };
