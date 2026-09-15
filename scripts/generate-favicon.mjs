// One-off generator: rasterizes public/logo.svg into a multi-size
// app/favicon.ico (16/32/48 PNG-compressed entries). Re-run with:
//   bun scripts/generate-favicon.mjs
import { writeFileSync } from "node:fs"
import sharp from "sharp"

const SIZES = [16, 32, 48]

const pngs = await Promise.all(
  SIZES.map((size) =>
    sharp("public/logo.svg")
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
  )
)

// ICONDIR: reserved=0, type=1 (ico), count
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(pngs.length, 4)

let offset = 6 + 16 * pngs.length
const entries = pngs.map((png, i) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(SIZES[i], 0) // width
  entry.writeUInt8(SIZES[i], 1) // height
  entry.writeUInt8(0, 2) // palette colors
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8) // data size
  entry.writeUInt32LE(offset, 12) // data offset
  offset += png.length
  return entry
})

writeFileSync("app/favicon.ico", Buffer.concat([header, ...entries, ...pngs]))
console.log(`app/favicon.ico written (${SIZES.join("/")})`)
