# 🍎 Apple Code Signing Setup for Mac Builds

Your Mac builds will now be signed and notarized with Apple!

## ✅ What's Been Done

1. ✅ Updated `package.json` with Mac signing config
2. ✅ Created `build/entitlements.mac.plist` for hardened runtime
3. ✅ Updated GitHub workflow to sign and notarize

## 🎯 Next Step: Add GitHub Secrets

You need to add **4 secrets** to your GitHub repository.

### Step 1: Export Your Certificate as .p12

If you haven't already, you need to export your "Developer ID Application" certificate:

1. **Open Keychain Access** on your Mac
2. Find "Developer ID Application: [Your Name]" certificate
3. **Expand it** to see the private key
4. **Select BOTH** the certificate AND the private key
5. **Right-click** → "Export 2 items..."
6. Save as `certificate.p12`
7. Set a password (you'll need this for `CSC_KEY_PASSWORD`)

### Step 2: Convert to Base64

Run this command in Terminal where you saved the .p12:

```bash
base64 -i certificate.p12 | pbcopy
```

This copies the base64-encoded certificate to your clipboard.

### Step 3: Add GitHub Secrets

Go to: https://github.com/ctrenks/statspull/settings/secrets/actions

Click "New repository secret" for each:

| Secret Name | Value |
|-------------|-------|
| `CSC_LINK` | Paste the base64 from Step 2 |
| `CSC_KEY_PASSWORD` | The password you set when exporting .p12 |
| `APPLE_ID` | Your Apple ID email address |
| `APPLE_APP_SPECIFIC_PASSWORD` | `eftr-xtkh-rkbz-nnvq` |

## 🚀 Test It Out

After adding the secrets:

1. **Commit and push these changes:**
   ```bash
   cd stats-client
   git add .
   git commit -m "Add Mac code signing and notarization"
   git push
   ```

2. **Trigger a build manually:**
   - Go to: https://github.com/ctrenks/statspull/actions
   - Click "Build Electron App"
   - Click "Run workflow"

3. **Check the logs** to see your Mac app being signed and notarized! ✨

## 🎉 What Happens Now

Every time you create a version tag or manually trigger the workflow:

1. GitHub builds your Mac app
2. **Signs it** with your Developer ID certificate
3. **Notarizes it** with Apple (they scan for malware)
4. Uploads the signed .dmg and .zip

Users won't see the "damaged and can't be opened" warning anymore! 🛡️

## 🔒 Security Notes

- ✅ Certificate is encrypted in GitHub Secrets
- ✅ App-specific password only allows notarization (not account access)
- ⚠️ Developer ID certificates are valid for ~5 years
- ⚠️ App-specific passwords don't expire but can be revoked

## 📋 Your Configuration

- **Team ID:** 3Y76JBLTM3
- **App ID:** com.statsfetch.client

---

**Need help?** The workflow file is at: `stats-client/.github/workflows/build.yml`
