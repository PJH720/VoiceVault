Review all staged changes (git diff --cached). For each file:
1. Check for bugs, edge cases, security issues (especially IPC bridge safety)
2. Verify TypeScript strict compliance — no `any`, no type assertions without justification
3. Ensure all user-facing strings use `t()` from react-i18next (no hardcoded text)
4. Verify IPC handlers validate input and use contextBridge pattern
5. Check shadcn/ui component usage follows project conventions
6. Ensure new components have proper accessibility (ARIA, keyboard nav)
7. Flag any TODO/FIXME/HACK comments
Output a summary with severity ratings (🔴 critical, 🟡 warning, 🟢 ok).
