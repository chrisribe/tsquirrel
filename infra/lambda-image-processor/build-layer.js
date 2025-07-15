const fs = require('fs');
const archiver = require('archiver');
const { execSync } = require('child_process');

async function buildLayer() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const nameIndex = args.indexOf('--name');
  const layerName = nameIndex !== -1 ? args[nameIndex + 1] : 'sharp';
  const useDocker = args.includes('--docker');
  
  console.log(`${layerName.charAt(0).toUpperCase() + layerName.slice(1)} Layer Packager`);

  if (useDocker) {
    console.log(`📦 Installing ${layerName} dependencies for Amazon Linux with Docker...`);
    try {
      execSync('docker run --rm -v "%cd%\\layer\\nodejs":/app -w /app amazonlinux:2023 bash -c "dnf install -y npm && npm install --arch=x64 --platform=linux"', {
        stdio: 'inherit',
        shell: true,
        timeout: 120000 // 2 minute timeout
      });
      console.log('✅ Docker install complete');
    } catch (error) {
      console.log('❌ Docker install failed:', error.message);
      process.exit(1);
    }
  } else {
    console.log(`📦 Installing ${layerName} locally (Windows binaries - may not work in Lambda)...`);
    try {
      execSync('cd layer/nodejs && npm install', { 
        stdio: 'inherit', 
        shell: true,
        cwd: __dirname
      });
      console.log('✅ Local install complete');
    } catch (error) {
      console.log('❌ Local install failed:', error.message);
      process.exit(1);
    }
  }

  // Create zip using archiver
  console.log('📦 Creating layer zip...');
  
  // Ensure dist directory exists  
  const distDir = 'dist';
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  const outputFile = `${distDir}/${layerName}-layer.zip`;
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ ${layerName.charAt(0).toUpperCase() + layerName.slice(1)} layer created: ${archive.pointer()} bytes`);
      console.log(`🚀 Deploy with: aws lambda publish-layer-version --layer-name ${layerName}-layer --zip-file fileb://${outputFile}`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    output.on('error', (err) => {
      reject(err);
    });

    // Clean up any problematic files first
    try {
      const { execSync } = require('child_process');
      execSync('del /f /q "layer\\nodejs\\node_modules\\.bin\\.semver*" 2>nul', { stdio: 'ignore' });
    } catch (e) {
      // Ignore cleanup errors
    }

    archive.pipe(output);
    
    // Add package files at root level
    archive.file('layer/nodejs/package.json', { name: 'package.json' });
    archive.file('layer/nodejs/package-lock.json', { name: 'package-lock.json' });
    
    // Add only node_modules under nodejs/
    archive.directory('layer/nodejs/node_modules', 'nodejs/node_modules');
    
    archive.finalize();
  });
}

buildLayer().catch(console.error);
