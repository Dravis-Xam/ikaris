import express from 'express'
import { createServer as createHttpServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const app = express()
const httpServer = createHttpServer(app)
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'
const rootDirectory = path.dirname(fileURLToPath(import.meta.url))

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'diana-phone-shop-api' })
})

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found' })
})

if (isProduction) {
  const distDirectory = path.join(rootDirectory, 'dist')

  app.use(express.static(distDirectory))
  app.use((request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      next()
      return
    }

    response.sendFile(path.join(distDirectory, 'index.html'))
  })
} else {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    appType: 'spa',
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
  })

  app.use(vite.middlewares)
}

httpServer.listen(port, host, () => {
  console.log(`Diana Phone Shop is listening at http://${host}:${port}`)
})