#!/usr/bin/env node

/**
 * DEPRECATED: This script used external OpenAI API for analysis.
 * 
 * The new approach uses GitHub Copilot via issue creation.
 * See: create-copilot-request.js
 * 
 * Keeping this file for reference and potential future use.
 */

const fs = require('fs').promises;
const path = require('path');
const { simpleGit } = require('simple-git');
const OpenAI = require('openai');

class ProjectStateAnalyzer {
  constructor() {
    this.git = simpleGit('../../');
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }) : null;
    this.projectRoot = path.resolve('../../');
    this.projectStatePath = path.join(this.projectRoot, 'plan/project-state.md');
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

  async analyzeChangesWithLLM(changes, currentState, projectStructure) {
    const prompt = `You are analyzing changes to the EventGlimpse project to update its project-state.md documentation.

CURRENT PROJECT-STATE.MD:
${currentState}

RECENT CHANGES (${changes.commitCount} commits):
COMMITS:
${changes.commits.map(c => `- ${c.hash.slice(0, 7)}: ${c.message}`).join('\n')}

DIFF:
${changes.diff}

CURRENT PROJECT STRUCTURE:
${JSON.stringify(projectStructure, null, 2)}

Please analyze these changes and determine if project-state.md needs updates. Consider:
1. New features or architectural changes
2. Database schema modifications  
3. New dependencies or technology stack changes
4. Changes to directory structure or key files
5. New API endpoints or routes
6. Security or deployment changes

If updates are needed, provide ONLY the complete updated project-state.md content, maintaining the exact same structure and format. Keep it concise and focused on information useful for developers and LLMs.

If no significant updates are needed (e.g., only bug fixes, minor changes), respond with exactly: "NO_UPDATE_NEEDED"

Current date for "Last Updated" field: ${new Date().toISOString().split('T')[0]}`;

    try {
      if (!this.openai) {
        throw new Error('OpenAI client not initialized - API key required');
      }
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a technical documentation specialist focused on maintaining accurate, concise project state documentation for software development teams.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      });

      return response.choices[0]?.message?.content?.trim();
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      throw error;
    }
  }

  async updateProjectState(newContent) {
    try {
      await fs.writeFile(this.projectStatePath, newContent, 'utf8');
      console.log('Project state updated successfully');
    } catch (error) {
      console.error('Error updating project-state.md:', error);
      throw error;
    }
  }

  async run() {
    try {
      console.log('Starting project state analysis...');

      // Check if we have necessary API key
      if (!process.env.OPENAI_API_KEY) {
        console.log('No OPENAI_API_KEY found, skipping analysis');
        process.exit(0);
      }

      // Get recent changes
      const changes = await this.getRecentChanges();
      if (!changes) {
        console.log('No recent changes found, skipping update');
        process.exit(0);
      }

      console.log(`Found ${changes.commitCount} recent commits`);

      // Get current project state and structure
      const currentState = await this.getCurrentProjectState();
      const projectStructure = await this.getProjectStructure();

      // Analyze with LLM
      console.log('Analyzing changes with LLM...');
      const analysis = await this.analyzeChangesWithLLM(changes, currentState, projectStructure);

      if (analysis === 'NO_UPDATE_NEEDED') {
        console.log('No significant changes detected, project state is current');
        process.exit(0);
      }

      // Update project state
      await this.updateProjectState(analysis);
      console.log('Project state analysis complete');

    } catch (error) {
      console.error('Analysis failed:', error);
      process.exit(1);
    }
  }
}

// Run the analyzer
if (require.main === module) {
  const analyzer = new ProjectStateAnalyzer();
  analyzer.run();
}

module.exports = ProjectStateAnalyzer;