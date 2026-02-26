import { withAuth } from "next-auth/middleware";

const readAllowedRoles = () => {
  const raw = process.env.CM_ALLOWED_ROLES?.trim();
  if (!raw) {
    return ["ADMIN", "MANAGER", "STAFF"];
  }
  const parsed = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : ["ADMIN", "MANAGER", "STAFF"];
};

export default withAuth({
  callbacks: {
    authorized: ({ token }) => {
      if (!token) {
        return false;
      }
      const role = String(token.role || "").toUpperCase();
      return role ? readAllowedRoles().includes(role) : false;
    }
  },
  pages: {
    signIn: "/login"
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/catalog/:path*", "/publish/:path*", "/site-content/:path*"]
};
