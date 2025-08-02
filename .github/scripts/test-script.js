#!/usr/bin/env node

// Test script to debug the issue with create-copilot-request.js
const { simpleGit } = require('simple-git');
const path = require('path');

async function testGitOperations() {
  const projectRoot = path.resolve('/home/runner/work/Eventglimpse/Eventglimpse');
  const git = simpleGit(projectRoot);
  
  console.log('Testing git operations...');
  
  try {
    // Test getting recent commits 
    const log = await git.log(['--since', '24 hours ago', '--oneline']);
    console.log(`Found ${log.all.length} commits in last 24 hours:`);
    log.all.forEach(commit => {
      console.log(`  ${commit.hash.slice(0, 7)}: ${commit.message}`);
    });
    
    if (log.all.length === 0) {
      console.log('No commits in last 24 hours, trying last 7 days...');
      const weekLog = await git.log(['--since', '7 days ago', '--oneline']);
      console.log(`Found ${weekLog.all.length} commits in last 7 days:`);
      weekLog.all.slice(0, 5).forEach(commit => {
        console.log(`  ${commit.hash.slice(0, 7)}: ${commit.message}`);
      });
    }
    
    // Test diff operations
    console.log('\nTesting diff operations...');
    const latestCommit = log.latest?.hash;
    if (latestCommit && log.all.length > 0) {
      console.log(`Latest commit: ${latestCommit}`);
      
      try {
        // Try to get diff
        const fromCommitRef = `${latestCommit}~${log.all.length}`;
        console.log(`Trying to get diff from ${fromCommitRef} to ${latestCommit}`);
        
        // Check if from commit exists
        await git.catFile(['-e', fromCommitRef]);
        console.log('From commit exists, getting diff...');
        
        const diff = await git.diff([fromCommitRef, latestCommit]);
        console.log(`Diff length: ${diff.length} characters`);
        console.log('First 500 chars of diff:');
        console.log(diff.slice(0, 500));
        
      } catch (error) {
        console.log('Error getting diff:', error.message);
        
        // Try alternative approach
        try {
          console.log('Trying alternative - single commit show:');
          const show = await git.show([latestCommit]);
          console.log(`Show output length: ${show.length} characters`);
          console.log('First 500 chars of show:');
          console.log(show.slice(0, 500));
        } catch (showError) {
          console.log('Show also failed:', showError.message);
        }
      }
    }
    
  } catch (error) {
    console.error('Git operation failed:', error);
  }
}

// Test the significance analysis
function testSignificanceAnalysis() {
  console.log('\nTesting significance analysis...');
  
  const significantKeywords = [
    'feature', 'add', 'new', 'create', 'implement', 'architecture', 
    'database', 'schema', 'migration', 'api', 'endpoint', 'route',
    'dependency', 'package', 'install', 'security', 'auth', 'deploy'
  ];

  // Test cases
  const testMessages = [
    'Merge pull request #22 from chrisribe/multi-photo-upload-n-refactors',
    'fix: minor typo in readme',
    'feat: add new user authentication system',
    'chore: update dependencies',
    'refactor: improve code structure'
  ];
  
  testMessages.forEach(message => {
    const hasSignificantChanges = significantKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
    console.log(`Message: "${message}" -> Significant: ${hasSignificantChanges}`);
  });
}

async function main() {
  await testGitOperations();
  testSignificanceAnalysis();
}

main().catch(console.error);