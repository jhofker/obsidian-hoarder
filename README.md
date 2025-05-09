# ~Hoarder~ Karakeep Plugin for Obsidian

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
        accessControlAllowHeaders: "*"
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

## Development

1. Clone this repository
2. Install dependencies with `npm install`
3. Build the plugin with `npm run build`
4. Copy `main.js` and `manifest.json` to your vault's plugin directory

## License

MIT 