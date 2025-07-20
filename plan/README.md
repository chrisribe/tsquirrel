# EventGlimpse Feature Planning

This folder contains feature plans and project documentation to help developers and LLMs efficiently understand and contribute to the EventGlimpse project.

## Purpose

The planning system is designed to:
- Provide context about the current project state
- Enable efficient feature development without reviewing the entire codebase
- Track progress on features through phases
- Maintain consistency in development approach

## Folder Structure

```
plan/
├── README.md              # This file - planning guidelines
├── project-state.md       # Current project architecture and status
├── template.md           # Standard template for new feature plans
├── features/             # Active and completed feature plans
├── archive/              # Completed feature plans
└── examples/             # Example plans for reference
```

## Plan Creation Rules

### 1. Plan Detail Requirements
- Plans must be detailed enough for any developer or LLM to pick up and implement
- Include clear acceptance criteria and definition of done
- Specify file locations and components that need modification
- Reference existing patterns and conventions in the codebase

### 2. Phase-Based Development
- Split large features into manageable phases (typically 1-3 days of work each)
- Each phase should be independently testable and deployable
- Maximum of 5 phases per feature to maintain focus
- Each phase must have clear entry and exit criteria

### 3. Progress Tracking
- Use markdown checkboxes for tracking completion: `- [ ]` and `- [x]`
- Update checkboxes only after testing/validation is complete
- Include verification steps for each checkbox item
- Mark phases as complete only when all tests pass

### 4. Plan Template Structure
Every plan should follow this structure:
1. **Overview** - Brief description and business value
2. **Acceptance Criteria** - What defines success
3. **Technical Approach** - Architecture and implementation strategy
4. **Phases** - Breakdown of work with checkboxes
5. **Dependencies** - What needs to be in place first
6. **Testing Strategy** - How to validate the implementation
7. **Rollback Plan** - How to undo changes if needed

## Best Practices

### Before Starting a New Plan
1. Review `project-state.md` for current architecture
2. Check existing plans to avoid duplication
3. Consider impact on existing features
4. Identify integration points with current system

### During Implementation
1. Update checkboxes as work is completed
2. Note any deviations from the original plan
3. Update project-state.md if architecture changes
4. Keep plans updated with actual implementation details

### After Completion
1. Mark all phases and items as complete
2. Move completed plans to `archive/` folder
3. Update project-state.md with new capabilities
4. Document lessons learned for future reference

## File Naming Conventions

- Feature plans: `features/[feature-name]-plan.md`
- Archived plans: `archive/[feature-name]-plan.md`
- Example plans: `examples/[example-name]-example.md`

Use kebab-case for file names and keep them descriptive but concise.

## Integration with Development Workflow

1. **Planning Phase**: Create detailed plan using template
2. **Review Phase**: Team reviews plan for feasibility and completeness
3. **Implementation Phase**: Follow plan phases, updating checkboxes
4. **Testing Phase**: Validate each phase before moving to next
5. **Completion Phase**: Archive plan and update project state

## Getting Started

1. Read `project-state.md` to understand current architecture
2. Copy `template.md` to create a new feature plan
3. Follow the phase-based approach for implementation
4. Update progress using checkboxes as you complete work

For questions or improvements to this planning system, please create an issue or discuss with the team.