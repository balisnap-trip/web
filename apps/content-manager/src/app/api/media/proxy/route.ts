import { NextResponse } from "next/server";

function readLegacyAssetBaseUrl() {
  const configured = process.env.CM_LEGACY_MEDIA_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return "http://127.0.0.1:5000";
}

function isValidPath(input: string) {
  if (!input.startsWith("/")) {
    return false;
  }
  if (input.startsWith("//")) {
    return false;
  }
  if (input.includes("\\")) {
    return false;
  }
  if (input.includes("..")) {
    return false;
  }
  return true;
}

function buildTargetUrl(pathValue: string) {
  return `${readLegacyAssetBaseUrl()}${pathValue}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pathValue = searchParams.get("path")?.trim() || "";

  if (!pathValue || !isValidPath(pathValue)) {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_PROXY_PATH_INVALID",
          message: "Invalid media path"
        }
      },
      { status: 400 }
    );
  }

  const targetUrl = buildTargetUrl(pathValue);
  const targetResponse = await fetch(targetUrl, { method: "GET", cache: "force-cache" }).catch(() => null);

  if (!targetResponse || !targetResponse.ok) {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_PROXY_FETCH_FAILED",
          message: "Media source not reachable"
        }
      },
      { status: 404 }
    );
  }

  const payload = await targetResponse.arrayBuffer();
  const contentType = targetResponse.headers.get("content-type") || "application/octet-stream";
  return new NextResponse(payload, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600"
    }
  });
}

export async function HEAD(request: Request) {
  const { searchParams } = new URL(request.url);
  const pathValue = searchParams.get("path")?.trim() || "";

  if (!pathValue || !isValidPath(pathValue)) {
    return new NextResponse(null, { status: 400 });
  }

  const targetUrl = buildTargetUrl(pathValue);
  const targetResponse = await fetch(targetUrl, { method: "HEAD", cache: "force-cache" }).catch(() => null);
  if (!targetResponse || !targetResponse.ok) {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = targetResponse.headers.get("content-type") || "application/octet-stream";
  return new NextResponse(null, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600"
    }
  });
}

