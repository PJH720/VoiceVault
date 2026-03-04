Read the specified plan file from .cursor/plans/ (user provides plan number).
1. Switch to Plan Mode — analyze the plan fully before coding
2. Check prerequisites — are the required plans already implemented?
3. Create all new files listed in the plan's "New Files" section
4. Implement each step in order, following the code patterns shown
5. Add IPC channels to src/shared/ipc-channels.ts
6. Run database migrations if schema changes are needed
7. Write unit tests for all new services
8. Build (`pnpm build`) and fix any TypeScript errors
9. Run tests (`pnpm test`) and fix any failures
10. Self-verify against the plan's Acceptance Criteria — check off each item
Report which acceptance criteria pass and which still need work.
