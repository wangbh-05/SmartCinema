# Frontend Agent Kit

## SmartCinema 当前工作入口

- `REFACTOR_ROADMAP.md`：长程目标、阶段顺序、退出门槛、决策与进度日志；
- `REFACTOR_BASELINE.md`：基线提交、真实测试范围、浏览器证据、存储契约和 Bug 台账。
- `REFACTOR_TEST_MATRIX.md`：Node/浏览器 XFAIL 入口、12 个 Bug 的回归映射和转正规则。

继续本轮重构前应先阅读以上两个文件，并确认当前分支为 `zcjx/smart_cinema`。下面的内容是仓库早期保留的通用文档包说明，不代表 SmartCinema 当前架构。

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
