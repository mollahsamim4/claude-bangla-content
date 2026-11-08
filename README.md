# Claude Bangla — content

Public content for the **Claude Bangla** Android app (unofficial — not affiliated with Anthropic). The app downloads `content/index.json` and the files it lists from this repository.

- `content/` — lessons, prompts, errors, feed posts, coming-soon items and images. Format contract: `content/schema/schema.ts`. See `content/README.md`.
- Every change goes through a pull request. **Merging publishes it** to every phone on its next sync; closing rejects it.
- `.github/workflows/content-validate.yml` checks every PR; `content-index.yml` rebuilds `content/index.json` after each merge to `main`.

Claude is a trademark of Anthropic. This project is independent.

## Release notes

A scheduled workflow (`.github/workflows/release-notes.yml`, every 6 hours) turns new **official Claude release notes** into pull requests for the owner to review.

**How it works**

1. It fetches three sources: the Claude Code changelog (`## <version>` headings), the Claude API release notes (one entry per date) and the Claude Help Center release notes (one entry per bold title under a date). A source that cannot be fetched or yields zero entries fails the run (GitHub emails the owner); the other sources still get their PRs first.
2. It proposes only items it has not proposed before: not in `content/feed/` and with no PR (open, merged or closed) whose branch is `release-notes/<id>`. API and Help Center items must be dated within the last 14 days. Claude Code items must be newer than the newest known version (first run: only the newest 3). At most 8 PRs per run; the rest follow in the next run.
3. For each item, Claude (run headless in an empty temp directory with built-in tools off (`--tools ""`) and MCP/connector tools off (`--strict-mcp-config`), and no GitHub token in its environment, using the `CLAUDE_CODE_OAUTH_TOKEN` repo secret) writes a Bengali summary. The release-note text is treated as untrusted data. A summary that is empty or not Bengali is never published; the item is skipped and the run fails visibly.
4. It writes `content/feed/<id>.json` on branch `release-notes/<id>`, runs the repository validator, pushes and opens a PR containing the Bengali summary and the English original. Claude Code ids replace dots by dashes (`claude-code-2-1-319`) because feed ids allow only `a-z 0-9 -`.
5. Claude Code versions are processed oldest to newest; at the first failure the remaining Claude Code items of that run are left for the next run (a skipped older version would otherwise be lost, since anything older than the newest known version counts as done).

**Run it manually:** GitHub -> Actions -> **Release notes** -> **Run workflow**. Locally: `cd content && npm run release-notes` (needs `claude` and `gh` logged in; it opens real PRs and pushes branches, so avoid this unless you mean it).

**What merge / close means:** edit the Bengali summary in the PR if needed, then **merge** to publish it to the app feed (the index is rebuilt automatically), or **close** the PR to reject it. A closed PR is remembered (its branch name), so the item is not proposed again.

**Known id limitations**

- Help Center ids come from the entry title (`help-<date>-<title slug>`). If the Help Center later edits an entry's title, it gets a new id and can be proposed again.
- API items are one per date (`api-<date>`). A bullet added later to a date that was already proposed is not proposed again.
