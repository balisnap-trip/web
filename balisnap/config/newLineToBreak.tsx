export const newLineToBreak = (text: string) => {
  // Split text into paragraphs based on newline characters
  const paragraphs = text.split(/\n+/)

  // Wrap each paragraph in a <div> with a class for padding
  const formattedText = paragraphs
    .map((paragraph) => `<p class="pb-2">${paragraph}</p>`)
    .join('')

  return <div dangerouslySetInnerHTML={{ __html: formattedText }} />
}
