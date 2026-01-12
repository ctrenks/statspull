const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'build', 'icon.svg');
const pngPath = path.join(__dirname, '..', 'build', 'icon.png');

// Read SVG and convert to 1024x1024 PNG
const svgBuffer = fs.readFileSync(svgPath);

sharp(svgBuffer)
  .resize(1024, 1024)
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log('✅ Generated icon.png (1024x1024)');
    console.log('   Location:', pngPath);
  })
  .catch(err => {
    console.error('❌ Error generating icon:', err);
    process.exit(1);
  });
