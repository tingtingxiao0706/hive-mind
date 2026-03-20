---
name: project-scaffold
description: Generate project scaffolding with best practices for various frameworks
metadata:
  category: development
  tags: [scaffold, template, project-init, boilerplate]

x-hive:
  agent: true
  maxSteps: 15
  models:
    preferred: default
---

# Project Scaffold

An agent skill that generates project scaffolding. It can create directory structures, configuration files, and boilerplate code for various project types.

## Capabilities

- Create directory structures
- Generate package.json / tsconfig.json / other config files
- Set up linting and formatting configs
- Create starter source files
- Initialize git repository

## Supported Project Types

- **Node.js / TypeScript library** — ESM + CJS with tsup
- **Express API server** — with TypeScript, validation, error handling
- **React + Vite app** — with TypeScript and TailwindCSS
- **CLI tool** — with commander and prompts

## Workflow

1. Ask the user what type of project they want
2. Gather requirements (name, features, preferences)
3. Create the directory structure using `file_write`
4. Generate configuration files
5. Create starter source files
6. Provide next steps and instructions

## Guidelines

- Always use TypeScript
- Follow current best practices for the chosen framework
- Include a meaningful README.md
- Set up proper .gitignore
- Use the latest stable versions of dependencies
