import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cwd } from 'node:process'
import { deflateSync } from 'node:zlib'

const root = cwd()
const outputDirectory = path.join(root, 'apps/desktop/src-tauri/icons')

function crc32(buffer) {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc ^= byte

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  const checksum = Buffer.alloc(4)

  length.writeUInt32BE(data.length)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))

  return Buffer.concat([length, typeBuffer, data, checksum])
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function createIconPixels(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const cornerRadius = size * 0.2
  const padding = size * 0.18

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const gradient = (x + y) / Math.max(1, (size - 1) * 2)

      let red = 15 + gradient * 10
      let green = 118 + gradient * 55
      let blue = 110 + gradient * 65
      let alpha = 255

      const dx = Math.max(padding - x, 0, x - (size - padding - 1))
      const dy = Math.max(padding - y, 0, y - (size - padding - 1))

      if (dx > 0 || dy > 0) {
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > cornerRadius * 0.25) {
          alpha = 0
        }
      }

      // 白色画布方块
      const canvasLeft = size * 0.29
      const canvasTop = size * 0.24
      const canvasRight = size * 0.74
      const canvasBottom = size * 0.69

      if (
        x >= canvasLeft &&
        x <= canvasRight &&
        y >= canvasTop &&
        y <= canvasBottom
      ) {
        red = 246
        green = 252
        blue = 251
      }

      // 画布中的青绿色笔划
      const strokeY = size * 0.57 + Math.sin((x / size) * Math.PI * 3) * size * 0.07

      if (
        x >= size * 0.35 &&
        x <= size * 0.68 &&
        Math.abs(y - strokeY) <= Math.max(1, size * 0.022)
      ) {
        red = 18
        green = 155
        blue = 142
      }

      pixels[offset] = clamp(red)
      pixels[offset + 1] = clamp(green)
      pixels[offset + 2] = clamp(blue)
      pixels[offset + 3] = alpha
    }
  }

  return pixels
}

function createPng(size) {
  const pixels = createIconPixels(size)
  const scanlines = Buffer.alloc((size * 4 + 1) * size)

  for (let y = 0; y < size; y += 1) {
    const targetOffset = y * (size * 4 + 1)
    const sourceOffset = y * size * 4

    // PNG filter type: None
    scanlines[targetOffset] = 0
    pixels.copy(scanlines, targetOffset + 1, sourceOffset, sourceOffset + size * 4)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0 // compression
  header[11] = 0 // filter
  header[12] = 0 // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function createIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)

  const entry = Buffer.alloc(16)
  entry[0] = 0 // 0 表示 256px
  entry[1] = 0 // 0 表示 256px
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)

  return Buffer.concat([header, entry, png])
}

function createIcns(png) {
  const iconChunkLength = png.length + 8
  const totalLength = iconChunkLength + 8

  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(totalLength, 4)

  const iconChunkHeader = Buffer.alloc(8)
  iconChunkHeader.write('ic08', 0, 'ascii')
  iconChunkHeader.writeUInt32BE(iconChunkLength, 4)

  return Buffer.concat([header, iconChunkHeader, png])
}

async function main() {
  const png32 = createPng(32)
  const png128 = createPng(128)
  const png256 = createPng(256)

  await mkdir(outputDirectory, { recursive: true })

  await Promise.all([
    writeFile(path.join(outputDirectory, '32x32.png'), png32),
    writeFile(path.join(outputDirectory, '128x128.png'), png128),
    writeFile(path.join(outputDirectory, '128x128@2x.png'), png256),
    writeFile(path.join(outputDirectory, 'icon.ico'), createIco(png256)),
    writeFile(path.join(outputDirectory, 'icon.icns'), createIcns(png256)),
  ])

  console.log('已生成 Tauri 图标：')
  console.log(path.relative(root, outputDirectory))
  console.log('- 32x32.png')
  console.log('- 128x128.png')
  console.log('- 128x128@2x.png')
  console.log('- icon.ico')
  console.log('- icon.icns')
}

main().catch((error) => {
  console.error('生成图标失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})