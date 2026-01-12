# 🔐 GitHub Secrets Setup for Code Signing

Your GitHub Actions workflow is now configured to sign your Windows app with Azure Trusted Signing!

## ✅ What's Been Done

1. ✅ Created Azure App Registration: `StatsFetch-GitHub-CodeSigning`
2. ✅ Assigned signing permissions to your certificate profile
3. ✅ Generated client secret
4. ✅ Updated GitHub workflow to sign on build

## 🎯 Next Step: Add GitHub Secrets

You need to add **3 secrets** to your GitHub repository. Here are your credentials:

### Your Azure Credentials

See below for the values to use. Your client secret has been generated and shown in the terminal output above.

### How to Add Secrets to GitHub

1. **Go to your repository:** https://github.com/ctrenks/statspull/settings/secrets/actions
2. **Click** `New repository secret` button
3. **Add each secret:**

   **Secret 1:**
   - Name: `AZURE_TENANT_ID`
   - Value: `ebeef868-5c44-44b6-aba5-b112c3266fc7`

   **Secret 2:**
   - Name: `AZURE_CLIENT_ID`
   - Value: `1b4856ff-4599-4b60-9df9-557619b31124`

   **Secret 3:**
   - Name: `AZURE_CLIENT_SECRET`
   - Value: (See terminal output - starts with `R_T8Q~...`)

## 🚀 Test It Out

After adding the secrets:

1. **Push your changes:**
   ```bash
   git push
   ```

2. **Trigger a build manually:**
   - Go to: https://github.com/ctrenks/stats-client/actions
   - Click `Build Electron App`
   - Click `Run workflow`
   - Click the green `Run workflow` button

3. **Check the logs** to see your app being signed! ✨

## 🎉 What Happens Now

Every time you:
- Create a version tag (like `v1.3.1`)
- Manually trigger the workflow

GitHub will:
1. Build your Windows app
2. **Automatically sign it** with your certificate
3. Upload the signed executable

Users won't see Windows SmartScreen warnings anymore! 🛡️

## 🔒 Security Notes

- ✅ Client secret is safe in GitHub Secrets (encrypted)
- ✅ Only has permission to sign with your certificate
- ✅ Cannot access anything else in your Azure account
- ⚠️ Client secret expires in 2 years (save this info!)

## ⏰ Important Reminder

Your certificate expires: **January 15, 2026** (3 days!)
- Should auto-renew if your identity verification is still valid
- Check Azure portal if signing fails after this date

---

**Need help?** The workflow file is at: `stats-client/.github/workflows/build.yml`
