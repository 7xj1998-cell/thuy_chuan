const fs = require('node:fs');
const path = require('node:path');

const sharp = require(process.argv[2] || 'sharp');
const root = path.resolve(process.argv[3] || process.cwd());
const icon = fs.readFileSync(path.join(root, 'brand/level-mark.svg'));
const symbol = fs.readFileSync(path.join(root, 'brand/level-mark-symbol.svg'));

async function rgbIcon(size, output) {
  await sharp(icon)
    .resize(size, size)
    .flatten({ background: '#102A43' })
    .removeAlpha()
    .png()
    .toFile(output);
}

async function generate() {
  for (const size of [32, 48, 64, 192, 512, 1024]) {
    await rgbIcon(size, path.join(root, `public/icon-${size}.png`));
  }
  await rgbIcon(180, path.join(root, 'public/apple-touch-icon.png'));
  await rgbIcon(1024, path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));

  const densities = {
    mdpi: [48, 108],
    hdpi: [72, 162],
    xhdpi: [96, 216],
    xxhdpi: [144, 324],
    xxxhdpi: [192, 432],
  };
  for (const [density, [baseSize, foregroundSize]] of Object.entries(densities)) {
    const directory = path.join(root, `android/app/src/main/res/mipmap-${density}`);
    await rgbIcon(baseSize, path.join(directory, 'ic_launcher.png'));
    const full = await sharp(icon).resize(baseSize, baseSize).flatten({ background: '#102A43' }).png().toBuffer();
    const mask = Buffer.from(`<svg width="${baseSize}" height="${baseSize}"><circle cx="${baseSize / 2}" cy="${baseSize / 2}" r="${baseSize / 2}" fill="white"/></svg>`);
    await sharp(full).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(directory, 'ic_launcher_round.png'));
    await sharp(symbol).resize(foregroundSize, foregroundSize, { fit: 'contain' }).png().toFile(path.join(directory, 'ic_launcher_foreground.png'));
  }

  const resourceDirectory = path.join(root, 'android/app/src/main/res');
  const splashFiles = [
    'android/app/src/main/res/drawable/splash.png',
    ...fs.readdirSync(resourceDirectory)
      .filter((name) => name.startsWith('drawable-port-') || name.startsWith('drawable-land-'))
      .map((name) => `android/app/src/main/res/${name}/splash.png`),
    'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png',
    'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png',
    'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png',
  ];
  for (const relativePath of splashFiles) {
    const output = path.join(root, relativePath);
    const metadata = await sharp(output).metadata();
    const size = Math.round(Math.min(metadata.width, metadata.height) * 0.34);
    const mark = await sharp(symbol).resize(size, size).png().toBuffer();
    const temporary = `${output}.new`;
    await sharp({ create: { width: metadata.width, height: metadata.height, channels: 3, background: '#102A43' } })
      .composite([{ input: mark, left: Math.round((metadata.width - size) / 2), top: Math.round((metadata.height - size) / 2) }])
      .png()
      .toFile(temporary);
    fs.renameSync(temporary, output);
  }
}

generate()
  .then(() => console.log('Generated Level Mark web, Android and iOS assets.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
