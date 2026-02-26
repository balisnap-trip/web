import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SiteContentTabs } from "@/components/site-content/site-content-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableShell, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";

const posts = [
  {
    id: "BLOG-1001",
    title: "7 Sunrise Spots in Bali for First-Time Travelers",
    slug: "sunrise-spots-bali",
    status: "PUBLISHED",
    author: "Content Team",
    updatedAt: "2026-02-18T10:15:00.000Z"
  },
  {
    id: "BLOG-1002",
    title: "How to Pick the Right Bali Tour Package",
    slug: "how-to-pick-bali-tour-package",
    status: "IN_REVIEW",
    author: "Content Team",
    updatedAt: "2026-02-20T06:45:00.000Z"
  },
  {
    id: "BLOG-1003",
    title: "What to Pack for a Nusa Penida Day Trip",
    slug: "nusa-penida-packing-list",
    status: "DRAFT",
    author: "Ops Writer",
    updatedAt: "2026-02-21T14:25:00.000Z"
  }
] as const;

const statusTone = {
  DRAFT: "warning",
  IN_REVIEW: "secondary",
  PUBLISHED: "success"
} as const;

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

export default async function SiteContentBlogPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-orange-50">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Site Content / Blog
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Blog Story Manager</h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Editorial flow: content ideation, draft, review, and publish with a consistent article structure.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/site-content">Back to overview</Link>
              </Button>
              <Button type="button" size="sm">
                Save draft (UI)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <SiteContentTabs />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Content Queue</CardTitle>
              <CardDescription>List of articles and editorial process status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="grid gap-3 md:grid-cols-4">
                <FormField className="md:col-span-2" label="Search post" htmlFor="blog-search">
                  <Input id="blog-search" placeholder="Search title or slug" />
                </FormField>
                <FormField label="Status" htmlFor="blog-status">
                  <Select id="blog-status" defaultValue="ALL">
                    <option value="ALL">ALL</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="IN_REVIEW">IN_REVIEW</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                  </Select>
                </FormField>
                <div className="flex items-end">
                  <Button type="button" variant="outline" className="w-full">
                    Apply
                  </Button>
                </div>
              </form>

              <DataTableShell className="shadow-none">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Author</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((post) => (
                      <TableRow key={post.id} className="hover:bg-slate-50/80">
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-slate-900">{post.title}</p>
                            <p className="text-xs text-slate-500">{post.id}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">{post.slug}</TableCell>
                        <TableCell>
                          <StatusBadge
                            label={post.status}
                            tone={statusTone[post.status as keyof typeof statusTone]}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">{post.author}</TableCell>
                        <TableCell className="text-xs text-slate-600">{formatDateTime(post.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTableShell>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Story Composer</CardTitle>
              <CardDescription>Template fields for blog posts or blog stories.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Headline" htmlFor="blog-headline">
                <Input id="blog-headline" placeholder="How to..." />
              </FormField>
              <FormField label="Slug" htmlFor="blog-slug">
                <Input id="blog-slug" placeholder="how-to-..." />
              </FormField>
              <FormField label="Excerpt" htmlFor="blog-excerpt">
                <Textarea id="blog-excerpt" rows={3} placeholder="Short summary in 1-2 sentences." />
              </FormField>
              <FormField label="Tags (comma separated)" htmlFor="blog-tags">
                <Input id="blog-tags" placeholder="bali tips, itinerary, culture" />
              </FormField>
              <FormField label="Cover image URL" htmlFor="blog-cover-url">
                <Input id="blog-cover-url" placeholder="/uploads/site/blog-cover.jpg" />
              </FormField>
              <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600 hover:bg-slate-100">
                <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" />
                Upload cover image
              </label>
              <FormField label="Main content" htmlFor="blog-content">
                <Textarea
                  id="blog-content"
                  rows={8}
                  placeholder="Write article content with intro, insights, practical tips, and CTA."
                />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <Button type="button" variant="outline">
                  Submit for review
                </Button>
                <Button type="button">Save draft</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">SEO Block</CardTitle>
              <CardDescription>Separate SEO fields so they do not mix with main copy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField label="Meta title" htmlFor="blog-meta-title">
                <Input id="blog-meta-title" placeholder="Meta title (max 60 chars)" />
              </FormField>
              <FormField label="Meta description" htmlFor="blog-meta-description">
                <Textarea id="blog-meta-description" rows={3} placeholder="Meta description (max 160 chars)" />
              </FormField>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
