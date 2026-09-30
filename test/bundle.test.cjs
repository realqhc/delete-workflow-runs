const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const run = (id, ageDays, hour = 12, extra = {}) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - ageDays);
  date.setUTCHours(hour, 0, 0, 0);
  return {
    id,
    workflow_id: 10,
    status: "completed",
    conclusion: "success",
    created_at: date.toISOString(),
    ...extra,
  };
};
function check(runs, inputs, expected, orphans = []) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("INPUT_")),
  );
  Object.assign(
    env,
    {
      INPUT_TOKEN: "mock-token",
      INPUT_REPOSITORY: "example/test",
      INPUT_BASEURL: "https://api.github.com",
      INPUT_DRY_RUN: "true",
      INPUT_USE_DAILY_RETENTION: "false",
      INPUT_CHECK_BRANCH_EXISTENCE: "false",
      INPUT_CHECK_PULLREQUEST_EXIST: "false",
      INPUT_RETAIN_DAYS: "0",
      INPUT_KEEP_MINIMUM_RUNS: "6",
      MOCK_FIXTURE: JSON.stringify({ runs, orphans }),
    },
    inputs,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--require",
      path.join(__dirname, "mock-api.cjs"),
      path.join(__dirname, "../dist/index.js"),
    ],
    { env, encoding: "utf8", timeout: 15000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const ids = [...result.stdout.matchAll(/Simulate deletion: Run (\d+)/g)]
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
  assert.deepEqual(
    ids,
    [...expected].sort((a, b) => a - b),
    result.stdout,
  );
}
test("OpenWrt configuration retains latest six completed runs regardless of API order", () => {
  const runs = Array.from({ length: 8 }, (_, i) => run(i + 1, 20 - i));
  check(
    [
      runs[5],
      runs[0],
      runs[7],
      runs[2],
      runs[6],
      runs[1],
      runs[4],
      runs[3],
      run(99, 30, 12, { status: "in_progress" }),
    ],
    {},
    [1, 2],
  );
});
test("fewer than six eligible runs are all retained", () =>
  check([run(1, 10), run(2, 9)], {}, []));
test("age filter preserves recent runs and latest eligible runs", () =>
  check(
    [run(1, 20), run(2, 19), run(3, 18), run(4, 1)],
    { INPUT_RETAIN_DAYS: "7", INPUT_KEEP_MINIMUM_RUNS: "2" },
    [1],
  ));
test("daily retention deletes expired runs and keeps newest two per recent day", () =>
  check(
    [
      run(1, 10),
      run(2, 2, 8),
      run(3, 2, 9),
      run(4, 2, 10),
      run(5, 1, 8),
      run(6, 1, 9),
      run(7, 1, 10),
    ],
    {
      INPUT_USE_DAILY_RETENTION: "true",
      INPUT_RETAIN_DAYS: "7",
      INPUT_KEEP_MINIMUM_RUNS: "2",
    },
    [1, 2, 5],
  ));
test("dry-run reports orphan candidates without deleting them", () =>
  check([], {}, [50], [run(50, 20, 12, { workflow_id: 999 })]));
