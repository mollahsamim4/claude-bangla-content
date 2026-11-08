# Claude Bangla — content

Public content for the **Claude Bangla** Android app (unofficial — not affiliated with Anthropic). The app downloads `content/index.json` and the files it lists from this repository.

- `content/` — lessons, prompts, errors, feed posts, coming-soon items and images. Format contract: `content/schema/schema.ts`. See `content/README.md`.
- Every change goes through a pull request. **Merging publishes it** to every phone on its next sync; closing rejects it.
- `.github/workflows/content-validate.yml` checks every PR; `content-index.yml` rebuilds `content/index.json` after each merge to `main`.

Claude is a trademark of Anthropic. This project is independent.
