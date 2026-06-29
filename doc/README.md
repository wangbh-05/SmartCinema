# Frontend Agent Kit

This folder is a reusable documentation bundle for another frontend project.

## What to reuse

- AGENTS.md for hard working rules and AI agent constraints
- PULL_REQUEST_TEMPLATE.md for GitHub review requirements
- TECH_STACK.md for stack decisions and change control

## How to use it

1. Copy the files into the new frontend repository.
2. Adjust framework-specific parts to match the new stack.
3. Keep workflow rules, review rules, and security rules intact.
4. Update the stack document whenever the frontend toolchain changes.

## Suggested order for a new project

- Start with AGENTS.md
- Then add the PR template
- Then finalize the tech stack contract
- Finally link the docs from the project root README

## Notes

- These documents are intentionally generic enough to reuse.
- Replace Vue-specific wording if the target project uses React, Svelte, or another framework.
- Keep the repo’s own local conventions authoritative if they conflict with this bundle.
