export default function SectionContainer({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
      <div className="inline-block max-w-6xl px-8 md:px-8 text-start">
        {children}
      </div>
    </section>
  )
}
