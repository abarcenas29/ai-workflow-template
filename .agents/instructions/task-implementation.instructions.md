---
applyTo: "**/memory-bank/tasks/*.md"
description: "Instructions for implementing tasks using the memory-bank task management system"
---

# Task Implementation Instructions

You implement tasks using the memory-bank task management system. Each task has a dedicated file in `memory-bank/tasks/`. Progress is tracked across three levels: the individual task file, `activeContext.md`, and `progress.md`.

## Memory Bank Audit Trail

All planning, implementation, and execution work must be recorded in Markdown files.

- The task file in `memory-bank/tasks/` is the single source of truth for that task's plan, decisions, and progress.
- Update `activeContext.md` when switching focus or making significant changes.
- Update `progress.md` when project-wide status changes (new features working, blockers, etc.).
- Do not rely on chat alone for durable tracking of implementation decisions or progress.

**Task file format**: See `memory-bank.instructions.md` for the complete task file structure (sections, progress log, subtask table, etc.).

## 1. Setup

**MUST complete before starting implementation:**

1. Read `memory-bank/activeContext.md` to understand current focus and recent changes
2. Read `memory-bank/progress.md` to understand project-wide status
3. Read `memory-bank/tasks/_index.md` to find the task assigned to you
4. Read the full task file in `memory-bank/tasks/` — understand the request, thought process, implementation plan, and all subtasks
5. Identify referenced files mentioned in the task and examine them for context
6. Understand current project structure and conventions

## 2. Systematic Implementation Process

**Implement each task systematically:**

1. **Process subtasks in order** — Follow the task file's subtask sequence exactly, one step at a time
2. **Before implementing any subtask:**
   - Fully understand all implementation requirements from the task file
   - Gather any additional required context
3. **Implement the subtask completely with working code:**
   - Follow existing code patterns and conventions
   - Create working functionality that meets all requirements
   - Include proper error handling and documentation
4. **After every subtask:**
   - Mark the subtask complete in the task file's subtask table
   - Add a progress log entry with date, what was done, challenges, and decisions
   - Update the overall task status and completion percentage
   - Update `memory-bank/activeContext.md` with recent changes and next steps
   - Update `memory-bank/tasks/_index.md` to reflect status changes

## 3. Implementation Quality Standards

**Every implementation MUST:**

- Follow existing workspace patterns and conventions
- Implement complete, working functionality that meets all task requirements
- Include appropriate error handling and validation
- Use consistent naming conventions and code structure from the workspace
- Add necessary documentation for complex logic
- Ensure compatibility with existing systems and dependencies

## 4. Completion

**Implementation is complete when:**

- All subtasks in the task file are marked complete
- All specified files exist with working code
- All success criteria from the task are verified
- No implementation errors remain

**Final steps:**

1. Update `memory-bank/progress.md` — document what now works, what's left to build, and any known issues
2. Update `memory-bank/activeContext.md` — summarize what was implemented and set next steps
3. Update `memory-bank/tasks/_index.md` — mark the task file as Completed
4. Mark the task's overall status to Completed in its own file

## 5. Problem Resolution

**When encountering implementation issues:**

- Document the specific problem clearly in the task file's progress log
- Try alternative approaches or search terms
- Use workspace patterns as fallback when external references fail
- Continue with available information rather than stopping completely
- Note any unresolved issues in the task file for future reference

## Implementation Workflow

```
1. Read activeContext.md, progress.md, tasks/_index.md, and the assigned task file
2. For each unchecked subtask:
   a. Fully understand requirements
   b. Implement with working code following workspace patterns
   c. Validate implementation meets requirements
   d. Mark subtask complete in task file
   e. Add progress log entry to task file with date and details
   f. Update activeContext.md and _index.md
3. Repeat until all subtasks complete
4. Update progress.md, activeContext.md, _index.md with final status
```

## Success Criteria

Implementation is complete when:

- ✅ All subtasks in the task file are marked complete
- ✅ All specified files contain working code
- ✅ Code follows workspace patterns and conventions
- ✅ All functionality works as expected within the project
- ✅ Task progress log documents what was done, challenges, and decisions
- ✅ activeContext.md reflects the latest changes and next steps
- ✅ progress.md reflects the updated project status
- ✅ tasks/_index.md shows the task as Completed
