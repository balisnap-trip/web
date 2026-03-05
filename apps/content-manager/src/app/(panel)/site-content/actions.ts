"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";

type SiteContentScope = "about" | "blog";

function isRedirectSignal(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function readScope(formData: FormData): SiteContentScope {
  const rawScope = formData.get("scope");
  const normalized = typeof rawScope === "string" ? rawScope.trim().toLowerCase() : "";
  return normalized === "blog" ? "blog" : "about";
}

function resolveScopePath(scope: SiteContentScope): string {
  return scope === "blog" ? "/site-content/blog" : "/site-content/about";
}

function redirectWithResult(path: string, result: string, error?: string): never {
  const url = new URL(path, "http://localhost");
  if (result) {
    url.searchParams.set("result", result);
  }
  if (error) {
    url.searchParams.set("error", error);
  }
  redirect(`${url.pathname}${url.search}`);
}

async function requireSiteContentAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    throw new Error("CM_AUTH_REQUIRED");
  }
}

export async function saveSiteContentDraftAction(formData: FormData) {
  try {
    await requireSiteContentAccess();
    const scope = readScope(formData);
    const path = resolveScopePath(scope);
    revalidatePath(path);
    redirectWithResult(path, "SITE_CONTENT_DRAFT_SAVED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult("/site-content", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function submitSiteContentReviewAction(formData: FormData) {
  try {
    await requireSiteContentAccess();
    const scope = readScope(formData);
    const path = resolveScopePath(scope);
    revalidatePath(path);
    redirectWithResult(path, "SITE_CONTENT_SUBMITTED_FOR_REVIEW");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult("/site-content", "FAILED", error instanceof Error ? error.message : String(error));
  }
}
