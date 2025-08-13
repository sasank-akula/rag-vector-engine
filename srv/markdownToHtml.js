const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

function transformResponseToHTML(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Step 1: Convert Markdown to HTML
  const rawHTML = marked(content);

  // Step 2: Sanitize HTML
  const cleanHTML = sanitizeHtml(rawHTML, {
    allowedTags: [
      'a', 'abbr', 'bdi', 'blockquote', 'br', 'cite', 'code', 'em',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'pre', 'strong', 'span', 'u',
      'dl', 'dt', 'dd', 'ul', 'ol', 'li'
    ],
    allowedAttributes: {
      '*': ['style', 'dir', 'target'],
      'a': ['href', 'style', 'dir', 'target']
    }
  });

  return cleanHTML;
}

module.exports = { transformResponseToHTML };
