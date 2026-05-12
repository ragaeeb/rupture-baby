# Scripts

## split-conversations.ts

Splits Grok mass-export files that contain multiple conversations in a single JSON file into individual conversation files.

### Usage

**Dry-run (default):**
```bash
bun run split-conversations
```

This scans the translations directory and shows what files would be split, but makes no changes.

**Apply changes:**
```bash
bun run split-conversations:write
```

This writes the split files and deletes the original multi-conversation export.

### What It Does

1. Scans `TRANSLATIONS_DIR` recursively for `.json` files.
2. Identifies files with a `conversations` array containing more than one conversation.
3. For each conversation, creates a new file named `{conversation_id}.json` with the raw conversation object.
4. Deletes the original multi-conversation file.

### Example

Before:
```
translations/
  └── grok-export.json  (contains 5 conversations in one export)
```

After:
```
translations/
  ├── e74e36e3-c2b1-4219-85ec-5218d7e748aa.json
  ├── 84cadaf5-e3dc-44b2-b6ff-ca1ec1c7c72e.json
  └── ...
```

### Output Format

Each output file contains a single conversation object, not a wrapper array:

```json
{
  "conversation": {
    "id": "e74e36e3-c2b1-4219-85ec-5218d7e748aa",
    "title": "My Conversation",
    "create_time": "2026-03-18T15:12:37.961673Z"
  },
  "responses": []
}
```

### Note

The app expects one conversation per JSON file when browsing translations. It can normalize several single-conversation formats, but it does not consume array-style Grok mass exports directly. Run this script first if you imported a bulk Grok export.

### Environment Variables

- `TRANSLATIONS_DIR`: path to the translations directory. Defaults to `./translations`.
