import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// Generates the PWA PNG icon set (192/512 + maskable + apple-touch) from the
// single source SVG. Regenerate with `npm run generate-pwa-assets` and commit
// the produced PNGs in public/. The vite-plugin-pwa manifest references them.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
})
