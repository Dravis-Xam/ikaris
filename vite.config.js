import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
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
