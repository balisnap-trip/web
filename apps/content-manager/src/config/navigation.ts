export type CMNavItem = {
  id: string;
  title: string;
  href: string;
  description: string;
  icon: "dashboard" | "catalog" | "publish" | "siteContent";
  match: {
    exact?: string[];
    prefixes?: string[];
  };
};

export const cmNavItems: CMNavItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    href: "/dashboard",
    description: "Overview",
    icon: "dashboard",
    match: {
      prefixes: ["/dashboard"]
    }
  },
  {
    id: "catalog",
    title: "Catalog",
    href: "/catalog",
    description: "Items and variants",
    icon: "catalog",
    match: {
      prefixes: ["/catalog"]
    }
  },
  {
    id: "publish",
    title: "Publish",
    href: "/publish",
    description: "Workflow queue",
    icon: "publish",
    match: {
      prefixes: ["/publish"]
    }
  },
  {
    id: "site-content",
    title: "Site Content",
    href: "/site-content",
    description: "About and blog",
    icon: "siteContent",
    match: {
      prefixes: ["/site-content"]
    }
  }
];
