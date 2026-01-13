/**
 * View scraped StatsDrone data
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function viewData() {
  console.log('📊 StatsDrone Scraped Data Summary\n');
  
  // Total programs
  const total = await prisma.statsDrone_Program.count();
  console.log(`Total Programs: ${total}`);
  
  // By software
  console.log('\n📦 By Software:');
  const bySoftware = await prisma.statsDrone_Program.groupBy({
    by: ['software'],
    _count: true,
    orderBy: {
      _count: {
        software: 'desc'
      }
    },
    take: 20
  });
  
  bySoftware.forEach(item => {
    console.log(`  ${item.software || 'Unknown'}: ${item._count}`);
  });
  
  // By category
  console.log('\n🎯 By Category:');
  const byCategory = await prisma.statsDrone_Program.groupBy({
    by: ['category'],
    _count: true,
    orderBy: {
      _count: {
        category: 'desc'
      }
    }
  });
  
  byCategory.forEach(item => {
    console.log(`  ${item.category || 'Unknown'}: ${item._count}`);
  });
  
  // API Support
  const withAPI = await prisma.statsDrone_Program.count({
    where: { apiSupport: true }
  });
  console.log(`\n🔌 Programs with API Support: ${withAPI} (${Math.round(withAPI/total*100)}%)`);
  
  // Available in StatsDrone
  const availableSD = await prisma.statsDrone_Program.count({
    where: { availableInSD: true }
  });
  console.log(`📡 Available in StatsDrone: ${availableSD} (${Math.round(availableSD/total*100)}%)`);
  
  // Mapped to templates
  const mapped = await prisma.statsDrone_Program.count({
    where: { mappedToTemplate: true }
  });
  console.log(`✅ Mapped to Templates: ${mapped} (${Math.round(mapped/total*100)}%)`);
  
  // Recent programs
  console.log('\n🆕 Recently Scraped (Top 10):');
  const recent = await prisma.statsDrone_Program.findMany({
    orderBy: { scrapedAt: 'desc' },
    take: 10,
    select: {
      name: true,
      software: true,
      category: true,
      scrapedAt: true
    }
  });
  
  recent.forEach(p => {
    console.log(`  ${p.name} (${p.software}) - ${p.scrapedAt.toLocaleDateString()}`);
  });
  
  // Scraping logs
  console.log('\n📋 Recent Scraping Logs:');
  const logs = await prisma.statsDrone_ScrapingLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5
  });
  
  logs.forEach(log => {
    const duration = log.completedAt 
      ? Math.round((log.completedAt - log.startedAt) / 1000) 
      : 'N/A';
    console.log(`  ${log.software || 'all'}: ${log.status} - ${log.programsFound} programs (${duration}s)`);
  });
  
  await prisma.$disconnect();
}

viewData().catch(console.error);
