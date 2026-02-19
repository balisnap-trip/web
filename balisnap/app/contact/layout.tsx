export default function AboutLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
      <div className="inline-block w-full max-w-4xl px-4 md:px-8 text-start">
        {children}
      </div>
    </section>
  )
}
