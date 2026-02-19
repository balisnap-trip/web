const baseUrl = process.env.CORE_API_BASE_URL || "http://localhost:4000";
const adminToken = process.env.CORE_API_ADMIN_TOKEN || "dev-admin-token";
const expectAuthEnforced = readBoolean(process.env.EXPECT_ADMIN_AUTH_ENFORCED, true);

function readBoolean(rawValue, fallback) {
  if (rawValue === undefined) {
    return fallback;
  }
  const normalized = rawValue.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = {
      raw: text
    };
  }
  return {
    status: response.status,
    json
  };
}

function assertStatus(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. expected=${expected} actual=${actual}`);
  }
}

async function run() {
  const noAuthList = await requestJson("/v1/channel-mappings");
  if (expectAuthEnforced) {
    assertStatus(noAuthList.status, 401, "No-auth channel mappings read must be unauthorized");
  }

  const badTokenList = await requestJson("/v1/channel-mappings", {
    headers: {
      authorization: "Bearer invalid-token",
      "x-admin-role": "ADMIN"
    }
  });
  if (expectAuthEnforced) {
    assertStatus(badTokenList.status, 401, "Invalid token must be unauthorized");
  }

  const staffHeaders = {
    authorization: `Bearer ${adminToken}`,
    "x-admin-role": "STAFF",
    "content-type": "application/json"
  };
  const managerHeaders = {
    authorization: `Bearer ${adminToken}`,
    "x-admin-role": "MANAGER",
    "content-type": "application/json"
  };

  const staffList = await requestJson("/v1/channel-mappings", {
    headers: staffHeaders
  });
  assertStatus(staffList.status, 200, "Staff read for channel mappings failed");

  const staffCreate = await requestJson("/v1/channel-mappings", {
    method: "POST",
    headers: staffHeaders,
    body: JSON.stringify({
      entityType: "BOOKING",
      channelCode: "DIRECT",
      externalRefKind: "BOOKING_REF",
      externalRef: `AUTH-SMOKE-${Date.now()}`,
      entityKey: "book_demo_001",
      mappingStatus: "REVIEW_REQUIRED"
    })
  });
  if (expectAuthEnforced) {
    assertStatus(staffCreate.status, 403, "Staff write should be forbidden for channel mappings");
  }

  const managerCreate = await requestJson("/v1/channel-mappings", {
    method: "POST",
    headers: managerHeaders,
    body: JSON.stringify({
      entityType: "BOOKING",
      channelCode: "DIRECT",
      externalRefKind: "BOOKING_REF",
      externalRef: `AUTH-SMOKE-${Date.now()}-MANAGER`,
      entityKey: "book_demo_001",
      mappingStatus: "MAPPED"
    })
  });
  assertStatus(managerCreate.status, 200, "Manager create channel mapping failed");

  const mappingId = managerCreate.json?.data?.mappingId;
  if (!mappingId) {
    throw new Error("mappingId missing from manager create response");
  }

  const managerPatch = await requestJson(`/v1/channel-mappings/${mappingId}`, {
    method: "PATCH",
    headers: managerHeaders,
    body: JSON.stringify({
      mappingStatus: "REVIEW_REQUIRED"
    })
  });
  assertStatus(managerPatch.status, 200, "Manager patch channel mapping failed");

  console.log("ADMIN_AUTH_SMOKE_RESULT=PASS");
  console.log(`BASE_URL=${baseUrl}`);
  console.log(`EXPECT_AUTH_ENFORCED=${expectAuthEnforced}`);
  console.log(`MAPPING_ID=${mappingId}`);
}

run().catch((error) => {
  console.error(
    `ADMIN_AUTH_SMOKE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
