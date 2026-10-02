import { defineConfig } from 'astro/config';
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const owner = process.env.GITHUB_REPOSITORY?.split('/')[0];
const base = repository && owner && repository.toLowerCase() !== `${owner.toLowerCase()}.github.io` ? `/${repository}/` : '/';
export default defineConfig({ output: 'static', site: owner ? `https://${owner}.github.io` : 'http://localhost', base });
