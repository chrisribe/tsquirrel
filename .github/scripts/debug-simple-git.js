#!/usr/bin/env node

const { simpleGit } = require('simple-git');
const path = require('path');

async function debugSimpleGit() {
  const projectRoot = path.resolve('/home/runner/work/Eventglimpse/Eventglimpse');
  const git = simpleGit(projectRoot);
  
  console.log('=== Debugging simple-git behavior ===');
  
  try {
    // Test 1: Get recent log
    console.log('\n1. Testing log with since parameter:');
    const log = await git.log(['--since', '7 days ago', '--oneline']);
    console.log('Log object:', JSON.stringify(log, null, 2));
    
    console.log('\n2. Latest commit analysis:');
    console.log('log.latest:', log.latest);
    console.log('log.latest?.hash:', log.latest?.hash);
    console.log('typeof log.latest?.hash:', typeof log.latest?.hash);
    
    console.log('\n3. All commits:');
    log.all.forEach((commit, index) => {
      console.log(`Commit ${index}:`, {
        hash: commit.hash,
        message: commit.message,
        hashType: typeof commit.hash,
        hashLength: commit.hash?.length
      });
    });
    
    // Test 2: Get log without since to see format
    console.log('\n4. Testing log without since:');
    const recentLog = await git.log(['-3']);
    console.log('Recent log latest hash:', recentLog.latest?.hash);
    console.log('Recent log all hashes:', recentLog.all.map(c => c.hash));
    
    // Test 3: Test commit existence check
    if (log.all.length > 0) {
      const firstCommitHash = log.all[0].hash;
      console.log('\n5. Testing commit existence:');
      console.log('First commit hash:', firstCommitHash);
      
      try {
        await git.catFile(['-e', firstCommitHash]);
        console.log('Commit exists check: PASSED');
      } catch (error) {
        console.log('Commit exists check: FAILED -', error.message);
      }
      
      // Test show on first commit
      try {
        const show = await git.show([firstCommitHash, '--stat']);
        console.log('Show command works, output length:', show.length);
        console.log('First 200 chars:', show.slice(0, 200));
      } catch (error) {
        console.log('Show command failed:', error.message);
      }
    }
    
  } catch (error) {
    console.error('Error in debugging:', error);
  }
}

debugSimpleGit().catch(console.error);