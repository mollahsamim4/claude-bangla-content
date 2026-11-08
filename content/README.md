# Claude Bangla content

Content for the Claude Bangla app. `schema/schema.ts` is the format contract.

- `lessons/`, `prompts/`, `errors/`, `feed/`, `coming-soon/`: one JSON file per item; `id` must equal the file name.
- `images/`: WebP (or png/jpg), referenced as `images/<name>.webp`; keep each under ~150 KB.
- Bengali body text; English titles, headings, technical terms, prompts, code, and error text.
- Files must be UTF-8 (NFC) with LF line endings.

```bash
npm ci
npm test          # validator tests
npm run validate  # validate this content tree
```

## Image files are immutable

Never overwrite an image file under the same name. The app caches images by their path (`images/<name>.webp`), so a changed file with an unchanged name would keep showing the old picture on devices that already have it. To replace an image, add a new file with a new name and update the references.
