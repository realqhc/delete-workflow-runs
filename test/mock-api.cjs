const assert = require("node:assert/strict");
const fixture = JSON.parse(process.env.MOCK_FIXTURE);
const seen = [];
global.fetch = async (input, options = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const method = options.method || input.method || "GET";
  assert.equal(method, "GET", "Dry-run must never send a mutating request");
  const path = new URL(url).pathname;
  seen.push(path);
  let body;
  if (path.endsWith("/actions/workflows"))
    body = {
      total_count: 1,
      workflows: [
        {
          id: 10,
          name: "Build",
          path: ".github/workflows/build.yml",
          state: "active",
        },
      ],
    };
  else if (path.endsWith("/actions/runs"))
    body = {
      total_count: fixture.orphans.length,
      workflow_runs: fixture.orphans,
    };
  else if (path.endsWith("/actions/workflows/10/runs"))
    body = { total_count: fixture.runs.length, workflow_runs: fixture.runs };
  else throw new Error(`Unexpected request: ${path}`);
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
};
process.on("exit", () =>
  assert.equal(
    seen.length,
    3,
    "All workflow enumeration requests should complete",
  ),
);
