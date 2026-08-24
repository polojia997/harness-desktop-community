const path = require("node:path");

const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "build", "icon.svg");
const output = path.join(root, "build", "icon.png");

sharp(source)
  .resize(512, 512)
  .png()
  .toFile(output)
  .then(() => {
    console.log(`Generated ${output}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
