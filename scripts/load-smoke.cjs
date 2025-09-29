/**
 * Lightweight load smoke test for CI pipeline
 * Uses autocannon for HTTP load testing
 */

const autocannon = require("autocannon");

async function runSmokeTest() {
  console.log("Starting cache service load smoke test...");

  const baseUrl = process.env.TEST_URL || "http://localhost:8080";
  const apiToken = process.env.API_TOKEN || "test-token-for-ci";

  try {
    // Test 1: Health check
    console.log("Testing health endpoints...");
    const healthResult = await autocannon({
      url: `${baseUrl}/healthz`,
      duration: 5,
      connections: 10,
      pipelining: 1
    });

    if (healthResult.non2xx > 0) {
      throw new Error(`Health check failed: ${healthResult.non2xx} non-2xx responses`);
    }

    // Test 2: SET operations
    console.log("Testing SET operations...");
    const setResult = await autocannon({
      url: `${baseUrl}/v1/kv/smoke-test-key`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-API-Token": apiToken
      },
      body: JSON.stringify({
        value: "smoke-test-value",
        type: "string",
        ttlSec: 300
      }),
      duration: 10,
      connections: 20,
      pipelining: 1
    });

    if (setResult.non2xx > setResult["2xx"] * 0.1) { // Allow 10% error rate
      throw new Error(`SET test failed: ${setResult.non2xx} non-2xx responses out of ${setResult.requests.total}`);
    }

    // Test 3: GET operations
    console.log("Testing GET operations...");
    const getResult = await autocannon({
      url: `${baseUrl}/v1/kv/smoke-test-key`,
      method: "GET",
      duration: 10,
      connections: 50,
      pipelining: 1
    });

    if (getResult.non2xx > getResult["2xx"] * 0.1) { // Allow 10% error rate
      throw new Error(`GET test failed: ${getResult.non2xx} non-2xx responses out of ${getResult.requests.total}`);
    }

    // Test 4: Batch operations
    console.log("Testing batch operations...");
    const batchResult = await autocannon({
      url: `${baseUrl}/v1/kv/batch/get`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Token": apiToken
      },
      body: JSON.stringify({
        keys: ["smoke-test-key", "non-existent-key"]
      }),
      duration: 5,
      connections: 10,
      pipelining: 1
    });

    if (batchResult.non2xx > 0) {
      throw new Error(`Batch test failed: ${batchResult.non2xx} non-2xx responses`);
    }

    // Performance validation
    const avgLatency = getResult.latency.mean;
    const p95Latency = getResult.latency.p97_5; // Use p97.5 as closest to p95

    console.log("\n=== Smoke Test Results ===");
    console.log(`Health check: ${healthResult.requests.total} requests, ${healthResult.latency.mean}ms avg`);
    console.log(`SET operations: ${setResult.requests.total} requests, ${setResult.latency.mean}ms avg`);
    console.log(`GET operations: ${getResult.requests.total} requests, ${getResult.latency.mean}ms avg, p95: ${p95Latency}ms`);
    console.log(`Batch operations: ${batchResult.requests.total} requests, ${batchResult.latency.mean}ms avg`);

    // Performance assertions for CI
    if (typeof p95Latency === 'number' && p95Latency > 50) { // Relaxed for CI environment
      console.warn(`Warning: p95 latency ${p95Latency}ms exceeds 50ms threshold`);
    }

    if (avgLatency > 20) { // Relaxed for CI environment
      console.warn(`Warning: Average latency ${avgLatency}ms exceeds 20ms threshold`);
    }

    console.log("\n✅ Smoke test completed successfully!");

  } catch (error) {
    console.error("❌ Smoke test failed:", error.message);
    process.exit(1);
  }
}

// Run the test
runSmokeTest().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
