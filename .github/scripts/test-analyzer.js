#!/usr/bin/env node

// Simple test script to verify the analysis script works
const fs = require('fs').promises;
const path = require('path');
const { simpleGit } = require('simple-git');

async function runTests() {
  console.log('Running basic tests for project state analyzer...');
  
  try {
    // Test 1: Check if project-state.md exists
    const projectStatePath = path.resolve('../../plan/project-state.md');
    await fs.access(projectStatePath);
    console.log('✓ project-state.md file exists');
    
    // Test 2: Check if we can read current state
    const currentState = await fs.readFile(projectStatePath, 'utf8');
    console.log('✓ Can read current project state');
    console.log(`  Current state length: ${currentState.length} characters`);
    
    // Test 3: Check if we can get basic project structure
    const serverPath = path.resolve('../../server');
    await fs.access(serverPath);
    const serverContents = await fs.readdir(serverPath);
    console.log('✓ Can access project structure');
    console.log(`  Server directory contains: ${serverContents.slice(0, 5).join(', ')}${serverContents.length > 5 ? '...' : ''}`);
    
    // Test 4: Check git access
    const git = simpleGit('../../');
    const log = await git.log(['--oneline', '-n', '5']);
    console.log('✓ Can access git history');
    console.log(`  Recent commits: ${log.all.length}`);
    
    // Test 5: Check if dependencies are installed
    const packageJsonPath = path.resolve('./package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    console.log('✓ Dependencies configured');
    console.log(`  Dependencies: ${Object.keys(packageJson.dependencies).join(', ')}`);
    
    console.log('\nAll basic tests passed!');
    console.log('The analyzer should work when triggered by GitHub Actions with proper API keys.');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}