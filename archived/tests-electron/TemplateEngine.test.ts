import { describe, expect, it } from 'vitest'
import { TemplateEngine } from '../../src/main/services/TemplateEngine'

describe('TemplateEngine', () => {
  it('renders variables and helpers', () => {
    const engine = new TemplateEngine()
    engine.loadTemplate(
      'basic',
      '# {{title}}\n{{formatDate date}}\n{{formatDuration duration}}\n{{wikilink title}}'
    )
    const output = engine.render('basic', {
      title: 'Sprint Review',
      date: '2026-03-04T00:00:00.000Z',
      duration: 125,
      transcript: []
    })
    expect(output).toContain('# Sprint Review')
    expect(output).toContain('2026-03-04')
    expect(output).toContain('2m 5s')
    expect(output).toContain('[[Sprint Review]]')
  })
})
