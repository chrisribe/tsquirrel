# Automated Project State Updates via GitHub Copilot

This directory contains the automation system for keeping `plan/project-state.md` up to date with the latest project changes using GitHub Copilot.

## Overview

The system automatically analyzes commits merged to the main branch and creates GitHub issues requesting @copilot to review and update the project state documentation. This follows the existing project workflow pattern and ensures human oversight of all changes.

## Components

### GitHub Actions Workflow
- **File**: `.github/workflows/update-project-state.yml`
- **Trigger**: Push to main branch
- **Purpose**: Analyzes changes and creates @copilot review requests

### Request Creation Script
- **File**: `.github/scripts/create-copilot-request.js`
- **Purpose**: Analyzes git changes and creates GitHub issues for @copilot review
- **Dependencies**: GitHub API for issue creation

### Configuration
- **File**: `.github/scripts/package.json`
- **Dependencies**: `@octokit/rest`, `simple-git`

## Setup Requirements

### GitHub Repository Permissions
The workflow requires:
- `contents: read` - To access repository content
- `issues: write` - To create review request issues

### Authentication
Uses the built-in `GITHUB_TOKEN` provided by GitHub Actions - no additional API keys needed.

## How It Works

1. **Trigger**: Workflow activates on any push to the main branch
2. **Analysis**: Script analyzes recent commits and current project structure
3. **Significance Check**: Determines if changes warrant project state review
4. **Issue Creation**: Creates GitHub issue with @copilot request for review
5. **Human Review**: Repository owner reviews @copilot's analysis and approves changes

## Workflow Pattern

This follows the established EventGlimpse workflow:
1. 🤖 **Automated Detection**: System detects significant changes
2. 📝 **Issue Creation**: Creates issue requesting @copilot analysis
3. 🔍 **Copilot Analysis**: @copilot reviews changes and suggests updates
4. 👤 **Human Approval**: Owner reviews and manually applies approved changes

## Update Criteria

The system creates review requests when it detects:
- New features or architectural changes
- Database schema modifications
- New dependencies or technology stack changes
- Changes to directory structure or key files
- New API endpoints or routes
- Security or deployment changes

Minor bug fixes and style changes typically don't trigger requests.

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
2. Select "Request Project State Update" workflow
3. Click "Run workflow" button

## Benefits of @copilot Approach

- ✅ **No External API Keys**: Uses built-in GitHub authentication
- ✅ **Human Oversight**: All changes require manual approval
- ✅ **Follows Existing Workflow**: Consistent with current project patterns
- ✅ **Cost Effective**: No external API costs
- ✅ **Transparent**: All analysis happens in public GitHub issues

## Troubleshooting

### Common Issues

1. **Permission Denied**: Check that workflow has `issues: write` permission
2. **No Requests Created**: System may determine no significant changes occurred
3. **Duplicate Issues**: System checks for existing open issues to avoid duplicates

### Logs
Check the GitHub Actions logs for detailed information about the analysis process and any errors.

## Maintenance

### Updating Dependencies
Update packages in `package.json` and test thoroughly before deployment.

### Modifying Analysis Logic
The significance detection logic in `create-copilot-request.js` can be adjusted to change what types of changes trigger review requests.