import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

describe('backend foundation', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('serves the liveness endpoint without requiring infrastructure services', async () => {
    const response = await request(createApp()).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', service: 'diana-phone-shop-api' })
  })

  it('reports unconfigured services as not ready', async () => {
    const response = await request(createApp()).get('/api/health/ready')

    expect(response.status).toBe(503)
    expect(response.body.checks).toEqual({ database: 'not_configured', redis: 'not_configured' })
  })

  it('is ready with a healthy primary database when optional Redis is not configured', async () => {
    const databasePool = { async query() { return { rows: [{ '?column?': 1 }] } } }
    const response = await request(createApp({ databasePool: databasePool as never })).get('/api/health/ready')

    expect(response.status).toBe(200)
    expect(response.body.checks).toEqual({ database: 'ready', redis: 'not_configured' })
  })

  it('validates port and secret configuration', async () => {
    const { loadEnvironment } = await import('../config/env.js')

    expect(() => loadEnvironment({ PORT: '70000' })).toThrow()
    expect(() => loadEnvironment({ ACCESS_TOKEN_SECRET: 'too-short' })).toThrow()
    expect(loadEnvironment({ DATABASE_READ_URL: '' }).DATABASE_READ_URL).toBeUndefined()
    expect(() => loadEnvironment({ NODE_ENV: 'production' })).toThrow()
  })

  it('serves the OpenAPI contract', async () => {
    const response = await request(createApp()).get('/api/docs/openapi.json')

    expect(response.status).toBe(200)
    expect(response.body.openapi).toBe('3.1.0')
    expect(response.body.paths['/products']).toBeDefined()
    expect(response.body.paths['/payments/{provider}/webhook']).toBeDefined()
  })
})