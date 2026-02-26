import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function readStorageRoot() {
  const configured = process.env.CM_MEDIA_STORAGE_ROOT?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(path.join(process.cwd(), "public", "uploads"));
}

function sanitizeSegments(segments: string[]): string[] {
  return segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/\\/g, "/"))
    .flatMap((segment) => segment.split("/"))
    .filter(Boolean)
    .filter((segment) => segment !== "." && segment !== "..");
}

function resolveMediaPath(segments: string[]): string | null {
  const storageRoot = readStorageRoot();
  const safeSegments = sanitizeSegments(segments);
  if (safeSegments.length === 0) {
    return null;
  }
  const absolutePath = path.resolve(storageRoot, ...safeSegments);
  if (!(absolutePath === storageRoot || absolutePath.startsWith(`${storageRoot}${path.sep}`))) {
    return null;
  }
  return absolutePath;
}

function resolveContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[extension] || "application/octet-stream";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ segments: string[] }> }
) {
  const params = await context.params;
  const absolutePath = resolveMediaPath(params.segments || []);
  if (!absolutePath) {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_FILE_PATH_INVALID",
          message: "Invalid media file path"
        }
      },
      { status: 400 }
    );
  }

  try {
    const fileBuffer = await readFile(absolutePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "content-type": resolveContentType(absolutePath),
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_FILE_NOT_FOUND",
          message: "Media file not found"
        }
      },
      { status: 404 }
    );
  }
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ segments: string[] }> }
) {
  const params = await context.params;
  const absolutePath = resolveMediaPath(params.segments || []);
  if (!absolutePath) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    await readFile(absolutePath);
    return new NextResponse(null, {
      status: 200,
      headers: {
        "content-type": resolveContentType(absolutePath),
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
