"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImagePreviewModal } from "@/components/catalog/image-preview-modal";
import { ImageQualityHint } from "@/components/catalog/image-quality-hint";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { resolveCatalogMediaUrl } from "@/lib/media-url";
import type {
  CatalogItemContentDto,
  CatalogItemFaqEntryDto,
  CatalogItemItineraryEntryDto,
  CatalogItemSlideDto,
  CatalogVariantDto
} from "@/lib/core-api";

interface CatalogContentEditorFieldsProps {
  initialContent?: CatalogItemContentDto | null;
  variants: CatalogVariantDto[];
  canEdit: boolean;
  fieldName?: string;
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

type StageId = "experience" | "photos" | "itinerary" | "inclusions" | "need_to_know" | "faq";
type ListKey = "highlights" | "inclusions" | "exclusions" | "additionalInfo" | "optionalFeatures";

const stages: Array<{ id: StageId; title: string; description: string }> = [
  { id: "experience", title: "1. Experience", description: "Nilai jual utama tour" },
  { id: "photos", title: "2. Photos", description: "Gallery and cover" },
  { id: "itinerary", title: "3. Itinerary", description: "Run-down day by day" },
  { id: "inclusions", title: "4. Included/Excluded", description: "Guest expectations" },
  { id: "need_to_know", title: "5. Need to Know", description: "Essential info before booking" },
  { id: "faq", title: "6. FAQ", description: "Common questions" }
];

function createEmptyContent(): CatalogItemContentDto {
  return {
    slides: [],
    itinerary: [],
    highlights: [],
    inclusions: [],
    exclusions: [],
    additionalInfo: [],
    optionalFeatures: [],
    faqs: []
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown): string | null {
  const normalized = asString(value).trim();
  return normalized || null;
}

function asNumber(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return fallback;
  }
  return normalized;
}

function splitLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildPreviewStyle(url: string): string {
  const resolvedUrl = resolveCatalogMediaUrl(url);
  if (!resolvedUrl) {
    return "none";
  }
  const safeUrl = resolvedUrl.replace(/"/g, "%22");
  return `url("${safeUrl}")`;
}

function normalizeInitialContent(input?: CatalogItemContentDto | null): CatalogItemContentDto {
  if (!input || typeof input !== "object") {
    return createEmptyContent();
  }

  const rawSlides = Array.isArray(input.slides) ? input.slides : [];
  const slides: CatalogItemSlideDto[] = rawSlides
    .map((slide, index) => ({
      url: asString(slide?.url).trim(),
      altText: asOptionalString(slide?.altText),
      isCover: Boolean(slide?.isCover),
      sortOrder: asNumber(slide?.sortOrder, index + 1, 0)
    }))
    .filter((slide) => Boolean(slide.url));

  if (slides.length > 0 && !slides.some((slide) => slide.isCover)) {
    slides[0].isCover = true;
  }

  const rawItinerary = Array.isArray(input.itinerary) ? input.itinerary : [];
  const itinerary: CatalogItemItineraryEntryDto[] = rawItinerary
    .map((entry, index) => ({
      variantId: asOptionalString(entry?.variantId),
      day: asNumber(entry?.day, 1, 1),
      sortOrder: asNumber(entry?.sortOrder, index + 1, 0),
      title: asString(entry?.title).trim(),
      description: asOptionalString(entry?.description),
      location: asOptionalString(entry?.location),
      startTime: asOptionalString(entry?.startTime),
      endTime: asOptionalString(entry?.endTime)
    }))
    .filter((entry) => Boolean(entry.title));

  const normalizeList = (value: unknown): string[] =>
    (Array.isArray(value) ? value : []).map((entry) => asString(entry).trim()).filter(Boolean);

  const rawFaqs = Array.isArray(input.faqs) ? input.faqs : [];
  const faqs: CatalogItemFaqEntryDto[] = rawFaqs
    .map((entry) => ({ question: asString(entry?.question).trim(), answer: asString(entry?.answer).trim() }))
    .filter((entry) => Boolean(entry.question) && Boolean(entry.answer));

  return {
    slides,
    itinerary,
    highlights: normalizeList(input.highlights),
    inclusions: normalizeList(input.inclusions),
    exclusions: normalizeList(input.exclusions),
    additionalInfo: normalizeList(input.additionalInfo),
    optionalFeatures: normalizeList(input.optionalFeatures),
    faqs
  };
}

function buildNewSlide(order: number): CatalogItemSlideDto {
  return { url: "", altText: null, isCover: order === 1, sortOrder: order };
}

function buildNewItineraryEntry(order: number): CatalogItemItineraryEntryDto {
  return {
    variantId: null,
    day: 1,
    sortOrder: order,
    title: "",
    description: null,
    location: null,
    startTime: null,
    endTime: null
  };
}

function buildNewFaq(): CatalogItemFaqEntryDto {
  return { question: "", answer: "" };
}

export function CatalogContentEditorFields({
  initialContent,
  variants,
  canEdit,
  fieldName = "content"
}: CatalogContentEditorFieldsProps) {
  const [content, setContent] = useState<CatalogItemContentDto>(() => normalizeInitialContent(initialContent));
  const [activeStage, setActiveStage] = useState<StageId>("experience");
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploadingSlideIndex, setUploadingSlideIndex] = useState<number | null>(null);
  const [uploadingNewSlide, setUploadingNewSlide] = useState(false);

  const serializedContent = useMemo(() => JSON.stringify(content), [content]);

  const stageCompletion = useMemo(
    () => ({
      experience: content.highlights.length >= 3,
      photos: content.slides.length >= 5 && content.slides.some((slide) => slide.isCover),
      itinerary: content.itinerary.length >= 3,
      inclusions: content.inclusions.length >= 1 && content.exclusions.length >= 1,
      need_to_know: content.additionalInfo.length >= 1,
      faq: content.faqs.length >= 1
    }),
    [content]
  );

  const qualityChecks = useMemo(
    () => [
      { title: "Clear highlights", detail: "Minimum 3 value-proposition points", done: content.highlights.length >= 3 },
      {
        title: "Photo coverage",
        detail: "Minimum 5 photos with 1 cover",
        done: content.slides.length >= 5 && content.slides.some((slide) => slide.isCover)
      },
      { title: "Itinerary detail", detail: "Minimal 3 activity row", done: content.itinerary.length >= 3 },
      {
        title: "Scope transparency",
        detail: "Include + Exclude must be filled",
        done: content.inclusions.length >= 1 && content.exclusions.length >= 1
      },
      { title: "Need to know", detail: "At least 1 key note", done: content.additionalInfo.length >= 1 }
    ],
    [content]
  );

  const completedQualityChecks = qualityChecks.filter((check) => check.done).length;
  const qualityScore = Math.round((completedQualityChecks / qualityChecks.length) * 100);

  const spotlightText = useMemo(() => {
    const topHighlight = content.highlights[0] || "No primary highlight yet.";
    const cover = content.slides.find((slide) => slide.isCover) || content.slides[0];
    const itineraryDays = new Set(content.itinerary.map((entry) => entry.day)).size;
    return { topHighlight, coverUrl: cover?.url || "", itineraryDays };
  }, [content]);

  function updateList(key: ListKey, values: string[]) {
    setContent((current) => ({ ...current, [key]: values }));
  }

  function updateSlides(nextSlides: CatalogItemSlideDto[]) {
    setContent((current) => ({ ...current, slides: nextSlides }));
  }

  function updateItinerary(nextItinerary: CatalogItemItineraryEntryDto[]) {
    setContent((current) => ({ ...current, itinerary: nextItinerary }));
  }

  function updateFaqs(nextFaqs: CatalogItemFaqEntryDto[]) {
    setContent((current) => ({ ...current, faqs: nextFaqs }));
  }

  function moveSlide(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= content.slides.length) {
      return;
    }

    const nextSlides = [...content.slides];
    const currentSlide = nextSlides[index];
    nextSlides[index] = nextSlides[targetIndex];
    nextSlides[targetIndex] = currentSlide;

    updateSlides(nextSlides.map((slide, slideIndex) => ({ ...slide, sortOrder: slideIndex + 1 })));
  }

  async function uploadImage(file: File): Promise<string> {
    const payload = new FormData();
    payload.set("file", file);
    const response = await fetch("/api/media/upload", { method: "POST", body: payload });
    const result = (await response.json().catch(() => null)) as UploadResult | null;
    if (!response.ok) {
      throw new Error(result?.error?.message || result?.error?.code || `UPLOAD_HTTP_${response.status}`);
    }
    const uploadedUrl = result?.data?.url || "";
    if (!uploadedUrl) {
      throw new Error("UPLOAD_URL_MISSING");
    }
    return uploadedUrl;
  }

  async function onUploadExistingSlide(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setUploadError("");
    setUploadSuccess("");
    setUploadingSlideIndex(index);

    try {
      const uploadedUrl = await uploadImage(file);
      updateSlides(
        content.slides.map((slide, slideIndex) =>
          slideIndex === index
            ? {
                ...slide,
                url: uploadedUrl
              }
            : slide
        )
      );
      setUploadSuccess("Image uploaded to slide successfully.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadingSlideIndex(null);
    }
  }

  async function onUploadNewSlide(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setUploadError("");
    setUploadSuccess("");
    setUploadingNewSlide(true);

    try {
      const uploadedUrl = await uploadImage(file);
      updateSlides([...content.slides, { ...buildNewSlide(content.slides.length + 1), url: uploadedUrl }]);
      setUploadSuccess("New slide added successfully.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadingNewSlide(false);
    }
  }

  return (
    <div className="space-y-5">
      <input type="hidden" name={fieldName} value={serializedContent} />

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tour Listing Workflow</p>
            <h3 className="text-lg font-semibold text-slate-900">Build traveler-ready content</h3>
            <p className="max-w-2xl text-sm text-slate-600">
              Struktur authoring ini mengikuti pola marketplace tour: experience value, photo confidence,
              itinerary clarity, and expectation setting.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Listing Quality</p>
            <p className="text-2xl font-bold text-slate-900">{qualityScore}%</p>
            <p className="text-xs text-slate-500">
              {completedQualityChecks}/{qualityChecks.length} checkpoints completed
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {qualityChecks.map((check) => (
            <div key={check.title} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-semibold text-slate-900">{check.title}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{check.detail}</p>
              <p className={`mt-1 text-[11px] font-semibold ${check.done ? "text-emerald-600" : "text-amber-600"}`}>
                {check.done ? "Complete" : "Pending"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Editing Stages</p>
            <div className="space-y-1.5">
              {stages.map((stage) => {
                const active = activeStage === stage.id;
                const complete = stageCompletion[stage.id];
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setActiveStage(stage.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{stage.title}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {complete ? "Done" : "Pending"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{stage.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Traveler Snapshot</p>
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">Headline highlight</p>
              <p className="text-sm font-medium text-slate-900">{spotlightText.topHighlight}</p>
              <p className="text-xs text-slate-500">Itinerary days: {spotlightText.itineraryDays}</p>
              {spotlightText.coverUrl ? (
                <div className="space-y-2">
                  <ImagePreviewModal src={resolveCatalogMediaUrl(spotlightText.coverUrl)} alt="Tour cover preview">
                    <div
                      className="h-24 rounded-lg border border-slate-200 bg-center bg-cover cursor-zoom-in"
                      style={{ backgroundImage: buildPreviewStyle(spotlightText.coverUrl) }}
                    />
                  </ImagePreviewModal>
                  <ImageQualityHint
                    src={resolveCatalogMediaUrl(spotlightText.coverUrl)}
                    minWidth={1920}
                    minHeight={1280}
                    idealWidth={2560}
                    idealHeight={1707}
                    compact
                  />
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          {activeStage === "experience" ? (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Experience Positioning</h4>
                <p className="text-sm text-slate-500">
                  Similar to Viator/GYG, start with the value proposition so guests understand the product before price.
                </p>
              </div>

              <WorkflowListEditor
                title="Top Highlights"
                hint="Write points that truly make this tour stand out (min 3)."
                values={content.highlights}
                onChange={(values) => updateList("highlights", values)}
                canEdit={canEdit}
                placeholder="Sunrise viewpoint without crowds"
              />

              <WorkflowListEditor
                title="Optional Upgrades"
                hint="Add upsell/add-on options that guests can choose."
                values={content.optionalFeatures}
                onChange={(values) => updateList("optionalFeatures", values)}
                canEdit={canEdit}
                placeholder="Private photographer"
              />
            </section>
          ) : null}

          {activeStage === "photos" ? (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Photo Storyboard</h4>
                  <p className="text-sm text-slate-500">
                    Prioritize photo order from visual hook, key activity, proof of experience, then closing shot.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => updateSlides([...content.slides, buildNewSlide(content.slides.length + 1)])}
                    disabled={!canEdit}
                  >
                    Add slide
                  </Button>
                  <label className="inline-flex">
                    <input
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={onUploadNewSlide}
                      disabled={!canEdit || uploadingNewSlide}
                    />
                    <span className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-input px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      {uploadingNewSlide ? "Uploading..." : "Upload image"}
                    </span>
                  </label>
                </div>
              </div>

              {content.slides.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-slate-500">
                  No photo story yet. Add the first slide as the hero image.
                </div>
              ) : (
                <div className="space-y-3">
                  {content.slides.map((slide, index) => (
                    <div key={`slide-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="grid gap-3 xl:grid-cols-[180px_1fr]">
                        <div className="space-y-2">
                          {slide.url ? (
                            <ImagePreviewModal
                              src={resolveCatalogMediaUrl(slide.url)}
                              alt={slide.altText || `Slide preview ${index + 1}`}
                            >
                              <div
                                className="h-28 w-full rounded-lg border border-slate-200 bg-center bg-cover cursor-zoom-in"
                                style={{ backgroundImage: buildPreviewStyle(slide.url) }}
                              />
                            </ImagePreviewModal>
                          ) : (
                            <div className="grid h-28 place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500">
                              No preview
                            </div>
                          )}
                          {slide.url ? (
                            <ImageQualityHint
                              src={resolveCatalogMediaUrl(slide.url)}
                              minWidth={1920}
                              minHeight={1280}
                              idealWidth={2560}
                              idealHeight={1707}
                            />
                          ) : null}
                        </div>

                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <FormField label="Image URL" htmlFor={`slide-url-${index}`}>
                              <Input
                                id={`slide-url-${index}`}
                                value={slide.url}
                                placeholder="https://... atau /api/media/files/catalog/..."
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateSlides(
                                    content.slides.map((entry, entryIndex) =>
                                      entryIndex === index
                                        ? {
                                            ...entry,
                                            url: event.target.value
                                          }
                                        : entry
                                    )
                                  )
                                }
                              />
                            </FormField>
                            <FormField label="Alt Text" htmlFor={`slide-alt-${index}`}>
                              <Input
                                id={`slide-alt-${index}`}
                                value={slide.altText || ""}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateSlides(
                                    content.slides.map((entry, entryIndex) =>
                                      entryIndex === index
                                        ? {
                                            ...entry,
                                            altText: event.target.value.trim() ? event.target.value : null
                                          }
                                        : entry
                                    )
                                  )
                                }
                              />
                            </FormField>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                              <Checkbox
                                checked={slide.isCover}
                                disabled={!canEdit}
                                onChange={() =>
                                  updateSlides(
                                    content.slides.map((entry, entryIndex) => ({
                                      ...entry,
                                      isCover: entryIndex === index
                                    }))
                                  )
                                }
                              />
                              Set as cover
                            </label>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canEdit || index === 0}
                              onClick={() => moveSlide(index, -1)}
                            >
                              Move up
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canEdit || index === content.slides.length - 1}
                              onClick={() => moveSlide(index, 1)}
                            >
                              Move down
                            </Button>

                            <label className="inline-flex">
                              <input
                                type="file"
                                className="hidden"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                onChange={(event) => onUploadExistingSlide(index, event)}
                                disabled={!canEdit || uploadingSlideIndex === index}
                              />
                              <span className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-input px-3 text-xs font-medium text-slate-700 hover:bg-slate-100">
                                {uploadingSlideIndex === index ? "Uploading..." : "Replace image"}
                              </span>
                            </label>

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={!canEdit}
                              onClick={() =>
                                updateSlides(content.slides.filter((_, entryIndex) => entryIndex !== index))
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {uploadError ? <p className="text-xs text-red-700">{uploadError}</p> : null}
              {uploadSuccess ? <p className="text-xs text-emerald-700">{uploadSuccess}</p> : null}
            </section>
          ) : null}

          {activeStage === "itinerary" ? (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Itinerary Timeline</h4>
                  <p className="text-sm text-slate-500">
                    Keep the itinerary concrete: when, where, and what activity.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateItinerary([...content.itinerary, buildNewItineraryEntry(content.itinerary.length + 1)])
                  }
                  disabled={!canEdit}
                >
                  Add activity
                </Button>
              </div>

              {content.itinerary.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-slate-500">
                  No itinerary yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {content.itinerary.map((entry, index) => (
                    <div key={`itinerary-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Activity #{index + 1}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={!canEdit}
                          onClick={() =>
                            updateItinerary(content.itinerary.filter((_, itemIndex) => itemIndex !== index))
                          }
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-6">
                        <FormField label="Day" htmlFor={`itinerary-day-${index}`}>
                          <Input
                            id={`itinerary-day-${index}`}
                            type="number"
                            min={1}
                            value={entry.day}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItinerary(
                                content.itinerary.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        day: asNumber(event.target.value, 1, 1)
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </FormField>
                        <FormField label="Sort" htmlFor={`itinerary-sort-${index}`}>
                          <Input
                            id={`itinerary-sort-${index}`}
                            type="number"
                            min={0}
                            value={entry.sortOrder}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItinerary(
                                content.itinerary.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        sortOrder: asNumber(event.target.value, index + 1, 0)
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </FormField>

                        <FormField label="Start" htmlFor={`itinerary-start-${index}`}>
                          <Input
                            id={`itinerary-start-${index}`}
                            value={entry.startTime || ""}
                            placeholder="08:00"
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItinerary(
                                content.itinerary.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        startTime: event.target.value.trim() ? event.target.value : null
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </FormField>
                        <FormField label="End" htmlFor={`itinerary-end-${index}`}>
                          <Input
                            id={`itinerary-end-${index}`}
                            value={entry.endTime || ""}
                            placeholder="10:30"
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItinerary(
                                content.itinerary.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        endTime: event.target.value.trim() ? event.target.value : null
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </FormField>
                        <FormField label="Variant scope" htmlFor={`itinerary-variant-${index}`} className="md:col-span-2">
                          <Select
                            id={`itinerary-variant-${index}`}
                            value={entry.variantId || ""}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItinerary(
                                content.itinerary.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        variantId: event.target.value || null
                                      }
                                    : item
                                )
                              )
                            }
                          >
                            <option value="">All variants</option>
                            {variants.map((variant) => (
                              <option key={variant.variantId} value={variant.variantId}>
                                {variant.code} - {variant.name}
                              </option>
                            ))}
                          </Select>
                        </FormField>

                        <FormField label="Activity title" htmlFor={`itinerary-title-${index}`} className="md:col-span-3">
                          <Input
                            id={`itinerary-title-${index}`}
                            value={entry.title}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItinerary(
                                content.itinerary.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        title: event.target.value
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </FormField>
                        <FormField label="Location" htmlFor={`itinerary-location-${index}`} className="md:col-span-3">
                          <Input
                            id={`itinerary-location-${index}`}
                            value={entry.location || ""}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItinerary(
                                content.itinerary.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        location: event.target.value.trim() ? event.target.value : null
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </FormField>

                        <FormField label="Description" htmlFor={`itinerary-description-${index}`} className="md:col-span-6">
                          <Textarea
                            id={`itinerary-description-${index}`}
                            rows={3}
                            value={entry.description || ""}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateItinerary(
                                content.itinerary.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        description: event.target.value.trim() ? event.target.value : null
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </FormField>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeStage === "inclusions" ? (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Inclusion and Exclusion</h4>
                <p className="text-sm text-slate-500">
                  This section strongly affects trust. Keep package scope clear and unambiguous.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <WorkflowListEditor
                  title="Included"
                  hint="List what the customer receives."
                  values={content.inclusions}
                  onChange={(values) => updateList("inclusions", values)}
                  canEdit={canEdit}
                  placeholder="Hotel pickup area Ubud"
                />
                <WorkflowListEditor
                  title="Not Included"
                  hint="List items paid separately or excluded from the package."
                  values={content.exclusions}
                  onChange={(values) => updateList("exclusions", values)}
                  canEdit={canEdit}
                  placeholder="Personal expenses"
                />
              </div>
            </section>
          ) : null}

          {activeStage === "need_to_know" ? (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Need to Know</h4>
                <p className="text-sm text-slate-500">
                  Fill with operational policies, guest preparation, weather conditions, and service limitations.
                </p>
              </div>
              <WorkflowListEditor
                title="Additional Information"
                hint="Add essential notes guests should read before booking."
                values={content.additionalInfo}
                onChange={(values) => updateList("additionalInfo", values)}
                canEdit={canEdit}
                placeholder="Not recommended for travelers with severe back problems"
              />
            </section>
          ) : null}

          {activeStage === "faq" ? (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Frequently Asked Questions</h4>
                  <p className="text-sm text-slate-500">
                    Answer frequent questions that typically block checkout.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => updateFaqs([...content.faqs, buildNewFaq()])}
                  disabled={!canEdit}
                >
                  Add question
                </Button>
              </div>

              {content.faqs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-slate-500">
                  No FAQ yet. Add common questions on pickup, duration, accessibility, or cancellation policy.
                </div>
              ) : (
                <div className="space-y-3">
                  {content.faqs.map((faq, index) => (
                    <div key={`faq-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          FAQ #{index + 1}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={!canEdit}
                          onClick={() => updateFaqs(content.faqs.filter((_, faqIndex) => faqIndex !== index))}
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-3">
                        <FormField label="Question" htmlFor={`faq-question-${index}`}>
                          <Input
                            id={`faq-question-${index}`}
                            value={faq.question}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateFaqs(
                                content.faqs.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        question: event.target.value
                                      }
                                    : entry
                                )
                              )
                            }
                          />
                        </FormField>
                        <FormField label="Answer" htmlFor={`faq-answer-${index}`}>
                          <Textarea
                            id={`faq-answer-${index}`}
                            rows={3}
                            value={faq.answer}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateFaqs(
                                content.faqs.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        answer: event.target.value
                                      }
                                    : entry
                                )
                              )
                            }
                          />
                        </FormField>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface WorkflowListEditorProps {
  title: string;
  hint: string;
  values: string[];
  onChange: (values: string[]) => void;
  canEdit: boolean;
  placeholder: string;
}

function WorkflowListEditor({
  title,
  hint,
  values,
  onChange,
  canEdit,
  placeholder
}: WorkflowListEditorProps) {
  const [draft, setDraft] = useState("");
  const parsedDraft = useMemo(() => splitLines(draft), [draft]);

  const addDraftLines = () => {
    if (parsedDraft.length === 0) {
      return;
    }

    const nextValues = [...values];
    for (const line of parsedDraft) {
      if (!nextValues.includes(line)) {
        nextValues.push(line);
      }
    }
    onChange(nextValues);
    setDraft("");
  };

  const removeValue = (index: number) => {
    onChange(values.filter((_, valueIndex) => valueIndex !== index));
  };

  const updateValue = (index: number, nextValue: string) => {
    onChange(values.map((value, valueIndex) => (valueIndex === index ? nextValue : value)));
  };

  const normalizeValue = (index: number) => {
    const currentValue = values[index] || "";
    const trimmedValue = currentValue.trim();
    if (!trimmedValue) {
      removeValue(index);
      return;
    }
    if (trimmedValue !== currentValue) {
      onChange(values.map((value, valueIndex) => (valueIndex === index ? trimmedValue : value)));
    }
  };

  const moveValue = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= values.length) {
      return;
    }
    const nextValues = [...values];
    const currentValue = nextValues[index];
    nextValues[index] = nextValues[targetIndex];
    nextValues[targetIndex] = currentValue;
    onChange(nextValues);
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div>
        <h5 className="text-sm font-semibold text-slate-900">{title}</h5>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>

      <FormField label="Input" htmlFor={`${title.toLowerCase().replace(/\s+/g, "-")}-draft`}>
        <Textarea
          id={`${title.toLowerCase().replace(/\s+/g, "-")}-draft`}
          rows={3}
          value={draft}
          disabled={!canEdit}
          placeholder={`${placeholder}\nSatu baris = satu poin`}
          onChange={(event) => setDraft(event.target.value)}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canEdit || parsedDraft.length === 0}
          onClick={addDraftLines}
        >
          {parsedDraft.length > 1 ? `Add ${parsedDraft.length} items` : "Add item"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!canEdit || !draft} onClick={() => setDraft("")}>
          Clear
        </Button>
      </div>

      {values.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
          No items yet.
        </div>
      ) : (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={`${title}-${index}-${value}`} className="flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
              <Input
                value={value}
                disabled={!canEdit}
                onBlur={() => normalizeValue(index)}
                onChange={(event) => updateValue(index, event.target.value)}
              />
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!canEdit || index === 0}
                  onClick={() => moveValue(index, -1)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!canEdit || index === values.length - 1}
                  onClick={() => moveValue(index, 1)}
                >
                  Down
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={!canEdit} onClick={() => removeValue(index)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
