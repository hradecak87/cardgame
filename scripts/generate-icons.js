// One-off script (not part of the app bundle) to rasterize scripts/icon-source.svg
// into the PNG sizes required by public/manifest.json for Android/PWA icons.
const path = require('path')
const sharp = require('sharp')

const SOURCE = path.join(__dirname, 'icon-source.svg')
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons')

const sizes = [48, 72, 96, 144, 192, 512]

async function main() {
  for (const size of sizes) {
    const dest = path.join(OUT_DIR, `icon-${size}.png`)
    await sharp(SOURCE).resize(size, size).png().toFile(dest)
    console.log('wrote', dest)
  }

  // Maskable variant: same artwork (safe zone already respected), just a
  // separate manifest entry so Android launchers can apply adaptive-icon
  // masks (circle/squircle/etc.) without clipping the wreath/card/sabres.
  const maskableDest = path.join(OUT_DIR, 'icon-512-maskable.png')
  await sharp(SOURCE).resize(512, 512).png().toFile(maskableDest)
  console.log('wrote', maskableDest)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
