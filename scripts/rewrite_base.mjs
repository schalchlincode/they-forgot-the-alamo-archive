import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Astro prefixes generated assets. Journal media and internal navigation are
// authored as root paths, so prefix those in generated HTML for project Pages.
const [owner, repository] = (process.env.GITHUB_REPOSITORY || '').split('/');
const prefix = owner && repository && repository.toLowerCase() !== `${owner.toLowerCase()}.github.io`
  ? `/${repository}` : '';
if (prefix) {
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) await visit(path);
      else if (item.name.endsWith('.html')) {
        const html = await readFile(path, 'utf8');
        await writeFile(path, html.replace(/(href|src)="\/(?!\/)([^"]*)"/g, (match, attribute, target) =>
          target === prefix.slice(1) || target.startsWith(prefix.slice(1) + '/')
            ? match : `${attribute}="${prefix}/${target}"`));
      }
    }
  }
  await visit(new URL('../dist', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:\/)/, ''));
  console.log(`Adjusted root links for GitHub Pages path ${prefix}/`);
}
