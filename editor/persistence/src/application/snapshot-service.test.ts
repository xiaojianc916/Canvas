import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  createDrawFileHeader,
  parseDrawDocument,
  serializeDrawDocument,
} from './snapshot-service'

function createValidJson(): string {
  return JSON.stringify({
    header: createDrawFileHeader(
      '2026-01-01T00:00:00.000Z',
    ),
    content: {
      document: {},
      session: {},
    },
  })
}

describe('draw snapshot service', () => {
  it('parses and serializes a valid draw container', () => {
    const parsed = parseDrawDocument(
      createValidJson(),
    )

    const serialized =
      serializeDrawDocument(
        parsed.content,
      )

    const reparsed =
      parseDrawDocument(serialized)

    expect(reparsed.header.format).toBe(
      'hybrid-canvas/draw',
    )

    expect(reparsed.header.version).toBe(1)

    expect(reparsed.content).toEqual(
      parsed.content,
    )
  })

  it('rejects a future file version', () => {
    const json = JSON.stringify({
      header: {
        format: 'hybrid-canvas/draw',
        version: 999,
        createdAt:
          '2026-01-01T00:00:00.000Z',
      },
      content: {
        document: {},
        session: {},
      },
    })

    expect(() =>
      parseDrawDocument(json),
    ).toThrow('DRAW_FUTURE_VERSION')
  })

  it('rejects an invalid format identifier', () => {
    const json = JSON.stringify({
      header: {
        format: 'unknown/draw',
        version: 1,
        createdAt:
          '2026-01-01T00:00:00.000Z',
      },
      content: {},
    })

    expect(() =>
      parseDrawDocument(json),
    ).toThrow('DRAW_INVALID_HEADER')
  })

  it('rejects invalid creation timestamps', () => {
    const json = JSON.stringify({
      header: {
        format: 'hybrid-canvas/draw',
        version: 1,
        createdAt: 'not-a-date',
      },
      content: {},
    })

    expect(() =>
      parseDrawDocument(json),
    ).toThrow('DRAW_INVALID_CREATED_AT')
  })

  it('rejects excessive nesting', () => {
    let value = {}

    for (let index = 0; index < 140; index += 1) {
      value = { child: value }
    }

    const json = JSON.stringify({
      header: createDrawFileHeader(),
      content: value,
    })

    expect(() =>
      parseDrawDocument(json),
    ).toThrow('DRAW_DEPTH_EXCEEDED')
  })
})
