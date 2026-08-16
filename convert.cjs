const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const convertDir = async (dir) => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')) {
      const src = path.join(dir, file);
      const dest = path.join(dir, file.replace(/\.jpe?g$/i, '.jpg')); // Jimp 0.16 doesn't easily do webp, let's just lower quality
      try {
        const image = await Jimp.read(src);
        await image.quality(40).writeAsync(dest);
        console.log(`Compressed ${src}`);
      } catch (err) {
        console.error(`Failed ${src}:`, err.message);
      }
    }
  }
};

const run = async () => {
  await convertDir('public');
  await convertDir('src/assets/images');
};
run();
