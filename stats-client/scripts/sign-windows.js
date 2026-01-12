const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(configuration) {
  const filePath = configuration.path;

  console.log(`Signing ${filePath}...`);

  try {
    // Sign the file using Azure Trusted Signing with managed identity
    execSync(
      `azuresigntool sign -du "https://statsfetch.com" -fd sha256 -td sha256 -tr "http://timestamp.acs.microsoft.com" -kvu "https://eus.codesigning.azure.net/" -kvc "statsfetch-cert" -kvt "TrustedSigning" -kvm -d "Stats Fetch" "${filePath}"`,
      { stdio: 'inherit' }
    );

    console.log(`Successfully signed ${filePath}`);
  } catch (error) {
    console.error('Signing failed:', error.message);
    console.error('Make sure you are logged in to Azure CLI with: az login');
    throw error;
  }
};
