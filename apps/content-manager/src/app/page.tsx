import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (!isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  redirect("/dashboard");
}
