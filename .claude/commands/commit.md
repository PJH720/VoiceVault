Review all staged and unstaged changes. Then:
1. Group related changes into logical commits (atomic — one concern per commit)
2. Write conventional commit messages: `type(scope): description`
   - Types: feat, fix, refactor, test, docs, chore, style, perf
   - Scopes: audio, transcription, llm, diarization, rag, export, ui, db, i18n, config
3. Stage and commit each group separately
4. If changes span multiple concerns, split them — never mix feature + refactor in one commit
5. Show the final git log (last N commits) as confirmation
