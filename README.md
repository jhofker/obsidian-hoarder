# Karakeep Sync

This plugin syncs your [Karakeep](https://karakeep.app/) bookmarks with Obsidian, creating markdown notes for each bookmark in a designated folder.

## Features

- Automatically syncs bookmarks from Karakeep every hour (configurable)
- Creates markdown files for each bookmark with metadata
- Configurable sync folder and API settings
- Updates existing bookmarks if they've changed

## Installation

1. Download the latest release from the releases page
2. Extract the zip file in your Obsidian vault's `.obsidian/plugins/` directory
3. Enable the plugin in Obsidian's settings

## Configuration

1. Open Obsidian Settings
2. Navigate to "Hoarder Sync" under "Community Plugins"
3. Enter your Karakeep API key
4. (Optional) Modify the sync interval and folder settings

## Karakeep Configuration

Ensure your CORS policy is set to allow requests from your Obsidian instance. In Traefik, add the following as a middleware:

```yaml
    obsidiancors:
      headers:
        accessControlAllowHeaders: "Authorization, Content-Type, Origin"
        accessControlAllowMethods: "GET, PATCH, POST, PUT, DELETE, OPTIONS"
        accessControlAllowCredentials: "true"
        accessControlAllowOriginList:
          - app://obsidian.md
          - capacitor://localhost
          - http://localhost
```

## Settings

- **Api key**: Your Karakeep API key (required)
- **Api endpoint**: The Karakeep API endpoint (default: https://api.karakeep.app/api/v1)
- **Sync folder**: The folder where bookmark notes will be created (default: "Hoarder")
- **Attachments folder**: The folder where bookmark images will be saved (default: "Hoarder/attachments")
- **Sync interval**: How often to sync in minutes (default: 60)
- **Update existing files**: Whether to update or skip existing bookmark files (default: false)
- **Exclude archived**: Exclude archived bookmarks from sync (default: true)
- **Only favorites**: Only sync favorited bookmarks (default: false)
- **Sync notes to Karakeep**: Whether to sync notes back to Karakeep (default: true)
- **Excluded tags**: Bookmarks with these tags will not be synced (comma-separated), unless favorited (default: empty)
- **Sync deletions**: Automatically handle bookmarks that are deleted in Karakeep (default: false)
- **Deletion action**: What to do with local files when bookmarks are deleted in Karakeep - options: "Delete file", "Move to archive folder", or "Add deletion tag" (default: "Delete file")
- **Archive folder**: Folder to move deleted bookmarks to when using "Move to archive folder" action (default: "Archive")
- **Deletion tag**: Tag to add to files when bookmarks are deleted and using "Add deletion tag" action (default: "deleted")
- **Handle archived bookmarks**: Separately handle bookmarks that are archived (not deleted) in Karakeep (default: false)
- **Archived bookmark action**: What to do with local files when bookmarks are archived in Karakeep - options: "Do nothing", "Delete file", "Move to archive folder", or "Add archived tag" (default: "Delete file")
- **Archived bookmark folder**: Folder to move archived bookmarks to when using "Move to archive folder" action (default: "Archive")
- **Archived bookmark tag**: Tag to add to files when bookmarks are archived and using "Add archived tag" action (default: "archived")

## Deletion and Archive Sync

The plugin now properly distinguishes between **deleted** and **archived** bookmarks in Karakeep:

### Deleted Bookmarks
When "Sync deletions" is enabled, the plugin detects bookmarks that have been completely deleted from Karakeep and handles them according to your "Deletion action" setting:

1. **Delete file**: Permanently removes the markdown file from your vault
2. **Move to archive folder**: Moves the file to a specified archive folder (useful for keeping a backup)
3. **Add deletion tag**: Adds a tag to the file's frontmatter to mark it as deleted (useful for manual review)

### Archived Bookmarks
When "Handle archived bookmarks" is enabled, the plugin separately handles bookmarks that are archived (but not deleted) in Karakeep:

1. **Do nothing**: Leaves the file unchanged (useful if you want to keep archived bookmarks in Obsidian)
2. **Delete file**: Removes the file from your vault
3. **Move to archive folder**: Moves the file to a specified archive folder
4. **Add archived tag**: Adds a tag to mark the file as archived

This gives you fine-grained control over how your Obsidian vault reflects the state of your Karakeep bookmarks.

## Custom Templates

The plugin uses [Eta](https://eta.js.org/) templates to render bookmark notes. You can customize the template in Settings → Hoarder Sync → Template.

Use `<%= it.variable %>` for output and `<% if (condition) { %>` for logic.

### Available Variables

**Bookmark fields**

| Variable | Type | Description |
|---|---|---|
| `it.bookmark_id` | `string` | Unique bookmark ID |
| `it.title` | `string` | Bookmark title |
| `it.url` | `string \| null` | Source URL |
| `it.description` | `string \| null` | Page description or text excerpt |
| `it.author` | `string \| null` | Author from page metadata |
| `it.note` | `string` | Your note (raw text) |
| `it.noteBlock` | `string` | Note wrapped in sync comment markers |
| `it.summary` | `string \| null` | AI-generated summary |
| `it.created_at` | `string` | ISO 8601 creation date |
| `it.modified_at` | `string \| null` | ISO 8601 modification date |
| `it.content_type` | `string` | `"link"`, `"text"`, or `"asset"` |
| `it.content_html` | `string \| null` | Raw HTML content (sanitized) |
| `it.archived` | `boolean` | Whether bookmark is archived |
| `it.favourited` | `boolean` | Whether bookmark is favorited |
| `it.tags` | `string[]` | Tag names |
| `it.hoarder_url` | `string` | Link to bookmark in Karakeep |
| `it.visit_link` | `string \| null` | Escaped URL for Markdown links |
| `it.sync_highlights` | `boolean` | Whether highlight sync is enabled |

**Pre-escaped for YAML frontmatter**

| Variable | Description |
|---|---|
| `it.yaml.url` | URL safe for YAML |
| `it.yaml.title` | Title safe for YAML |
| `it.yaml.note` | Note safe for YAML |
| `it.yaml.summary` | Summary safe for YAML |

**Assets**

| Variable | Description |
|---|---|
| `it.assets.content` | Rendered asset embeds |
| `it.assets.image` | Image asset path |
| `it.assets.banner` | Banner image path |
| `it.assets.screenshot` | Screenshot path |
| `it.assets.full_page_archive` | Full-page archive path |
| `it.assets.pdf_archive` | PDF archive path |
| `it.assets.video` | Video asset path |
| `it.assets.additional` | `string[]` of additional asset paths |

**Highlights** (`it.highlights` array, each item has:)

| Property | Description |
|---|---|
| `.id` | Highlight ID |
| `.color` | `"yellow"`, `"red"`, `"green"`, or `"blue"` |
| `.text` | Highlighted text |
| `.note` | Note on the highlight |
| `.date` | Formatted date string |
| `.created_at` | ISO 8601 creation date |

**Helper functions**

| Function | Description |
|---|---|
| `it.escapeYaml(str)` | Escape a string for YAML frontmatter |
| `it.escapeMarkdownPath(path)` | Escape a path for Markdown links |
| `it.formatDate(iso)` | Format an ISO date as a readable string |

### Example

```
<% if (it.author) { %>author: <%= it.escapeYaml(it.author) %>
<% } %>
```

## Development

1. Clone this repository
2. Install dependencies with `npm install`
3. Build the plugin with `npm run build`
4. Copy `main.js` and `manifest.json` to your vault's plugin directory

## License

MIT 
