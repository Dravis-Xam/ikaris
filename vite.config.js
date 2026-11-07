import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules\/three\// },
            { name: 'react-three', test: /node_modules\/@react-three\// },
            { name: 'three-helpers', test: /node_modules\/(gsap|maath|meshline|camera-controls)\// },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@vitejs/plugin-react/preamble'],
  },
  plugins: [
    react(),
    {
      name: 'remove-inline-react-preamble',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          return html.replace(/\s*<script type="module">import \{ injectIntoGlobalHook \} from "\/@react-refresh"[\s\S]*?<\/script>/, '')
        },
      },
    },
  ],
})
