import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Check if user is admin
async function isAdmin() {
  const session = await auth();
  return session?.user?.role === 9;
}

// Map old provider codes to software types
const PROVIDER_TO_SOFTWARE: Record<string, string> = {
  'CELLXPERT': 'cellxpert',
  'CELLXPERT_SCRAPE': 'cellxpert',
  'MYAFFILIATES': 'myaffiliates',
  'MYAFFILIATES_SCRAPE': 'myaffiliates',
  'INCOME_ACCESS': 'income-access',
  'NETREFER': 'netrefer',
  'WYNTA': 'wynta',
  'WYNTA_SCRAPE': 'wynta',
  'AFFILKA': 'affilka',
  '7BITPARTNERS': '7bitpartners',
  '7BITPARTNERS_SCRAPE': '7bitpartners',
  'DECKMEDIA': 'deckmedia',
  'RTG_ORIGINAL': 'rtg-original',
  'RIVAL': 'rival',
  'CASINO_REWARDS': 'casino-rewards',
  'CUSTOM': 'custom',
};

// Default template type
interface DefaultTemplate {
  name: string;
  softwareType: string;
  authType: 'API_KEY' | 'CREDENTIALS' | 'BOTH';
  apiKeyLabel?: string;
  apiSecretLabel?: string;
  baseUrl?: string;
  loginUrl?: string;
  icon?: string;
  requiresBaseUrl?: boolean;
  supportsOAuth?: boolean;
  baseUrlLabel?: string;
  description?: string;
  displayOrder?: number;
}

// Default templates to add if API fails or is empty
const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  { name: '7BitPartners', softwareType: '7bitpartners', authType: 'BOTH', apiKeyLabel: 'Statistic Token', baseUrl: 'https://dashboard.7bitpartners.com', icon: '🎰' },
  { name: 'CellXpert', softwareType: 'cellxpert', authType: 'BOTH', icon: '📊' },
  { name: 'MyAffiliates', softwareType: 'myaffiliates', authType: 'BOTH', icon: '🤝', supportsOAuth: true, apiKeyLabel: 'Client ID', apiSecretLabel: 'Client Secret' },
  { name: 'Income Access', softwareType: 'income-access', authType: 'CREDENTIALS', icon: '💰' },
  { name: 'NetRefer', softwareType: 'netrefer', authType: 'CREDENTIALS', icon: '🌐', description: 'Login and scrape MonthlyFigures report' },
  { name: 'Wynta', softwareType: 'wynta', authType: 'BOTH', icon: '🎲' },
  { name: 'Affilka (Generic)', softwareType: 'affilka', authType: 'BOTH', apiKeyLabel: 'Statistic Token', requiresBaseUrl: true, baseUrlLabel: 'Affiliate Dashboard URL', icon: '🔗' },
  { name: 'DeckMedia', softwareType: 'deckmedia', authType: 'CREDENTIALS', icon: '🃏' },
  { name: 'RTG', softwareType: 'rtg', authType: 'CREDENTIALS', description: 'RTG (new version) - Dashboard scraping', icon: '🎮' },
  { name: 'RTG Original', softwareType: 'rtg-original', authType: 'CREDENTIALS', description: 'Realtime Gaming original platform. Supports D-W-C revenue calculation.', icon: '🕹️' },
  { name: 'Rival (CasinoController)', softwareType: 'rival', authType: 'CREDENTIALS', description: 'Rival Gaming / CasinoController platform. Syncs sequentially to avoid rate limits.', icon: '🎯' },
  { name: 'Casino Rewards', softwareType: 'casino-rewards', authType: 'CREDENTIALS', icon: '🏆' },
  { name: 'Custom / Other', softwareType: 'custom', authType: 'CREDENTIALS', description: 'For platforms not in the list. Manual configuration required.', icon: '⚙️' },
];

// POST - Import templates from allmediamatter or add defaults
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { source = 'defaults' } = body; // 'allmediamatter' or 'defaults'

    let templatesToImport: DefaultTemplate[] = [];
    let fetchedFromApi = false;

    if (source === 'allmediamatter') {
      try {
        // Fetch from old allmediamatter API
        const response = await fetch('https://allmediamatter.com/api/stats/templates/export?all=true', {
          headers: { 'Accept': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          const apiTemplates = data.templates || [];

          if (apiTemplates.length > 0) {
            fetchedFromApi = true;

            // Convert API templates to our format
            templatesToImport = apiTemplates.map((t: {
              name: string;
              code?: string;
              provider?: string;
              authType?: string;
              apiUrl?: string;
              loginUrl?: string;
              config?: { apiUrl?: string; loginUrl?: string; baseUrl?: string };
            }, index: number): DefaultTemplate => {
              const softwareType = PROVIDER_TO_SOFTWARE[t.provider || ''] || 'custom';
              return {
                name: t.name,
                softwareType,
                authType: (t.authType as 'API_KEY' | 'CREDENTIALS' | 'BOTH') || 'CREDENTIALS',
                baseUrl: t.apiUrl || t.config?.apiUrl || t.config?.baseUrl || undefined,
                loginUrl: t.loginUrl || t.config?.loginUrl || undefined,
                icon: undefined,
                displayOrder: index,
              };
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch from allmediamatter:', error);
      }
    }

    // Use defaults if no templates from API
    if (templatesToImport.length === 0) {
      templatesToImport = DEFAULT_TEMPLATES.map((t, index) => ({
        ...t,
        displayOrder: index,
      }));
    }

    // Import templates (upsert by name)
    let imported = 0;
    let skipped = 0;

    for (const template of templatesToImport) {
      try {
        await prisma.programTemplate.upsert({
          where: { name: template.name },
          update: {
            softwareType: template.softwareType,
            authType: template.authType as 'API_KEY' | 'CREDENTIALS' | 'BOTH',
            baseUrl: template.baseUrl || null,
            loginUrl: template.loginUrl || null,
            icon: template.icon || null,
            description: template.description || null,
            apiKeyLabel: template.apiKeyLabel || null,
            apiSecretLabel: template.apiSecretLabel || null,
            baseUrlLabel: template.baseUrlLabel || null,
            requiresBaseUrl: template.requiresBaseUrl || false,
            supportsOAuth: template.supportsOAuth || false,
            displayOrder: template.displayOrder || 0,
          },
          create: {
            name: template.name,
            softwareType: template.softwareType,
            authType: template.authType as 'API_KEY' | 'CREDENTIALS' | 'BOTH',
            baseUrl: template.baseUrl || null,
            loginUrl: template.loginUrl || null,
            icon: template.icon || null,
            description: template.description || null,
            apiKeyLabel: template.apiKeyLabel || null,
            apiSecretLabel: template.apiSecretLabel || null,
            baseUrlLabel: template.baseUrlLabel || null,
            requiresBaseUrl: template.requiresBaseUrl || false,
            supportsOAuth: template.supportsOAuth || false,
            displayOrder: template.displayOrder || 0,
            isActive: true,
          },
        });
        imported++;
      } catch (error) {
        console.error(`Failed to import template ${template.name}:`, error);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      fetchedFromApi,
      message: `Imported ${imported} templates${skipped > 0 ? `, skipped ${skipped}` : ''}${fetchedFromApi ? ' from allmediamatter' : ' (defaults)'}`,
    });
  } catch (error) {
    console.error("Error importing templates:", error);
    return NextResponse.json(
      { error: "Failed to import templates" },
      { status: 500 }
    );
  }
}
