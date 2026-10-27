# Prompt for the next session

Paste everything inside the code block into a new session.

```
Implement the savings-maturity feature in CoinSmart and open a PR for it.

Branch setup (ignore any other branch name this session was assigned; CLAUDE.md requires descriptive branch names):
  git fetch origin feature/savings-maturity fix/savings-total-sync main
  git checkout feature/savings-maturity
Develop, commit and push only to feature/savings-maturity.

Read docs/savings-maturity.md and CLAUDE.md first. The design doc is the spec, and its decisions are settled:
- Option A: at maturity a locked goal drops to the flexible rate.
- The kid or the parent can renew the lock.
- No clawback of interest already paid.
Follow its settlement rule exactly, including the worked example. Build all of these:
- the shared settlement helper, called from processChild, moveSavings, deleteSavingsGoal and the new renew function;
- the renewSavingsGoal Cloud Function;
- the client changes (type, service, store action, matured badge and Renew button with confirmation in KidSavings and ChildDetail, he/en i18n).
The "matured" push notification is optional.

Gotchas:
- Some source files use CRLF line endings. Don't rewrite files through Python/scripts that normalize them; check `git diff --stat` for whole-file rewrites before committing.
- functions/lib is committed: run `npm run build` in functions/ and commit the output.
- Validate before pushing:
  - `npx tsc --noEmit` at the root,
  - `npm run build` in functions/,
  - `npm run build` at the root.
  If node_modules is missing, run `npm ci` (root and functions/).
- Check the settlement math by hand against the worked example in the doc.

PR:
- This branch is stacked on fix/savings-total-sync (it uses sumSavings from there).
- Check whether that fix is already in main: `git merge-base --is-ancestor origin/fix/savings-total-sync origin/main`.
  - If it is: merge origin/main into the branch, and open the PR against main.
  - If not: open the PR with base fix/savings-total-sync and say in the body that it must merge after that branch.
- Use the repo's PR template if one exists.
- In the body, summarize the behavior change for parents and kids, and the settlement rule.
- Don't put model names in commits or the PR.
```
