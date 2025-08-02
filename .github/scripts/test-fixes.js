#!/usr/bin/env node

// Test the fixed create-copilot-request.js
const CopilotRequestCreator = require('./create-copilot-request.js');

async function testFixes() {
  console.log('=== Testing fixes for create-copilot-request.js ===');
  
  const creator = new CopilotRequestCreator();
  
  try {
    // Test 1: Get recent changes
    console.log('\n1. Testing getRecentChanges:');
    const changes = await creator.getRecentChanges('7 days ago');
    
    if (changes) {
      console.log('✅ Successfully got changes');
      console.log(`Commit count: ${changes.commitCount}`);
      console.log('Recent commits:');
      changes.commits.forEach((commit, index) => {
        console.log(`  ${index + 1}. ${commit.hash.slice(0, 7)}: ${commit.message}`);
      });
      console.log(`Diff length: ${changes.diff.length} characters`);
      
      // Test 2: Significance analysis
      console.log('\n2. Testing shouldCreateRequest:');
      const shouldCreate = await creator.shouldCreateRequest(changes);
      console.log(`Should create request: ${shouldCreate}`);
      
    } else {
      console.log('❌ Failed to get changes');
    }
    
    // Test 3: Test specific scenarios
    console.log('\n3. Testing significance detection scenarios:');
    
    const testScenarios = [
      {
        name: 'Merge commit scenario',
        commits: [{ message: 'Merge pull request #22 from feature-branch' }],
        diff: '',
        commitCount: 1
      },
      {
        name: 'Multiple commits scenario',
        commits: [
          { message: 'fix: typo' },
          { message: 'docs: update readme' },
          { message: 'style: formatting' }
        ],
        diff: '',
        commitCount: 3
      },
      {
        name: 'Single minor commit scenario',
        commits: [{ message: 'fix: typo in comment' }],
        diff: '',
        commitCount: 1
      },
      {
        name: 'Feature commit scenario',
        commits: [{ message: 'feat: add new user authentication' }],
        diff: '/server/auth/new-auth.js',
        commitCount: 1
      }
    ];
    
    for (const scenario of testScenarios) {
      const result = await creator.shouldCreateRequest(scenario);
      console.log(`  ${scenario.name}: ${result ? '✅ Significant' : '❌ Not significant'}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testFixes().catch(console.error);