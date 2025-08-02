#!/usr/bin/env node

// Test the full workflow execution (without actually creating GitHub issues)
const CopilotRequestCreator = require('./create-copilot-request.js');

class TestCopilotRequestCreator extends CopilotRequestCreator {
  constructor() {
    super();
    // Override GitHub operations for testing
    this.owner = 'test-owner';
    this.repo = 'test-repo';
  }
  
  async checkExistingIssues() {
    console.log('🧪 [MOCK] Checking existing issues - returning false (no existing issues)');
    return false;
  }
  
  async getCurrentProjectState() {
    console.log('🧪 [MOCK] Getting current project state');
    return 'Mock project state content for testing';
  }
  
  async getProjectStructure() {
    console.log('🧪 [MOCK] Getting project structure');
    return {
      server: { 'app.js': 'file', routes: { 'users.js': 'file' } },
      db: { 'schema.sql': 'file' },
      dependencies: { express: '^4.17.1', 'simple-git': '^3.0.0' }
    };
  }
  
  async createCopilotIssue(changes, currentState, projectStructure) {
    console.log('🧪 [MOCK] Would create GitHub issue with the following content:');
    console.log('Title: Update project-state.md based on recent changes');
    console.log(`Recent changes: ${changes.commitCount} commits`);
    console.log(`Diff length: ${changes.diff.length} characters`);
    console.log('✅ Issue creation would succeed');
    
    return { number: 123, html_url: 'https://github.com/test-owner/test-repo/issues/123' };
  }
}

async function testFullWorkflow() {
  console.log('=== Testing Full Workflow Execution ===');
  
  // Set mock environment
  process.env.GITHUB_TOKEN = 'mock-token';
  process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
  
  const creator = new TestCopilotRequestCreator();
  
  try {
    await creator.run();
  } catch (error) {
    console.error('❌ Workflow test failed:', error);
  }
}

testFullWorkflow().catch(console.error);