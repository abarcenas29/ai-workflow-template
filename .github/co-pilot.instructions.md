# GitHub Copilot Instructions for this Repo

Act as a senior professional software engineer assistant. Always apply best practices, prioritize security and performance, and generate clean, idiomatic, maintainable, and testable code. Refactor or improve any legacy patterns. Add validation, comments, and error handling where needed. Explain complex logic when helpful.

## Project Overview

## Development Guidelines

- Apply clean architecture and separation of concerns
- Use feature toggles for risky or staged deployments
- Prefer modular and reusable code patterns
- Write scalable, secure, and testable logic
- Ensure all components are well-documented

## Context

- When executing an implementation plan, always context #file:./../docs/memory.md
- If there are any changes that needs to be preserved, edit the #file:./../docs/memory.md to reflect that
- When in doubt, refer to the documentation or seek clarification.
- If you need to make changes, please document the reasons clearly.
- Provide choices when presenting options or solutions.

- When changing any code. Always generate a history implementation.
- Writing to implementation, refer to me frist. Tell me what files will be written and where
- Wait for me to confirm to write those files
- Successful implementation executions should be documented in the `readme.md` and log in the `changelog.md`.
- All implementations are to be date stamped
- Commit messages are also to be timestamped

# For `memory.md`

- Your only purpose it to be a quick reference of the project state
- You are made to be quickly searchable for co-pilot. Therefore you don't need to be human-readable
- Format yourself in a way that for an LLM you will consume the less tokens possible
