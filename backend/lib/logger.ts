import pino from 'pino'
import { loadEnvironment } from '../config/env.js'

const environment = loadEnvironment()

export const logger = pino({
  level: environment.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: ['req.headers.authorization', 'password', 'refreshToken'],
})