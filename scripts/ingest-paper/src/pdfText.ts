import fs from 'node:fs/promises';
// Deliberately pinned to the pdf-parse 1.x line (not the 2.x rewrite) for its
// long-stable, well-documented `pagerender` callback API used below.
import pdfParse from 'pdf-parse';

export interface PageText {
  pageNumber: number;
  text: string;
}

/**
 * Page-mapped text extraction. This is used for reference/debug output only --
 * the actual segmentation calls send the native PDF to Claude (see
 * claudeSegment.ts) because plain text extraction mangles IB math notation
 * and cannot see diagrams.
 */
export async function extractPdfPages(filePath: string): Promise<PageText[]> {
  const buf = await fs.readFile(filePath);
  const pages: PageText[] = [];

  await pdfParse(buf, {
    pagerender: async (pageData: {
      getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    }) => {
      const content = await pageData.getTextContent();
      const text = content.items.map((item) => item.str ?? '').join(' ');
      pages.push({ pageNumber: pages.length + 1, text });
      return text;
    },
  });

  return pages;
}

export async function extractPdfFullText(filePath: string): Promise<string> {
  const pages = await extractPdfPages(filePath);
  return pages.map((p) => `--- page ${p.pageNumber} ---\n${p.text}`).join('\n\n');
}
