# Azure Trusted Signing Setup Guide

## Current Status

You have successfully set up:
- ✅ Azure Trusted Signing account: `afcmedia`
- ✅ Certificate Profile: `statsfetch-cert`
- ✅ Identity verified
- ✅ Certificate issued (expires: 1/15/2026)

**Account Details:**
- Endpoint: `https://eus.codesigning.azure.net/`
- Account Name: `afcmedia`
- Certificate Profile: `statsfetch-cert`
- Resource Group: `statsfetch`

## The Problem

`azuresigntool` (the community tool we tried) is designed for **Azure Key Vault** code signing, not **Azure Trusted Signing**. These are different services with different authentication mechanisms.

## Solution Options

### Option 1: Sign via GitHub Actions (Recommended)

Microsoft provides official GitHub Actions for Azure Trusted Signing:

1. **Add GitHub Secrets:**
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_SECRET`

2. **Update `.github/workflows/build.yml`:**

```yaml
- name: Sign Windows App
  uses: azure/trusted-signing-action@v0.3.16
  with:
    azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
    azure-client-secret: ${{ secrets.AZURE_CLIENT_SECRET }}
    endpoint: https://eus.codesigning.azure.net/
    code-signing-account-name: afcmedia
    certificate-profile-name: statsfetch-cert
    files-folder: dist
    files-folder-filter: exe
```

### Option 2: Sign Locally with Service Principal

You need to create an App Registration (Service Principal) in Azure:

1. **Create App Registration:**
   ```bash
   az ad app create --display-name "StatsFetch Code Signing"
   ```

2. **Create Service Principal:**
   ```bash
   az ad sp create --id <app-id-from-above>
   ```

3. **Assign "Trusted Signing Certificate Profile Signer" role:**
   ```bash
   az role assignment create \
     --assignee <app-id> \
     --role "Trusted Signing Certificate Profile Signer" \
     --scope /subscriptions/32c4a331-1fc8-494f-b08f-05d9de1eb449/resourceGroups/statsfetch/providers/Microsoft.CodeSigning/codeSigningAccounts/afcmedia/certificateProfiles/statsfetch-cert
   ```

4. **Create Client Secret:**
   ```bash
   az ad app credential reset --id <app-id>
   ```

5. **Update signing script with Service Principal credentials:**
   ```javascript
   execSync(
     `azuresigntool sign -du "https://statsfetch.com" -fd sha256 -td sha256 -tr "http://timestamp.acs.microsoft.com" -kvu "https://eus.codesigning.azure.net/" -kvi "<CLIENT_ID>" -kvs "<CLIENT_SECRET>" -kvt "<TENANT_ID>" -kvc "statsfetch-cert" -d "Stats Fetch" "${filePath}"`,
     { stdio: 'inherit' }
   );
   ```

### Option 3: Use Microsoft's Official Signing Tool

Microsoft provides a .NET tool for Trusted Signing, but it's primarily designed for CI/CD environments.

**Install:**
```bash
dotnet tool install --global Microsoft.Trusted.Signing.Client
```

However, this tool also requires Service Principal authentication and is less documented than the GitHub Actions approach.

## Recommended Next Steps

1. **For now:** Build unsigned (current configuration) to get your app working
2. **Short term:** Set up GitHub Actions to sign automatically on release
3. **Before cert expires (1/15/2026):** The certificate will auto-renew as long as your identity verification remains valid

## Important Notes

- Your certificate expires in 3 days (1/15/2026) but should auto-renew
- Azure Trusted Signing is designed for CI/CD workflows, not local signing
- GitHub Actions is the most reliable method for code signing with this service
- You can also sign manually after building by using SignTool with the certificate

## Alternative: Export Certificate for Local Signing

If you need to sign locally frequently, consider switching to a traditional code signing certificate that can be exported to a .pfx file. Azure Trusted Signing certificates cannot be exported, which is a security feature but limits local signing.
