# Affiliate Stats Manager

A desktop application for managing affiliate program statistics. Built with Electron for cross-platform support.

## Features

- **Local Data Storage**: All data stored securely in local SQLite database
- **Encrypted Credentials**: Your login credentials are encrypted using AES-256
- **Template Import**: Fetch pre-configured program templates from the server
- **Custom Programs**: Add your own programs using supported providers:
  - Cellxpert
  - MyAffiliates
  - Income Access
  - NetRefer
  - Custom/Other
- **Statistics Tracking**: View historical stats with date filtering
- **Modern UI**: Beautiful dark theme with smooth animations

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run normally
npm start
```

### Building

```bash
# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux
```

### Project Structure

```
stats-client/
├── src/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Secure bridge to renderer
│   ├── database.js      # SQLite database operations
│   ├── api-client.js    # Server API client
│   └── renderer/        # Frontend files
│       ├── index.html   # Main HTML
│       ├── styles.css   # Styling
│       └── app.js       # Frontend JavaScript
├── package.json
└── README.md
```

## Usage

1. **Dashboard**: View overview of your programs and quick actions
2. **Programs**: Manage your affiliate programs and credentials
3. **Templates**: Fetch and import pre-configured programs from the server
4. **Statistics**: View historical stats by program and date range

## Data Location

Application data is stored in:
- **Windows**: `%APPDATA%\affiliate-stats-client\`
- **macOS**: `~/Library/Application Support/affiliate-stats-client/`
- **Linux**: `~/.config/affiliate-stats-client/`

## Security

- Credentials are encrypted locally using AES-256-CBC
- Encryption key is stored separately with restricted permissions
- No credentials are ever sent to the server




