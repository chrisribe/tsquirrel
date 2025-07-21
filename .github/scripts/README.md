# Automated Project State Updates

This directory contains the automation system for keeping `plan/project-state.md` up to date with the latest project changes.

## Overview

The system automatically analyzes commits merged to the main branch and updates the project state documentation using LLM analysis. This ensures the project-state.md file remains current and useful for developers and AI assistants.

## Components

### GitHub Actions Workflow
- **File**: `.github/workflows/update-project-state.yml`
- **Trigger**: Push to main branch
- **Purpose**: Orchestrates the analysis and update process

### Analysis Script
- **File**: `.github/scripts/analyze-project-state.js`
- **Purpose**: Analyzes git changes and uses LLM to determine necessary updates
- **Dependencies**: OpenAI API for intelligent analysis

### Configuration
- **File**: `.github/scripts/package.json`
- **Dependencies**: `openai`, `simple-git`

## Setup Requirements

### GitHub Repository Secrets
The workflow requires the following secret to be configured in the repository:

- `OPENAI_API_KEY`: OpenAI API key for LLM analysis

### Permissions
The GitHub Actions workflow needs:
- `contents: write` - To commit updated project-state.md
- `pull-requests: read` - To access PR information

## How It Works

1. **Trigger**: Workflow activates on any push to the main branch
2. **Analysis**: Script analyzes recent commits and current project structure
3. **LLM Review**: OpenAI API reviews changes and determines if updates are needed
4. **Update**: If significant changes are detected, project-state.md is updated
5. **Commit**: Changes are automatically committed back to the repository

## Update Criteria

The system updates project-state.md when it detects:
- New features or architectural changes
- Database schema modifications
- New dependencies or technology stack changes
- Changes to directory structure or key files
- New API endpoints or routes
- Security or deployment changes

Minor bug fixes and style changes typically don't trigger updates.

## Testing

Run the test script to verify the setup:

```bash
cd .github/scripts
npm install
node test-analyzer.js
```

## Manual Operation

To manually trigger the workflow:
1. Go to the repository's Actions tab
2. Select "Update Project State" workflow
3. Click "Run workflow" button

## Troubleshooting

### Common Issues

1. **API Key Missing**: Ensure `OPENAI_API_KEY` is set in repository secrets
2. **Permission Denied**: Check that workflow has `contents: write` permission
3. **No Updates**: System may determine no significant changes occurred

### Logs
Check the GitHub Actions logs for detailed information about the analysis process and any errors.

## Maintenance

### Updating Dependencies
Update packages in `package.json` and test thoroughly before deployment.

### Modifying Analysis Logic
The analysis prompt in `analyze-project-state.js` can be adjusted to change what types of changes trigger updates.

### Rate Limiting
The system is designed to be respectful of OpenAI API rate limits. If you experience issues, consider adding delays or reducing analysis frequency.