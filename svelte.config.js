import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: [vitePreprocess({})],
    kit: {
        // the archive is fully static: every page is prerendered from src/lib/data/*.json
        adapter: adapter({ fallback: "404.html" }),
        prerender: { handleHttpError: "warn" },
    },
};

export default config;
