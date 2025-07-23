#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { simpleGit } = require('simple-git');
const { Octokit } = require('@octokit/rest');

class CopilotRequestCreator {
  constructor() {
    this.git = simpleGit('../../');
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
    this.projectRoot = path.resolve('../../');
    this.projectStatePath = path.join(this.projectRoot, 'plan/project-state.md');
    
    // Get repository info from environment or git remote
    this.owner = process.env.GITHUB_REPOSITORY?.split('/')[0];
    this.repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  }

  async getRecentChanges(since = '24 hours ago') {
    try {
      // Get commits since last project-state.md update or last 24 hours
      const log = await this.git.log(['--since', since, '--oneline']);
      
      if (log.all.length === 0) {
        console.log('No recent changes found');
        return null;
      }

      // Get detailed diff for analysis
      const latestCommit = log.latest?.hash;
      if (!latestCommit) {
        return null;
      }

      // Get diff of recent changes
      const diff = await this.git.diff([`${latestCommit}~${log.all.length}`, latestCommit]);
      
      return {
        commits: log.all,
        diff: diff,
        commitCount: log.all.length
      };
    } catch (error) {
      console.error('Error getting recent changes:', error);
      return null;
    }
  }

  async getCurrentProjectState() {
    try {
      const content = await fs.readFile(this.projectStatePath, 'utf8');
      return content;
    } catch (error) {
      console.error('Error reading project-state.md:', error);
      throw error;
    }
  }

  async getProjectStructure() {
    try {
      // Get key directories and files for context
      const serverStructure = await this.getDirectoryStructure(path.join(this.projectRoot, 'server'));
      const dbStructure = await this.getDirectoryStructure(path.join(this.projectRoot, 'db'));
      const packageJson = await fs.readFile(path.join(this.projectRoot, 'server/package.json'), 'utf8');
      
      return {
        server: serverStructure,
        db: dbStructure,
        dependencies: JSON.parse(packageJson).dependencies
      };
    } catch (error) {
      console.error('Error getting project structure:', error);
      return null;
    }
  }

  async getDirectoryStructure(dirPath, maxDepth = 2, currentDepth = 0) {
    try {
      if (currentDepth >= maxDepth) return {};
      
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const structure = {};
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files
        
        if (entry.isDirectory()) {
          structure[entry.name] = await this.getDirectoryStructure(
            path.join(dirPath, entry.name), 
            maxDepth, 
            currentDepth + 1
          );
        } else {
          structure[entry.name] = 'file';
        }
      }
      
      return structure;
    } catch (error) {
      return {};
    }
  }

  async shouldCreateRequest(changes) {
    // Analyze changes to determine if project-state.md update is needed
    const significantKeywords = [
      'feature', 'add', 'new', 'create', 'implement', 'architecture', 
      'database', 'schema', 'migration', 'api', 'endpoint', 'route',
      'dependency', 'package', 'install', 'security', 'auth', 'deploy'
    ];

    const commitMessages = changes.commits.map(c => c.message.toLowerCase()).join(' ');
    const hasSignificantChanges = significantKeywords.some(keyword => 
      commitMessages.includes(keyword)
    );

    // Also check if changes affect key directories
    const affectsKeyAreas = [
      '/server/', '/db/', '/plan/', '/.github/', '/infra/',
      'package.json', 'docker', 'schema', 'migration'
    ].some(pattern => changes.diff.includes(pattern));

    return hasSignificantChanges || affectsKeyAreas;
  }

  async checkExistingIssues() {
    try {
      const issues = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        labels: 'project-state-update'
      });

      return issues.data.length > 0;
    } catch (error) {
      console.error('Error checking existing issues:', error);
      return false;
    }
  }

  async createCopilotIssue(changes, currentState, projectStructure) {
    const title = `Update project-state.md based on recent changes`;
    
    const body = `@copilot Please analyze the recent changes to the EventGlimpse project and update the \`plan/project-state.md\` documentation if needed.

## Recent Changes (${changes.commitCount} commits)

${changes.commits.map(c => `- \`${c.hash.slice(0, 7)}\`: ${c.message}`).join('\n')}

## Analysis Request

Please review these changes and determine if \`plan/project-state.md\` needs updates. Consider:

✅ **Update Criteria:**
- New features or architectural changes
- Database schema modifications  
- New dependencies or technology stack changes
- Changes to directory structure or key files
- New API endpoints or routes
- Security or deployment changes

❌ **Skip Minor Changes:**
- Bug fixes without architectural impact
- Code style or formatting changes
- Documentation-only updates
- Minor refactoring

## Current Project State

<details>
<summary>Current plan/project-state.md content</summary>

\`\`\`markdown
${currentState}
\`\`\`
</details>

## Recent Code Changes

<details>
<summary>Git diff of recent changes</summary>

\`\`\`diff
${changes.diff.slice(0, 10000)}${changes.diff.length > 10000 ? '\n... (truncated for length)' : ''}
\`\`\`
</details>

## Current Project Structure

<details>
<summary>Project structure overview</summary>

\`\`\`json
${JSON.stringify(projectStructure, null, 2)}
\`\`\`
</details>

## Instructions

If updates are needed:
1. Provide the complete updated \`plan/project-state.md\` content
2. Maintain the exact same structure and format
3. Update the "Last Updated" field to: ${new Date().toISOString().split('T')[0]}
4. Keep it concise and focused on information useful for developers and LLMs

If no significant updates are needed, simply comment that the current project state is up to date.

---
*This issue was automatically created by the project state monitoring workflow.*`;

    try {
      const issue = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: title,
        body: body,
        assignees: [], // Don't assign, let @copilot respond naturally
        labels: ['project-state-update', 'copilot-request']
      });

      console.log(`Created issue #${issue.data.number}: ${issue.data.html_url}`);
      return issue.data;
    } catch (error) {
      console.error('Error creating GitHub issue:', error);
      throw error;
    }
  }

  async run() {
    try {
      console.log('Starting project state update request...');

      // Check if we have necessary GitHub token
      if (!process.env.GITHUB_TOKEN) {
        console.log('No GITHUB_TOKEN found, cannot create issue');
        process.exit(1);
      }

      if (!this.owner || !this.repo) {
        console.log('Cannot determine repository owner/name');
        process.exit(1);
      }

      // Get recent changes
      const changes = await this.getRecentChanges();
      if (!changes) {
        console.log('No recent changes found, skipping request');
        process.exit(0);
      }

      console.log(`Found ${changes.commitCount} recent commits`);

      // Check if changes are significant enough to warrant an update
      const needsUpdate = await this.shouldCreateRequest(changes);
      if (!needsUpdate) {
        console.log('Changes do not appear significant for project state update');
        process.exit(0);
      }

      // Check if there's already an open issue for project state updates
      const hasExistingIssue = await this.checkExistingIssues();
      if (hasExistingIssue) {
        console.log('There is already an open project-state-update issue');
        process.exit(0);
      }

      // Get current project state and structure
      const currentState = await this.getCurrentProjectState();
      const projectStructure = await this.getProjectStructure();

      // Create GitHub issue for @copilot to review
      console.log('Creating GitHub issue for @copilot review...');
      await this.createCopilotIssue(changes, currentState, projectStructure);
      
      console.log('Project state update request created successfully');

    } catch (error) {
      console.error('Request creation failed:', error);
      process.exit(1);
    }
  }
}

// Run the request creator
if (require.main === module) {
  const creator = new CopilotRequestCreator();
  creator.run();
}

module.exports = CopilotRequestCreator;