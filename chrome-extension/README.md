# Affiliate Form Filler - Chrome Extension

Auto-fill casino affiliate signup forms with your business details. Works alongside 1Password - you use 1Password for passwords/basic login, this extension handles all the custom business fields.

## Features

- 🚀 **One-click form filling** - Fill entire signup forms instantly
- 📋 **Multiple profiles** - Store unlimited business identities
- 🔑 **Password generator** - Simple or complex passwords
- 💾 **Export/Import** - Backup and restore your data
- 🎯 **Smart field detection** - Works with CellXpert, MyAffiliates, Income Access, and more

## Installation

### Option 1: Load Unpacked (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder
5. The extension icon will appear in your toolbar

### Option 2: Create Icons First

Before loading, you need PNG icons. Create these files in the `icons` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can use any image editor or this online tool: https://www.favicon-generator.org/

Or run this command if you have ImageMagick:
```bash
# Create a simple gradient icon
convert -size 128x128 xc:none \
  -fill "gradient:#667eea-#764ba2" -draw "roundrectangle 0,0,127,127,20,20" \
  -fill white -font Arial -pointsize 64 -gravity center -annotate 0 "⚡" \
  icons/icon128.png

convert icons/icon128.png -resize 48x48 icons/icon48.png
convert icons/icon128.png -resize 16x16 icons/icon16.png
```

## Usage

1. **Click the extension icon** in your toolbar
2. **Fill in your profile** with your business details:
   - Personal info (name, email, phone)
   - Business info (company, website, registration number)
   - Address (street, city, state, zip, country)
   - Messaging (Skype, Telegram)
   - Marketing info (traffic sources, methods)
3. **Click "Save Profile"**
4. **Navigate to any affiliate signup form**
5. **Click "⚡ Fill This Page"** - Done!

## Managing Multiple Profiles

- Go to the **Profiles** tab
- Click **"+ Add New Profile"** to create additional identities
- Click any profile to switch to it
- Use the **×** button to delete profiles (except default)

## Password Generation

- Click **🔑 New Password** to generate a new password
- Passwords are auto-saved to your current profile
- Click the password field to copy it to clipboard
- Choose format in Settings:
  - **Simple**: `AlphaBeta42` (letters + numbers)
  - **Complex**: `Xy9#mK2$pL` (includes special characters)

## Export/Import

- Go to **Settings** tab
- Click **📤 Export All Data** to backup
- Click **📥 Import Data** to restore from backup

## Keyboard Shortcut (Optional)

You can add a keyboard shortcut in Chrome:
1. Go to `chrome://extensions/shortcuts`
2. Find "Affiliate Form Filler"
3. Set a shortcut (e.g., `Ctrl+Shift+F`)

## Supported Form Types

The extension auto-detects and fills:
- **CellXpert** forms
- **MyAffiliates** forms
- **Income Access** forms
- Most standard affiliate signup forms

## Privacy

- All data is stored locally in your browser
- No data is sent to any external servers
- You can export/delete your data at any time

## Troubleshooting

**Form not filling?**
- Make sure you've saved your profile first
- Some fields may have validation that blocks autofill
- Try clicking inside a field first, then fill

**Password not accepted?**
- Try generating a new password with "Complex" format
- Some sites require specific password rules

**Country not selecting?**
- The extension tries common country values (US, USA, United States)
- You may need to manually select for unusual dropdown formats
