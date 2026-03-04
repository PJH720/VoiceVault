type MarkdownPreviewProps = {
  content: string
}

export function MarkdownPreview({ content }: MarkdownPreviewProps): React.JSX.Element {
  return (
    <div className="export-preview">
      <pre>{content || 'No preview yet.'}</pre>
    </div>
  )
}
