import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { isAllowedRole, readAllowedRoles } from "@/lib/roles";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (!isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const allowedRoles = readAllowedRoles().join(", ");

  return (
    <main className="min-h-screen bg-muted">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Content Manager Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            EP-010 scaffold aktif. Login + RBAC berjalan untuk role: {allowedRoles}.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Catalog Editor</CardTitle>
              <CardDescription>CRUD item/variant/rate aktif dari endpoint catalog core-api.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Kelola draft konten katalog sebelum masuk workflow publish.</p>
              <Link href="/catalog" className="font-medium text-primary hover:underline">
                Open catalog editor
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Publish Workflow</CardTitle>
              <CardDescription>
                Draft {"->"} in_review {"->"} published + retry failed job.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Payload publish versioned disimpan sebagai evidence artifacts.</p>
              <Link href="/publish" className="font-medium text-primary hover:underline">
                Open publish workflow
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session Info</CardTitle>
              <CardDescription>Verifikasi RBAC aktif untuk user login.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="font-medium">User:</span> {session.user.email || "-"}
              </p>
              <p>
                <span className="font-medium">Role:</span> {session.user.role || "-"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
