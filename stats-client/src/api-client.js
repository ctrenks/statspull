/**
 * API Client for fetching templates from server
 */

const fetch = require('node-fetch');

class ApiClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
  }

  async fetchTemplates() {
    const response = await fetch(`${this.serverUrl}/api/stats/templates`);

    if (!response.ok) {
      throw new Error(`Failed to fetch templates: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.templates || [];
  }

  async fetchTemplateExport() {
    const response = await fetch(`${this.serverUrl}/api/stats/templates/export?all=true`);

    if (!response.ok) {
      throw new Error(`Failed to fetch templates: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.templates || [];
  }
}

module.exports = ApiClient;




