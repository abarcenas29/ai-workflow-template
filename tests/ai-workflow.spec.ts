import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * AI Workflow Template Validation Tests
 * These tests validate the structure and functionality of the AI workflow template
 */

test.describe('AI Workflow Template Structure', () => {
  test('should have required configuration files', async () => {
    await test.step('Validate AGENTS.md exists', async () => {
      expect(existsSync('AGENTS.md')).toBeTruthy();
    });

    await test.step('Validate .github/instructions directory exists', async () => {
      expect(existsSync('.github/instructions')).toBeTruthy();
    });

    await test.step('Validate .github/skills directory exists', async () => {
      expect(existsSync('.github/skills')).toBeTruthy();
    });
  });

  test('should have valid package.json structure', async () => {
    await test.step('Read and parse package.json', async () => {
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      
      expect(packageJson.name).toBeDefined();
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.devDependencies).toBeDefined();
    });
  });

  test('should have Playwright configured', async () => {
    await test.step('Validate playwright.config.ts exists', async () => {
      expect(existsSync('playwright.config.ts')).toBeTruthy();
    });

    await test.step('Validate Playwright is in dependencies', async () => {
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      
      expect(packageJson.devDependencies['@playwright/test']).toBeDefined();
    });
  });

  test('should have tests directory structure', async () => {
    await test.step('Validate tests directory exists', async () => {
      expect(existsSync('tests')).toBeTruthy();
    });

    await test.step('Validate test files exist', async () => {
      const testFiles = await import('fs');
      const testDir = await testFiles.promises.readdir('tests');
      expect(testDir.length).toBeGreaterThan(0);
    });
  });

  test('should have VSCode configuration', async () => {
    await test.step('Validate .vscode directory exists', async () => {
      expect(existsSync('.vscode')).toBeTruthy();
    });

    await test.step('Validate launch.json exists for debugging', async () => {
      expect(existsSync('.vscode/launch.json')).toBeTruthy();
    });
  });
});

test.describe('AI Workflow Template Functionality', () => {
  test('should be able to load skill definitions', async () => {
    await test.step('Check if skills directory contains skill files', async () => {
      const fs = await import('fs/promises');
      const skillsDir = '.github/skills';
      
      if (existsSync(skillsDir)) {
        const files = await fs.readdir(skillsDir);
        const skillFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.json'));
        expect(skillFiles.length).toBeGreaterThan(0);
      }
    });
  });

  test('should have working npm scripts', async () => {
    await test.step('Validate Playwright test scripts exist', async () => {
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      
      expect(packageJson.scripts.test).toContain('playwright');
      expect(packageJson.scripts['test:headed']).toBeDefined();
      expect(packageJson.scripts['test:ui']).toBeDefined();
      expect(packageJson.scripts['test:debug']).toBeDefined();
    });
  });
});

/**
 * Example of a web-based test (if your project has a web component)
 * Uncomment and modify as needed
 */
/*
test.describe('Web Interface (if applicable)', () => {
  test.skip('should load web interface', async ({ page }) => {
    // This test is skipped by default - modify as needed for your project
    const baseURL = process.env.BASE_URL || 'http://localhost:3000';
    
    await test.step('Navigate to application', async () => {
      await page.goto(baseURL);
    });

    await test.step('Verify page loads', async () => {
      await expect(page).toHaveTitle(/./);
    });
  });
});
*/
