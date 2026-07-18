import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: undefined
    }),
    paths: {
      relative: false
    },
    prerender: {
      entries: ["/", "/daehoe"]
    }
  }
};

export default config;
