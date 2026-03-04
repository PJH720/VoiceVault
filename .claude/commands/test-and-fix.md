Run the full test suite (`pnpm test`). For any failures:
1. Read the failing test and the code it tests
2. Analyze root cause — is the test wrong or the code wrong?
3. Fix the code (not the test, unless the test expectation is genuinely incorrect)
4. Re-run the specific failing test to confirm the fix
5. Run the full suite again to check for regressions
6. Repeat until all tests pass
If a test is flaky (passes sometimes), investigate timing/async issues.
Report: total tests, passed, fixed, remaining failures.
