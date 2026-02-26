"use client";

import { ChangeEvent, DragEvent, useEffect, useState } from "react";
import { ImagePreviewModal } from "@/components/catalog/image-preview-modal";
import { ImageQualityHint } from "@/components/catalog/image-quality-hint";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { resolveCatalogMediaUrl } from "@/lib/media-url";

interface ThumbnailInputProps {
  id: string;
  name: string;
  label?: string;
  hint?: string;
  defaultValue?: string;
}

interface UploadResult {
  data?: {
    url?: string;
  };
  error?: {
    message?: string;
    code?: string;
  };
}

function buildPreviewStyle(url: string): string {
  const safeUrl = url.replace(/"/g, "%22");
  return `url("${safeUrl}")`;
}

export function ThumbnailInput({
  id,
  name,
  label = "Thumbnail URL",
  hint = "Paste URL or upload image.",
  defaultValue = ""
}: ThumbnailInputProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState(defaultValue);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const previewUrl = resolveCatalogMediaUrl(localPreviewUrl || thumbnailUrl);

  function onFilePicked(file: File | null) {
    setSelectedFile(file);
    setError("");
    setSuccess("");
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    onFilePicked(file);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;
    onFilePicked(file);
  }

  async function uploadFile() {
    if (!selectedFile) {
      setError("Select an image file first.");
      return;
    }

    const payload = new FormData();
    payload.set("file", selectedFile);

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: payload
      });

      const result = (await response.json().catch(() => null)) as UploadResult | null;
      if (!response.ok) {
        setError(result?.error?.message || result?.error?.code || `UPLOAD_HTTP_${response.status}`);
        return;
      }

      const uploadedUrl = result?.data?.url || "";
      if (!uploadedUrl) {
        setError("Upload succeeded, but no URL was returned.");
        return;
      }

      setThumbnailUrl(uploadedUrl);
      setSelectedFile(null);
      setSuccess("Upload complete. Thumbnail URL has been set.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <FormField label={label} htmlFor={id} hint={hint}>
        <Input
          id={id}
          name={name}
          value={thumbnailUrl}
          onChange={(event) => setThumbnailUrl(event.target.value)}
          placeholder="https://... or /api/media/files/catalog/..."
        />
      </FormField>

      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-dashed border-input bg-background px-3 py-3 text-left text-sm"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        onClick={() => document.getElementById(`${id}-file`)?.click()}
      >
        <span className="text-muted-foreground">
          {selectedFile ? `Selected: ${selectedFile.name}` : "Drag and drop image here, or click to choose file"}
        </span>
        <span className="text-xs text-muted-foreground">jpg/png/webp/gif</span>
      </button>

      <input id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onInputChange} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={uploadFile} disabled={uploading || !selectedFile}>
          {uploading ? "Uploading..." : "Upload image"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setSelectedFile(null)} disabled={uploading || !selectedFile}>
          Clear file
        </Button>
      </div>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {success ? <p className="text-xs text-emerald-700">{success}</p> : null}

      {previewUrl ? (
        <ImagePreviewModal src={previewUrl} alt="Thumbnail preview">
          <div
            className="h-40 w-full rounded-lg border border-input bg-center bg-cover cursor-zoom-in"
            style={{ backgroundImage: buildPreviewStyle(previewUrl) }}
            aria-label="Thumbnail preview"
          />
        </ImagePreviewModal>
      ) : (
        <div className="h-40 w-full rounded-lg border border-dashed border-input bg-background text-sm text-muted-foreground grid place-items-center">
          No thumbnail preview
        </div>
      )}

      {previewUrl ? (
        <ImageQualityHint
          src={previewUrl}
          minWidth={1600}
          minHeight={1067}
          idealWidth={2400}
          idealHeight={1600}
        />
      ) : null}
    </div>
  );
}
