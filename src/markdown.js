/**
 * Lightweight Markdown → HTML renderer
 * Handles: h2/h3, bold, code, blockquote, ul, hr, paragraphs
 * Does NOT use any external dependency
 */
export function renderMarkdown(text) {
  if (!text) return ''

  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

    // Headings
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')

    // Horizontal rule
    .replace(/^(?:---|\*\*\*|═{3,})$/gm, '<hr/>')

    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')

    // Blockquotes
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')

    // List items
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')

    // Wrap consecutive <li> groups in <ul>
    .replace(/(<li>[\s\S]*?<\/li>)(\s*<li>[\s\S]*?<\/li>)*/g, m => `<ul>${m}</ul>`)

    // Paragraphs — wrap lines not already in a block tag
    .split(/\n{2,}/)
    .map(block => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (/^<[hbucol]/.test(trimmed)) return trimmed
      return `<p>${trimmed.replace(/\n/g, ' ')}</p>`
    })
    .join('\n')

  return html
}
