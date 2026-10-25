import { Marked } from "marked";
import hljs from "highlight.js";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugify(input: string): string {
  let s = input
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) s = "post";
  if (s.length > 80) s = s.slice(0, 80).replace(/-+$/g, "") || "post";
  return s;
}

const SAFE_PROTO_RE = /^(?:https?|mailto):|^\/|^#/i;

const marked = new Marked({
  gfm: true,
});

marked.use({
  renderer: {
    html(token: any) {
      return escapeHtml(token.text || "");
    },
    link(token: any) {
      const href = token.href || "";
      const safeHref = SAFE_PROTO_RE.test(href.trim()) ? href : "#";
      const text = token.tokens ? this.parser.parseInline(token.tokens) : escapeHtml(token.text || "");
      const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<a href="${escapeHtml(safeHref)}"${titleAttr}>${text}</a>`;
    },
    image(token: any) {
      const href = token.href || "";
      const safeHref = SAFE_PROTO_RE.test(href.trim()) ? href : "";
      const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(token.text || "")}"${titleAttr}>`;
    },
    code(token: any) {
      const lang = token.lang;
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(token.text, { language: lang }).value;
          return `<pre><code class="hljs language-${escapeHtml(lang)}">${highlighted}</code></pre>`;
        } catch {
          return `<pre><code class="hljs">${escapeHtml(token.text)}</code></pre>`;
        }
      }
      try {
        const auto = hljs.highlightAuto(token.text);
        return `<pre><code class="hljs">${auto.value}</code></pre>`;
      } catch {
        return `<pre><code class="hljs">${escapeHtml(token.text)}</code></pre>`;
      }
    },
    heading(token: any) {
      const text = token.text || "";
      const id = slugify(text);
      const content = token.tokens ? this.parser.parseInline(token.tokens) : escapeHtml(text);
      return `<h${token.depth} id="${escapeHtml(id)}">${content}</h${token.depth}>\n`;
    },
  },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md || "") as string;
}

export function deriveSummary(md: string, maxChars = 280): string {
  if (!md) return "";
  // Strip code fences
  const text = md.replace(/```[\s\S]*?```/g, " ");
  // Split into paragraphs by blank lines
  const paragraphs = text.split(/\n\s*\n/);
  // Find the first paragraph with non-heading content
  let para = "";
  for (const rawP of paragraphs) {
    const lines = rawP.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const nonHeadingLines = lines.filter((l) => !l.startsWith("#"));
    if (nonHeadingLines.length > 0) {
      para = nonHeadingLines.join(" ");
      break;
    }
  }
  // If only heading lines exist, fall back to stripped headings
  if (!para) {
    const firstP = paragraphs.find((p) => p.trim().length > 0) || "";
    para = firstP.replace(/^#{1,6}\s+/gm, "");
  }

  // Strip inline markdown syntax
  para = para
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1 ")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/[*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (para.length <= maxChars) {
    return para;
  }

  // Cut cleanly at word boundary
  const truncated = para.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated.trim();
}

export function toMarkdownDocument(doc: { frontmatter: Record<string, string | number | boolean | null | undefined>; body: string }): string {
  const lines: string[] = [];
  lines.push("---");
  const fm = doc.frontmatter || {};
  // stable order as written conceptually; iterate keys
  const keys = Object.keys(fm);
  for (const k of keys) {
    const v = fm[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean") {
      lines.push(`${k}: ${v ? "true" : "false"}`);
      continue;
    }
    if (typeof v === "number") {
      lines.push(`${k}: ${v}`);
      continue;
    }
    const strVal = String(v);
    if (k === "canonical" || strVal.startsWith("/") || /[\r\n:#"']/.test(strVal)) {
      lines.push(`${k}: ${JSON.stringify(strVal)}`);
      continue;
    }
    lines.push(`${k}: ${strVal}`);
  }
  lines.push("---");
  lines.push("");
  lines.push(doc.body || "");
  return lines.join("\n");
}
