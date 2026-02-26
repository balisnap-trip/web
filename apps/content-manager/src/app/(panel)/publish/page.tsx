import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DataTableShell,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { authOptions } from "@/lib/auth";
import { getPublishStatusMeta } from "@/lib/catalog-status";
import { listCatalogPublishJobs, type CatalogPublishJobDto } from "@/lib/core-api";
import {
  canEditCatalog,
  canPublishCatalog,
  canRetryPublish,
  canSubmitPublishReview,
  isAllowedRole
} from "@/lib/roles";
import {
  createCatalogPublishJobAction,
  publishCatalogJobAction,
  retryCatalogPublishJobAction,
  submitCatalogPublishReviewAction
} from "../catalog/actions";

interface PublishPageProps {
  searchParams?: Promise<{
    result?: string;
    error?: string;
    status?: string;
  }>;
}

const publishStatusOptions = ["ALL", "DRAFT", "IN_REVIEW", "PUBLISHED", "FAILED"] as const;

function buildPublishSummary(jobs: CatalogPublishJobDto[]) {
  return jobs.reduce(
    (summary, job) => {
      summary[job.status] += 1;
      return summary;
    },
    {
      DRAFT: 0,
      IN_REVIEW: 0,
      PUBLISHED: 0,
      FAILED: 0
    }
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatAllowed(isAllowed: boolean) {
  return isAllowed ? "allowed" : "not allowed";
}

export default async function PublishPage({ searchParams }: PublishPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const resolvedSearchParams = (await searchParams) || {};
  const rawStatusFilter = (resolvedSearchParams.status || "ALL").trim().toUpperCase();
  const statusFilter = publishStatusOptions.includes(rawStatusFilter as (typeof publishStatusOptions)[number])
    ? (rawStatusFilter as (typeof publishStatusOptions)[number])
    : "ALL";

  const role = session.user.role || "";
  const actor = `${session.user.email || ""}`.trim() || `${session.user.id || ""}`.trim() || "content-manager";
  const canCreateDraft = canEditCatalog(role);
  const canSubmitReview = canSubmitPublishReview(role);
  const canPublish = canPublishCatalog(role);
  const canRetry = canRetryPublish(role);

  let jobs = [] as CatalogPublishJobDto[];
  let loadError = "";

  try {
    jobs = await listCatalogPublishJobs(100, { actor });
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  const publishSummary = buildPublishSummary(jobs);
  const visibleJobs = statusFilter === "ALL" ? jobs : jobs.filter((job) => job.status === statusFilter);

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Publish Control
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Publish Workflow</h1>
              <p className="text-sm text-slate-600">
                Workflow `draft -&gt; in_review -&gt; published` with retry for failed jobs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button asChild size="sm" variant="outline">
                <Link href="/catalog">Catalog</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/site-content">Site content</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {resolvedSearchParams.result ? (
        <Card className="border-emerald-200 bg-emerald-50/80">
          <CardContent className="pt-6 text-sm text-emerald-700">Result: {resolvedSearchParams.result}</CardContent>
        </Card>
      ) : null}

      {resolvedSearchParams.error ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="pt-6 text-sm text-red-700">Error: {resolvedSearchParams.error}</CardContent>
        </Card>
      ) : null}

      {loadError ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="pt-6 text-sm text-red-700">Error load jobs: {loadError}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-l-4 border-l-slate-500">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Jobs</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{jobs.length}</p>
            <p className="mt-1 text-xs text-slate-500">Latest 100 rows</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Draft / Review</p>
            <p className="mt-2 text-2xl font-bold text-blue-600">
              {publishSummary.DRAFT} / {publishSummary.IN_REVIEW}
            </p>
            <p className="mt-1 text-xs text-slate-500">In progress jobs</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Published</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{publishSummary.PUBLISHED}</p>
            <p className="mt-1 text-xs text-slate-500">Ready for downstream readers</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Failed</p>
            <p className="mt-2 text-2xl font-bold text-red-600">{publishSummary.FAILED}</p>
            <p className="mt-1 text-xs text-slate-500">Needs retry or scope fix</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Create draft</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatAllowed(canCreateDraft)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Submit review</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatAllowed(canSubmitReview)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Publish</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatAllowed(canPublish)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Retry failed</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatAllowed(canRetry)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <form className="grid gap-3 md:grid-cols-3">
              <FormField label="Status" htmlFor="publish-filter-status">
                <Select id="publish-filter-status" name="status" defaultValue={statusFilter}>
                  {publishStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="md:col-span-2 flex items-end gap-2">
                <Button type="submit" variant="outline">
                  Apply filter
                </Button>
                <Button asChild type="button" variant="ghost">
                  <Link href="/publish">Reset</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <form action={createCatalogPublishJobAction} className="space-y-3">
              <FormField
                label="Item IDs (optional)"
                htmlFor="publish-create-item-ids"
                hint="Leave empty to publish all active items. Separate UUIDs with commas."
              >
                <Textarea id="publish-create-item-ids" name="itemIds" rows={3} placeholder="uuid-1,uuid-2" />
              </FormField>
              <FormField label="Note" htmlFor="publish-create-note">
                <Input id="publish-create-note" name="note" placeholder="Release note / scope" />
              </FormField>
              <Button type="submit" disabled={!canCreateDraft}>
                Create draft
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <DataTableShell>
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Publish Jobs</h2>
            <p className="text-xs text-slate-500">Filter status: {statusFilter}</p>
          </div>
        </div>

        {visibleJobs.length === 0 ? (
          <div className="p-4">
            <TableEmpty>{jobs.length === 0 ? "No publish jobs yet." : "No jobs match selected status."}</TableEmpty>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead>Job ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Snapshot</TableHead>
                <TableHead>Failure</TableHead>
                <TableHead className="w-[180px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleJobs.map((job) => {
                const statusMeta = getPublishStatusMeta(job.status);
                return (
                  <TableRow key={job.jobId} className="hover:bg-slate-50/80">
                    <TableCell className="font-mono text-xs">{job.jobId}</TableCell>
                    <TableCell>
                      <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                    </TableCell>
                    <TableCell className="text-sm font-medium">{job.itemCount}</TableCell>
                    <TableCell className="text-xs">
                      <p>c: {job.createdBy || "-"}</p>
                      <p>r: {job.reviewedBy || "-"}</p>
                      <p>p: {job.publishedBy || "-"}</p>
                    </TableCell>
                    <TableCell className="text-xs">{formatDateTime(job.updatedAt)}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs">{job.snapshotPath || "-"}</TableCell>
                    <TableCell className="max-w-[260px] text-xs text-red-700">{job.failureReason || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {job.status === "DRAFT" ? (
                          <form action={submitCatalogPublishReviewAction}>
                            <input type="hidden" name="jobId" value={job.jobId} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              disabled={!canSubmitReview}
                              title={canSubmitReview ? undefined : "Your role is not allowed to submit review"}
                            >
                              Submit review
                            </Button>
                          </form>
                        ) : null}

                        {job.status === "IN_REVIEW" ? (
                          <form action={publishCatalogJobAction}>
                            <input type="hidden" name="jobId" value={job.jobId} />
                            <Button
                              type="submit"
                              size="sm"
                              disabled={!canPublish}
                              title={canPublish ? undefined : "Your role is not allowed to publish"}
                            >
                              Publish
                            </Button>
                          </form>
                        ) : null}

                        {job.status === "FAILED" ? (
                          <form action={retryCatalogPublishJobAction}>
                            <input type="hidden" name="jobId" value={job.jobId} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="secondary"
                              disabled={!canRetry}
                              title={canRetry ? undefined : "Your role is not allowed to retry"}
                            >
                              Retry
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataTableShell>
    </section>
  );
}
