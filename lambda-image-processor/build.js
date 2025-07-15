const { createWriteStream } = require('fs');
const archiver = require('archiver');
const { join } = require('path');

console.log('📦 Building Lambda function...');

const output = createWriteStream('lambda-package.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`✅ Created lambda-package.zip (${(archive.pointer() / 1024).toFixed(2)} KB)`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add both index.js and package.json
archive.file('index.js', { name: 'index.js' });
archive.file('package.json', { name: 'package.json' });

archive.finalize();
