import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";
import { listCatalogPublishJobs } from "@/lib/core-api";
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
  }>;
}

export default async function PublishPage({ searchParams }: PublishPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const resolvedSearchParams = (await searchParams) || {};
  let jobs = [] as Awaited<ReturnType<typeof listCatalogPublishJobs>>;
  let loadError = "";

  try {
    jobs = await listCatalogPublishJobs(100);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <main className="min-h-screen bg-muted">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Publish Workflow</h1>
            <p className="text-sm text-muted-foreground">
              Workflow `draft {"->"} in_review {"->"} published` + retry failed.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/catalog" className="text-primary hover:underline">
              Catalog
            </Link>
            <Link href="/dashboard" className="text-primary hover:underline">
              Dashboard
            </Link>
          </div>
        </header>

        {resolvedSearchParams.result ? (
          <Card>
            <CardContent className="pt-6 text-sm text-emerald-700">Result: {resolvedSearchParams.result}</CardContent>
          </Card>
        ) : null}

        {resolvedSearchParams.error ? (
          <Card>
            <CardContent className="pt-6 text-sm text-red-700">Error: {resolvedSearchParams.error}</CardContent>
          </Card>
        ) : null}

        {loadError ? (
          <Card>
            <CardContent className="pt-6 text-sm text-red-700">Error load jobs: {loadError}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Create Publish Draft</CardTitle>
            <CardDescription>
              Kosongkan `itemIds` untuk publish semua item aktif. Pisahkan UUID dengan koma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCatalogPublishJobAction} className="space-y-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Item IDs (optional)</span>
                <textarea
                  name="itemIds"
                  rows={3}
                  placeholder="uuid-1,uuid-2"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Note</span>
                <input
                  name="note"
                  placeholder="Release note / scope"
                  className="h-10 w-full rounded-lg border border-input bg-background px-3"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Create draft
              </button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publish Jobs</CardTitle>
            <CardDescription>Riwayat job publish terbaru.</CardDescription>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No publish jobs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-2 py-2 text-left">Job ID</th>
                      <th className="px-2 py-2 text-left">Status</th>
                      <th className="px-2 py-2 text-left">Items</th>
                      <th className="px-2 py-2 text-left">Updated</th>
                      <th className="px-2 py-2 text-left">Snapshot</th>
                      <th className="px-2 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.jobId} className="border-b align-top">
                        <td className="px-2 py-2">{job.jobId}</td>
                        <td className="px-2 py-2">{job.status}</td>
                        <td className="px-2 py-2">{job.itemCount}</td>
                        <td className="px-2 py-2">{job.updatedAt}</td>
                        <td className="px-2 py-2">{job.snapshotPath || "-"}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-2">
                            {job.status === "DRAFT" ? (
                              <form action={submitCatalogPublishReviewAction}>
                                <input type="hidden" name="jobId" value={job.jobId} />
                                <button type="submit" className="rounded border border-input px-2 py-1 text-xs">
                                  Submit review
                                </button>
                              </form>
                            ) : null}

                            {job.status === "IN_REVIEW" ? (
                              <form action={publishCatalogJobAction}>
                                <input type="hidden" name="jobId" value={job.jobId} />
                                <button
                                  type="submit"
                                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                                >
                                  Publish
                                </button>
                              </form>
                            ) : null}

                            {job.status === "FAILED" ? (
                              <form action={retryCatalogPublishJobAction}>
                                <input type="hidden" name="jobId" value={job.jobId} />
                                <button
                                  type="submit"
                                  className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                                >
                                  Retry
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
