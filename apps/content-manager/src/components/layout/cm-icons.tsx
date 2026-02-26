import { cn } from "@/lib/utils";

type IconProps = {
  className?: string;
};

function BaseIcon({
  className,
  children
}: IconProps & {
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5", className)}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <BaseIcon className={className}>
      <path d="M4 12h16" />
      <path d="M4 6h16" />
      <path d="M4 18h16" />
    </BaseIcon>
  );
}

export function DashboardIcon({ className }: IconProps) {
  return (
    <BaseIcon className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </BaseIcon>
  );
}

export function CatalogIcon({ className }: IconProps) {
  return (
    <BaseIcon className={className}>
      <path d="M3 7.5L12 3l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 12.5L12 17l9-4.5" />
      <path d="M3 17.5L12 22l9-4.5" />
    </BaseIcon>
  );
}

export function PublishIcon({ className }: IconProps) {
  return (
    <BaseIcon className={className}>
      <path d="m4 12 15-8-4 16-3-6-8-2Z" />
      <path d="M12 14 19 4" />
    </BaseIcon>
  );
}

export function SiteContentIcon({ className }: IconProps) {
  return (
    <BaseIcon className={className}>
      <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
      <circle cx="18" cy="16" r="2" />
    </BaseIcon>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <BaseIcon className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </BaseIcon>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <BaseIcon className={className}>
      <path d="M6.5 9a5.5 5.5 0 1 1 11 0c0 5 2.5 6.5 2.5 6.5h-16S6.5 14 6.5 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </BaseIcon>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <BaseIcon className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </BaseIcon>
  );
}
