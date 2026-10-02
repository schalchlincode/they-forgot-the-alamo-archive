// Portable Markdown is the single source of truth for the journal.
export type Entry = {
  slug: string; date: string; title: string; summary: string; body: string[];
  tags: string[]; milestone: boolean; image?: string; imageAlt?: string;
  source: string; sourceType: 'commit' | 'record'; order: number;
};
const posts = import.meta.glob('../journal/*.md', { eager: true }) as Record<string, {frontmatter: Omit<Entry, 'body'>; rawContent: () => string}>;
export const entries: Entry[] = Object.values(posts).map(post => ({
  ...post.frontmatter, body: post.rawContent().trim().split(/\n\s*\n/)
})).sort((a,b) => a.date.localeCompare(b.date) || a.order-b.order);
export const newest = [...entries].reverse().sort((a,b) => b.date.localeCompare(a.date));
