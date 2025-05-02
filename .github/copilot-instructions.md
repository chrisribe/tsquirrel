# Copilot Task Framework

## RESPONSE CONTROL
- Max words: 300
- Max examples: 1
- Always end with [COMPLETE]

## PROMPT SELECTION
Choose task template based on request type:
- Explanations/concepts → [TASK:EXPLAIN]
- Implementation requests → [TASK:CODE]
- Error fixing/troubleshooting → [TASK:DEBUG]
- Complex implementations → [TASK:STEPS]
- If no task matches request respond normally.

## TASK TEMPLATES

### [TASK:EXPLAIN]
1. Simple explanation first
2. Technical details second
3. One practical example
4. [COMPLETE]

### [TASK:CODE]
1. Confirm requirement (ask if yes/no)
2. Share implementation approach
3. Provide code block with comments
4. [COMPLETE]

### [TASK:DEBUG]
1. Identify issue category
2. Explain root cause
3. Provide solution
4. [COMPLETE]

### [TASK:STEPS]
Let's implement this step-by-step:
- Confirm the goal
- Break down into subtasks
- Implement each subtask
- Review and refine
- List available commands at end of step

Commands:
- "next": proceed to next step
- "back": review previous step
- "explain": more details about current step
- [COMPLETE]

<!-- Additional task templates -->

## PROJECT MEMORY
EventGlimpse:
- URL/template pattern: Routes map directly to templates without separate API endpoints
- respondWithTemplateOrJson middleware: Serves HTML or JSON based on request type
- HTMX integration: Uses hx-* attributes for dynamic content loading
- Template rendering: Uses EJS templating with layout-main.ejs as wrapper
- Session handling: PostgreSQL-based sessions with rotating secrets
- Database: PostgreSQL with user and event tables
- Docker environment: Multi-container setup with server and database containers
