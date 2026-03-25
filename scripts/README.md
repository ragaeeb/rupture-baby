# Scripts

## split-conversations.ts

Splits Grok mass-export files (with multiple conversations in a single JSON) into individual conversation files.

### Usage

**Dry-run (default):**
```bash
bun run split-conversations
```

This will scan the translations directory and show what files would be split, but won't make any changes.

**Apply changes:**
```bash
bun run split-conversations:write
```

This will actually split the files and delete the originals.

### What it does

1. Scans the `TRANSLATIONS_DIR` (or `./translations` by default) recursively for `.json` files
2. Identifies files with a `conversations` array containing more than 1 conversation
3. For each conversation, creates a new file named `{conversation_id}.json` with the **raw conversation object** (no wrapper array)
4. Deletes the original multi-conversation file

### Example

Before:
```
translations/
  └── grok-export.json  (contains 5 conversations in array)
```

After:
```
translations/
  ├── e74e36e3-c2b1-4219-85ec-5218d7e748aa.json  (single conversation object)
  ├── 84cadaf5-e3dc-44b2-b6ff-ca1ec1c7c72e.json  (single conversation object)
  └── ...
```

### Output Format

Each output file contains a **single conversation object** (not wrapped in an array):

```json
{
  "conversation": {
    "id": "e74e36e3-c2b1-4219-85ec-5218d7e748aa",
    "title": "My Conversation",
    "create_time": "2026-03-18T15:12:37.961673Z",
    ...
  },
  "responses": [...]
}
```

### Note

**The app only supports single conversation files.** Run this script before starting the app to normalize any multi-conversation exports from Grok.

### Environment Variables

- `TRANSLATIONS_DIR`: Path to the translations directory (default: `./translations`)
