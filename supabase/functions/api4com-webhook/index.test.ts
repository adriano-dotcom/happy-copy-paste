import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const webhookUrl = `${SUPABASE_URL}/functions/v1/api4com-webhook`;

// Test 1: Health check endpoint (GET) should always return 200
Deno.test("api4com-webhook - health check returns 200", async () => {
  const response = await fetch(webhookUrl, {
    method: "GET",
  });
  
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.status, "ok");
  assertEquals(body.service, "api4com-webhook");
});

// Test 2: POST without API key should return 401 Unauthorized
Deno.test("api4com-webhook - rejects request without API key (401)", async () => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "test", id: "test-123" }),
  });
  
  // Should be 401 (no key) or 503 (key not configured on server)
  // Both indicate the webhook is properly protecting itself
  const validStatuses = [401, 503];
  assertEquals(
    validStatuses.includes(response.status),
    true,
    `Expected 401 or 503, got ${response.status}`
  );
  
  const body = await response.json();
  // Either "Unauthorized" or "Service Unavailable"
  assertNotEquals(body.error, undefined);
  await response.text().catch(() => {}); // Consume remaining body
});

// Test 3: POST with invalid API key should return 401
Deno.test("api4com-webhook - rejects request with invalid API key (401)", async () => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "X-Api4com-Key": "invalid-key-that-should-not-work",
    },
    body: JSON.stringify({ 
      event: "channel-hangup",
      id: "test-invalid-key-123",
      destination: "5511999999999",
    }),
  });
  
  // Should be 401 (invalid key) or 503 (key not configured on server)
  const validStatuses = [401, 503];
  assertEquals(
    validStatuses.includes(response.status),
    true,
    `Expected 401 or 503, got ${response.status}`
  );
  await response.text().catch(() => {}); // Consume body
});

// Test 4: POST with valid API key should return 200
// This test requires API4COM_WEBHOOK_KEY to be set in environment
Deno.test("api4com-webhook - accepts request with valid API key (200)", async () => {
  const webhookKey = Deno.env.get("API4COM_WEBHOOK_KEY");
  
  if (!webhookKey) {
    console.log("⚠️  Skipping test: API4COM_WEBHOOK_KEY not set in environment");
    return;
  }
  
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "X-Api4com-Key": webhookKey,
    },
    body: JSON.stringify({ 
      event: "channel-hangup",
      id: "test-valid-key-" + Date.now(),
      destination: "5511999999999",
      duration: 0,
      cause: "test_hangup",
    }),
  });
  
  // Should return 200 even if call not found (logged as ignored)
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.success, true);
  await response.text().catch(() => {}); // Consume body
});

// Test 5: Verify CORS headers are present
Deno.test("api4com-webhook - OPTIONS returns CORS headers", async () => {
  const response = await fetch(webhookUrl, {
    method: "OPTIONS",
  });
  
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  await response.text().catch(() => {}); // Consume body
});

// Test 6: POST with alternative header name (x-api-key)
Deno.test("api4com-webhook - accepts x-api-key header alternative", async () => {
  const webhookKey = Deno.env.get("API4COM_WEBHOOK_KEY");
  
  if (!webhookKey) {
    console.log("⚠️  Skipping test: API4COM_WEBHOOK_KEY not set in environment");
    return;
  }
  
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-api-key": webhookKey, // lowercase alternative
    },
    body: JSON.stringify({ 
      event: "channel-answered",
      id: "test-alt-header-" + Date.now(),
      destination: "5511888888888",
    }),
  });
  
  assertEquals(response.status, 200);
  await response.text().catch(() => {}); // Consume body
});

// Test 7: POST with Bearer token authentication
Deno.test("api4com-webhook - accepts Bearer token authentication", async () => {
  const webhookKey = Deno.env.get("API4COM_WEBHOOK_KEY");
  
  if (!webhookKey) {
    console.log("⚠️  Skipping test: API4COM_WEBHOOK_KEY not set in environment");
    return;
  }
  
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${webhookKey}`,
    },
    body: JSON.stringify({ 
      event: "channel-ringing",
      id: "test-bearer-" + Date.now(),
      destination: "5511777777777",
    }),
  });
  
  assertEquals(response.status, 200);
  await response.text().catch(() => {}); // Consume body
});
