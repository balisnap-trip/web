"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface ImageQualityHintProps {
  src: string;
  minWidth: number;
  minHeight: number;
  idealWidth?: number;
  idealHeight?: number;
  compact?: boolean;
  className?: string;
}

interface ImageAnalysisResult {
  width: number;
  height: number;
  megapixels: number;
  ratio: string;
  sharpnessScore: number | null;
  sharpnessLabel: "Sharp" | "Fair" | "Soft" | "Unavailable";
  resolutionOk: boolean;
  issues: string[];
}

const analysisCache = new Map<string, ImageAnalysisResult>();

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x || 1;
}

function formatRatio(width: number, height: number): string {
  const divisor = gcd(width, height);
  const w = Math.max(1, Math.round(width / divisor));
  const h = Math.max(1, Math.round(height / divisor));
  return `${w}:${h}`;
}

function classifySharpness(score: number | null): "Sharp" | "Fair" | "Soft" | "Unavailable" {
  if (score === null) {
    return "Unavailable";
  }
  if (score >= 180) {
    return "Sharp";
  }
  if (score >= 95) {
    return "Fair";
  }
  return "Soft";
}

function computeSharpnessVariance(image: HTMLImageElement): number {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const maxDimension = 320;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(64, Math.round(sourceWidth * scale));
  const height = Math.max(64, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return 0;
  }

  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const grayscale = new Float32Array(width * height);

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    grayscale[pixel] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const laplacian =
        grayscale[idx - 1] + grayscale[idx + 1] + grayscale[idx - width] + grayscale[idx + width] - 4 * grayscale[idx];
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }

  if (count === 0) {
    return 0;
  }

  const mean = sum / count;
  return Math.max(0, sumSquares / count - mean * mean);
}

function analyzeImage(
  image: HTMLImageElement,
  minWidth: number,
  minHeight: number
): ImageAnalysisResult {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const megapixels = (width * height) / 1_000_000;
  const ratio = formatRatio(width, height);
  const resolutionOk = width >= minWidth && height >= minHeight;

  let sharpnessScore: number | null = null;
  try {
    sharpnessScore = computeSharpnessVariance(image);
  } catch {
    sharpnessScore = null;
  }

  const sharpnessLabel = classifySharpness(sharpnessScore);
  const issues: string[] = [];

  if (!resolutionOk) {
    issues.push("Resolution is below the minimum recommendation.");
  }
  if (sharpnessScore !== null && sharpnessScore < 95) {
    issues.push("Image clarity is low and likely blurry.");
  }
  if (sharpnessScore === null) {
    issues.push("Clarity analysis is unavailable for this image source.");
  }

  return {
    width,
    height,
    megapixels,
    ratio,
    sharpnessScore,
    sharpnessLabel,
    resolutionOk,
    issues
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    image.src = src;
  });
}

function formatPixels(width: number, height: number) {
  return `${width} x ${height} px`;
}

function formatRecommendation(
  minWidth: number,
  minHeight: number,
  idealWidth?: number,
  idealHeight?: number
) {
  const minimum = `min ${formatPixels(minWidth, minHeight)}`;
  if (idealWidth && idealHeight) {
    return `${minimum}, ideal ${formatPixels(idealWidth, idealHeight)}`;
  }
  return minimum;
}

export function ImageQualityHint({
  src,
  minWidth,
  minHeight,
  idealWidth,
  idealHeight,
  compact = false,
  className
}: ImageQualityHintProps) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ImageAnalysisResult | null>(null);
  const [error, setError] = useState("");

  const recommendation = useMemo(
    () => formatRecommendation(minWidth, minHeight, idealWidth, idealHeight),
    [minWidth, minHeight, idealWidth, idealHeight]
  );

  useEffect(() => {
    if (!src) {
      setAnalysis(null);
      setError("");
      setLoading(false);
      return;
    }

    const cacheKey = `${src}|${minWidth}|${minHeight}`;
    const cached = analysisCache.get(cacheKey);
    if (cached) {
      setAnalysis(cached);
      setError("");
      setLoading(false);
      return;
    }

    let disposed = false;
    setLoading(true);
    setError("");

    loadImage(src)
      .then((image) => {
        if (disposed) {
          return;
        }
        const result = analyzeImage(image, minWidth, minHeight);
        analysisCache.set(cacheKey, result);
        setAnalysis(result);
      })
      .catch((analysisError) => {
        if (disposed) {
          return;
        }
        setAnalysis(null);
        setError(analysisError instanceof Error ? analysisError.message : String(analysisError));
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [src, minWidth, minHeight]);

  const resolutionTone = analysis?.resolutionOk ? "text-emerald-700" : "text-amber-700";
  const clarityTone =
    analysis?.sharpnessLabel === "Sharp"
      ? "text-emerald-700"
      : analysis?.sharpnessLabel === "Fair"
        ? "text-amber-700"
        : "text-red-700";

  return (
    <div
      className={cn(
        "rounded-md border border-slate-200 bg-white/90 px-2.5 py-2 text-[11px]",
        compact ? "space-y-0.5" : "space-y-1",
        className
      )}
    >
      <p className="font-semibold text-slate-700">Recommended: {recommendation}</p>

      {loading ? <p className="text-slate-500">Analyzing image quality...</p> : null}

      {!loading && analysis ? (
        <>
          <p className={resolutionTone}>
            Resolution: {formatPixels(analysis.width, analysis.height)} ({analysis.megapixels.toFixed(2)} MP), ratio{" "}
            {analysis.ratio}
          </p>
          <p className={clarityTone}>
            Clarity: {analysis.sharpnessLabel}
            {analysis.sharpnessScore !== null ? ` (score ${analysis.sharpnessScore.toFixed(1)})` : ""}
          </p>
          {!compact && analysis.issues.length > 0 ? (
            <p className="text-slate-600">Notes: {analysis.issues.join(" ")}</p>
          ) : null}
        </>
      ) : null}

      {!loading && !analysis && error ? <p className="text-amber-700">Quality check failed: {error}</p> : null}
    </div>
  );
}
