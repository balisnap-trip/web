import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

function readMaxBytes() {
  const rawValue = process.env.CM_MEDIA_MAX_BYTES;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5 * 1024 * 1024;
  }
  return Math.trunc(parsed);
}

function readStorageRoot() {
  const configured = process.env.CM_MEDIA_STORAGE_ROOT?.trim();
  if (configured) {
    return configured;
  }
  return path.join(process.cwd(), "public", "uploads");
}

function sanitizeFileStem(stem: string): string {
  return stem
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function resolveExtension(fileName: string, mimeType: string): string {
  const mapped = MIME_EXTENSION_MAP[mimeType];
  if (mapped) {
    return mapped;
  }

  const fromName = path.extname(fileName || "").toLowerCase();
  if (fromName && /^.[a-z0-9]{2,5}$/.test(fromName)) {
    return fromName;
  }

  return ".bin";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_UPLOAD_UNAUTHORIZED",
          message: "Unauthorized media upload request"
        }
      },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_UPLOAD_FILE_REQUIRED",
          message: "File is required"
        }
      },
      { status: 400 }
    );
  }

  if (file.size <= 0) {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_UPLOAD_FILE_EMPTY",
          message: "File cannot be empty"
        }
      },
      { status: 400 }
    );
  }

  if (!MIME_EXTENSION_MAP[file.type]) {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_UPLOAD_TYPE_INVALID",
          message: "Only jpg, png, webp, gif are supported"
        }
      },
      { status: 400 }
    );
  }

  const maxBytes = readMaxBytes();
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        error: {
          code: "CM_MEDIA_UPLOAD_FILE_TOO_LARGE",
          message: `Max upload size is ${maxBytes} bytes`
        }
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const relativeDirectory = path.join("catalog", year, month);
  const absoluteDirectory = path.join(readStorageRoot(), relativeDirectory);
  const originalStem = path.parse(file.name || "").name || "catalog-image";
  const safeStem = sanitizeFileStem(originalStem) || "catalog-image";
  const extension = resolveExtension(file.name, file.type);
  const generatedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeStem}${extension}`;
  const absoluteFilePath = path.join(absoluteDirectory, generatedName);

  await mkdir(absoluteDirectory, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absoluteFilePath, buffer);

  const relativePath = `/api/media/files/${path.posix.join("catalog", year, month, generatedName)}`;
  return NextResponse.json({
    data: {
      url: relativePath,
      size: file.size,
      mimeType: file.type
    }
  });
}
