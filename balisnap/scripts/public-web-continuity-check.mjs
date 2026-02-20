import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../reports/gates/public-web-continuity");

function readText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

function readNumber(value, fallback, minValue = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    return fallback;
  }
  return Math.floor(parsed);
}

function readCsv(value, fallback) {
  const raw = readText(value);
  if (!raw) {
    return fallback;
  }
  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function check(name, passed, detail) {
  return { name, passed, detail };
}

function normalizeUrl(baseUrl, pagePath) {
  return `${baseUrl.replace(/\/+$/, "")}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`;
}

async function fetchText(url, timeoutMs) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      durationMs: Date.now() - started,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      text: "",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function findMatchedMarkers(haystack, markers) {
  const lowerHaystack = haystack.toLowerCase();
  return markers.filter((marker) => lowerHaystack.includes(marker.toLowerCase()));
}

function summarizeMarkers(name, matchedMarkers, markers, minMatches) {
  const passed = matchedMarkers.length >= minMatches;
  return check(
    name,
    passed,
    `matched=${matchedMarkers.length}/${markers.length} min=${minMatches} hits=[${matchedMarkers.join(", ") || "none"}]`
  );
}

function parseToursPayload(payloadText) {
  try {
    const parsed = payloadText ? JSON.parse(payloadText) : null;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed?.data)) {
      return parsed.data;
    }
    return [];
  } catch {
    return [];
  }
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Public Web Continuity Gate Report (T-009-05)");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Config");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.config, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  lines.push("| Check | Result | Detail |");
  lines.push("|---|---|---|");
  for (const item of report.checks) {
    lines.push(`| ${item.name} | ${item.passed ? "PASS" : "FAIL"} | ${item.detail} |`);
  }
  lines.push("");
  lines.push("## Endpoint Metrics");
  lines.push("");
  lines.push("| Endpoint | HTTP | Duration (ms) | Error |");
  lines.push("|---|---:|---:|---|");
  for (const endpoint of report.endpoints) {
    lines.push(
      `| ${endpoint.name} | ${endpoint.status ?? "n/a"} | ${endpoint.durationMs} | ${endpoint.error || "n/a"} |`
    );
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.summary, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const stamp = nowTimestampForFile();
  const jsonPath = path.join(reportRootDir, `${stamp}.json`);
  const mdPath = path.join(reportRootDir, `${stamp}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, createMarkdownReport(report, jsonPath), "utf8");

  return {
    jsonPath,
    mdPath
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  const baseUrl = readText(
    process.env.PUBLIC_WEB_BASE_URL,
    readText(process.env.NEXT_PUBLIC_BASE_URL, "http://127.0.0.1:5000")
  ).replace(/\/+$/, "");
  const timeoutMs = readNumber(process.env.PUBLIC_WEB_CONTINUITY_TIMEOUT_MS, 15_000, 1_000);
  const minTours = readNumber(process.env.PUBLIC_WEB_CONTINUITY_MIN_TOURS, 1, 0);
  const bookingId = readText(process.env.PUBLIC_WEB_CONTINUITY_BOOKING_ID, "1");
  const configuredTourSlug = readText(process.env.PUBLIC_WEB_TOUR_SLUG);

  const homeMarkers = readCsv(process.env.PUBLIC_WEB_CONTINUITY_HOME_MARKERS, [
    "BALISNAP TRIP",
    "Featured Tours",
    "Discover More"
  ]);
  const toursMarkers = readCsv(process.env.PUBLIC_WEB_CONTINUITY_TOURS_MARKERS, ["Featured Tours"]);
  const detailMarkers = readCsv(process.env.PUBLIC_WEB_CONTINUITY_DETAIL_MARKERS, ["Duration"]);
  const loginMarkers = readCsv(process.env.PUBLIC_WEB_CONTINUITY_LOGIN_MARKERS, ["Login"]);

  const homeMinMatches = readNumber(
    process.env.PUBLIC_WEB_CONTINUITY_HOME_MIN_MATCHES,
    Math.min(2, homeMarkers.length),
    1
  );
  const toursMinMatches = readNumber(
    process.env.PUBLIC_WEB_CONTINUITY_TOURS_MIN_MATCHES,
    Math.min(1, toursMarkers.length),
    1
  );
  const detailMinMatches = readNumber(
    process.env.PUBLIC_WEB_CONTINUITY_DETAIL_MIN_MATCHES,
    Math.min(1, detailMarkers.length),
    1
  );
  const loginMinMatches = readNumber(
    process.env.PUBLIC_WEB_CONTINUITY_LOGIN_MIN_MATCHES,
    Math.min(1, loginMarkers.length),
    1
  );

  const apiToursUrl = normalizeUrl(baseUrl, "/api/tours");
  const apiToursResult = await fetchText(apiToursUrl, timeoutMs);
  const tours = parseToursPayload(apiToursResult.text);
  const firstTourWithSlug = tours.find((item) => readText(item?.slug));
  const selectedTourSlug = configuredTourSlug || readText(firstTourWithSlug?.slug);

  const checks = [];
  checks.push(
    check(
      "T-009-05_api_tours_endpoint",
      apiToursResult.ok,
      `status=${apiToursResult.status ?? "n/a"} error=${apiToursResult.error || "none"}`
    )
  );
  checks.push(
    check(
      "T-009-05_api_tours_min_rows",
      tours.length >= minTours,
      `rows=${tours.length} min=${minTours}`
    )
  );
  checks.push(
    check(
      "T-009-05_tour_slug_available",
      Boolean(selectedTourSlug),
      `configuredSlug=${configuredTourSlug || "none"} selectedSlug=${selectedTourSlug || "none"}`
    )
  );

  const homeUrl = normalizeUrl(baseUrl, "/");
  const toursUrl = normalizeUrl(baseUrl, "/tours");
  const loginUrl = normalizeUrl(baseUrl, "/auth/login");
  const tourDetailUrl = normalizeUrl(baseUrl, `/tours/${selectedTourSlug || "__missing__"}`);
  const apiTourDetailUrl = normalizeUrl(baseUrl, `/api/tours/${selectedTourSlug || "__missing__"}`);
  const bookingUrl = normalizeUrl(baseUrl, `/booking/${bookingId}`);

  const [homeResult, toursResult, loginResult, tourDetailResult, apiTourDetailResult, bookingResult] =
    await Promise.all([
      fetchText(homeUrl, timeoutMs),
      fetchText(toursUrl, timeoutMs),
      fetchText(loginUrl, timeoutMs),
      fetchText(tourDetailUrl, timeoutMs),
      fetchText(apiTourDetailUrl, timeoutMs),
      fetchText(bookingUrl, timeoutMs)
    ]);

  checks.push(
    check(
      "T-009-05_home_http_200",
      homeResult.ok,
      `status=${homeResult.status ?? "n/a"} error=${homeResult.error || "none"}`
    )
  );
  checks.push(
    summarizeMarkers(
      "T-009-05_home_markers",
      findMatchedMarkers(homeResult.text, homeMarkers),
      homeMarkers,
      homeMinMatches
    )
  );
  const homeCssAssetCount = (homeResult.text.match(/\/_next\/static\/css\//g) || []).length;
  checks.push(
    check(
      "T-009-05_home_css_assets",
      homeCssAssetCount > 0,
      `cssAssetCount=${homeCssAssetCount}`
    )
  );

  checks.push(
    check(
      "T-009-05_tours_http_200",
      toursResult.ok,
      `status=${toursResult.status ?? "n/a"} error=${toursResult.error || "none"}`
    )
  );
  checks.push(
    summarizeMarkers(
      "T-009-05_tours_markers",
      findMatchedMarkers(toursResult.text, toursMarkers),
      toursMarkers,
      toursMinMatches
    )
  );

  checks.push(
    check(
      "T-009-05_tour_detail_http_200",
      tourDetailResult.ok,
      `status=${tourDetailResult.status ?? "n/a"} slug=${selectedTourSlug || "none"} error=${tourDetailResult.error || "none"}`
    )
  );
  checks.push(
    summarizeMarkers(
      "T-009-05_tour_detail_markers",
      findMatchedMarkers(tourDetailResult.text, detailMarkers),
      detailMarkers,
      detailMinMatches
    )
  );

  checks.push(
    check(
      "T-009-05_api_tour_detail_http_200",
      apiTourDetailResult.ok,
      `status=${apiTourDetailResult.status ?? "n/a"} error=${apiTourDetailResult.error || "none"}`
    )
  );
  const apiTourDetailParsed = (() => {
    try {
      return apiTourDetailResult.text ? JSON.parse(apiTourDetailResult.text) : null;
    } catch {
      return null;
    }
  })();
  const apiTourDetailPayload =
    apiTourDetailParsed && !Array.isArray(apiTourDetailParsed)
      ? apiTourDetailParsed?.data ?? apiTourDetailParsed
      : null;
  checks.push(
    check(
      "T-009-05_api_tour_detail_required_fields",
      Boolean(apiTourDetailPayload?.package_name) && Boolean(apiTourDetailPayload?.slug),
      `package_name=${Boolean(apiTourDetailPayload?.package_name)} slug=${Boolean(apiTourDetailPayload?.slug)}`
    )
  );

  checks.push(
    check(
      "T-009-05_login_http_200",
      loginResult.ok,
      `status=${loginResult.status ?? "n/a"} error=${loginResult.error || "none"}`
    )
  );
  checks.push(
    summarizeMarkers(
      "T-009-05_login_markers",
      findMatchedMarkers(loginResult.text, loginMarkers),
      loginMarkers,
      loginMinMatches
    )
  );

  checks.push(
    check(
      "T-009-05_booking_page_http_200",
      bookingResult.ok,
      `status=${bookingResult.status ?? "n/a"} bookingId=${bookingId} error=${bookingResult.error || "none"}`
    )
  );
  checks.push(
    check(
      "T-009-05_booking_payment_asset_present",
      bookingResult.text.toLowerCase().includes("paypal.png"),
      "marker=paypal.png"
    )
  );

  const failedChecks = checks.filter((item) => !item.passed);
  const report = {
    gate: "T-009-05_PUBLIC_WEB_CONTINUITY",
    startedAt,
    endedAt: new Date().toISOString(),
    result: failedChecks.length === 0 ? "PASS" : "FAIL",
    config: {
      baseUrl,
      timeoutMs,
      minTours,
      bookingId,
      configuredTourSlug,
      selectedTourSlug,
      homeMarkers,
      toursMarkers,
      detailMarkers,
      loginMarkers
    },
    summary: {
      totalChecks: checks.length,
      passedChecks: checks.length - failedChecks.length,
      failedChecks: failedChecks.length,
      toursCount: tours.length,
      selectedTourSlug
    },
    checks,
    endpoints: [
      {
        name: "api_tours",
        url: apiToursUrl,
        status: apiToursResult.status,
        durationMs: apiToursResult.durationMs,
        error: apiToursResult.error
      },
      {
        name: "home",
        url: homeUrl,
        status: homeResult.status,
        durationMs: homeResult.durationMs,
        error: homeResult.error
      },
      {
        name: "tours",
        url: toursUrl,
        status: toursResult.status,
        durationMs: toursResult.durationMs,
        error: toursResult.error
      },
      {
        name: "tour_detail",
        url: tourDetailUrl,
        status: tourDetailResult.status,
        durationMs: tourDetailResult.durationMs,
        error: tourDetailResult.error
      },
      {
        name: "api_tour_detail",
        url: apiTourDetailUrl,
        status: apiTourDetailResult.status,
        durationMs: apiTourDetailResult.durationMs,
        error: apiTourDetailResult.error
      },
      {
        name: "auth_login",
        url: loginUrl,
        status: loginResult.status,
        durationMs: loginResult.durationMs,
        error: loginResult.error
      },
      {
        name: "booking_page",
        url: bookingUrl,
        status: bookingResult.status,
        durationMs: bookingResult.durationMs,
        error: bookingResult.error
      }
    ]
  };

  const paths = await writeReport(report);
  console.log(`PUBLIC_WEB_CONTINUITY_RESULT=${report.result}`);
  console.log(`PUBLIC_WEB_CONTINUITY_REPORT_JSON=${paths.jsonPath}`);
  console.log(`PUBLIC_WEB_CONTINUITY_REPORT_MD=${paths.mdPath}`);

  if (failedChecks.length > 0) {
    for (const failedCheck of failedChecks) {
      console.error(`FAILED_CHECK=${failedCheck.name} detail=${failedCheck.detail}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(
    `PUBLIC_WEB_CONTINUITY_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
