const { createWriteStream, mkdirSync } = require('fs');
const archiver = require('archiver');

console.log('📦 Building Lambda function...');

// Ensure dist directory exists
mkdirSync('dist', { recursive: true });

const output = createWriteStream('dist/lambda-package.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`✅ Created dist/lambda-package.zip (${(archive.pointer() / 1024).toFixed(2)} KB)`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add both index.js and package.json
archive.file('index.js', { name: 'index.js' });
archive.file('package.json', { name: 'package.json' });

archive.finalize();
