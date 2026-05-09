---
description: "Generate a Playwright test based on a scenario"
agent: build
subtask: true
---

# Test Generation with Playwright

Your goal is to generate a Playwright test based on a provided scenario. If no scenario is provided via arguments, ask the user for one.

## Instructions

- DO NOT generate test code prematurely or based solely on the scenario without completing all prescribed steps.
- Run steps one by one using the tools provided by Playwright.
- Only after all steps are completed, emit a Playwright TypeScript test that uses `@playwright/test` based on message history.
- Save generated test file in the tests directory.
- Execute the test file and iterate until the test passes.