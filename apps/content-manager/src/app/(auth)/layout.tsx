export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 animate-blob rounded-full bg-blue-400 opacity-20 blur-xl mix-blend-multiply" />
        <div className="animation-delay-2000 absolute -bottom-40 -left-40 h-80 w-80 animate-blob rounded-full bg-purple-400 opacity-20 blur-xl mix-blend-multiply" />
        <div className="animation-delay-4000 absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 animate-blob rounded-full bg-indigo-400 opacity-20 blur-xl mix-blend-multiply" />
      </div>
      <div className="relative z-10 w-full max-w-md px-4">{children}</div>
    </div>
  );
}
