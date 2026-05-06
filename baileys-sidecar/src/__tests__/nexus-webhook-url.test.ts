import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNexusWebhookBaseUrl } from '../nexus-webhook-url.js'

describe('normalizeNexusWebhookBaseUrl', () => {
  it('prepends http when scheme is missing', () => {
    assert.equal(normalizeNexusWebhookBaseUrl('nexus-rails-1:3000'), 'http://nexus-rails-1:3000')
    assert.equal(normalizeNexusWebhookBaseUrl('rails:3000'), 'http://rails:3000')
  })

  it('keeps http and https URLs', () => {
    assert.equal(normalizeNexusWebhookBaseUrl('http://rails:3000'), 'http://rails:3000')
    assert.equal(normalizeNexusWebhookBaseUrl('https://app.example.com'), 'https://app.example.com')
  })

  it('strips trailing slashes', () => {
    assert.equal(normalizeNexusWebhookBaseUrl('http://rails:3000/'), 'http://rails:3000')
  })

  it('defaults empty to localhost', () => {
    assert.equal(normalizeNexusWebhookBaseUrl(''), 'http://localhost:3000')
    assert.equal(normalizeNexusWebhookBaseUrl('   '), 'http://localhost:3000')
  })
})
