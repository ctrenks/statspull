# StatsDrone Affiliate Program Scraper

A tool to import affiliate program data from StatsDrone.com for competitive research and bootstrapping your program database.

## ⚠️ Important Legal & Ethical Considerations

**Before using this tool, please:**

1. ✅ **Check StatsDrone's Terms of Service** at https://statsdrone.com/terms-and-conditions
2. ✅ **Review robots.txt** at https://statsdrone.com/robots.txt
3. ✅ **Consider reaching out** to StatsDrone for a data partnership or API access
4. ✅ **Use respectful rate limiting** (built into this tool: 3-5 second delays)
5. ✅ **Attribute data properly** when using in your application

### Why This Matters

- **Fair Competition:** StatsDrone invested time building their database
- **Server Load:** Aggressive scraping can burden their infrastructure
- **Legal Risk:** Violating ToS could result in legal action
- **Better Alternative:** A data partnership benefits both parties

### Recommended Approach

**Best:** Contact StatsDrone about:
- Data licensing agreement
- API access for program data
- Partnership opportunities

**Alternative:** Use this scraper responsibly:
- Run during off-peak hours
- Respect rate limits (already built-in)
- Don't overwhelm their servers
- Attribute data source in your app

## 🚀 Setup

### 1. Install Dependencies

```bash
cd scripts/statsdrone-scraper
npm install
```

### 2. Push Database Schema

From the project root:

```bash
npx prisma db push
```

This will create the `StatsDrone_Program` and `StatsDrone_ScrapingLog` tables.

## 📊 Usage

### Step 1: Scrape Programs

**Dry run first** (recommended):

```bash
npm run scrape
```

This will:
- ✅ Scrape all affiliate programs from StatsDrone
- ✅ Store in `StatsDrone_Program` table
- ✅ Use 3-5 second delays between requests
- ✅ Log progress to `StatsDrone_ScrapingLog`

**By Software Filter** (optional):

Edit `scraper.js` and uncomment the "Option 2" section to scrape by software categories (MyAffiliates, Cellxpert, etc.). This is more respectful as it makes fewer requests.

### Step 2: Resolve Redirect URLs

StatsDrone uses redirect URLs for affiliate links. Resolve them to get the final, clean URLs:

```bash
npm run resolve
```

This will:
- ✅ Find all programs with joinUrl but no finalJoinUrl
- ✅ Follow each redirect to get the final destination
- ✅ Clean URLs (remove query parameters)
- ✅ Save to database (~2 seconds per program)

**Time estimate:** ~80 minutes for 2,400 programs

### Step 3: View Scraped Data

```bash
npm run view
```

This shows:
- Total programs scraped
- Breakdown by software
- Breakdown by category
- API support statistics
- Recent scraping logs

### Step 4: Export to Your Templates

**Dry run** (see what would be created):

```bash
npm run export
```

**Live export** (actually create templates):

```bash
npm run export -- --live
```

**Options:**

```bash
# Only export programs with API support
npm run export -- --live --api-only

# Limit to first 50 programs
npm run export -- --live --limit 50
```

## 🗄️ Database Schema

### StatsDrone_Program

Stores scraped program data:

```prisma
model StatsDrone_Program {
  id                String   @id
  name              String
  slug              String   @unique
  software          String?
  commission        String?
  apiSupport        Boolean
  availableInSD     Boolean
  category          String?
  logoUrl           String?
  reviewUrl         String?
  joinUrl           String?
  exclusiveOffer    String?
  sourceUrl         String
  scrapedAt         DateTime
  lastCheckedAt     DateTime
  mappedToTemplate  Boolean
  templateId        String?
}
```

### StatsDrone_ScrapingLog

Tracks scraping activity:

```prisma
model StatsDrone_ScrapingLog {
  id          String   @id
  software    String?
  status      String
  programsFound Int
  error       String?
  startedAt   DateTime
  completedAt DateTime?
}
```

## 📈 Workflow

```
1. Scrape Programs → StatsDrone_Program table
2. Review Data → npm run view
3. Map to Templates → npm run export --live
4. Programs now in your ProgramTemplate table
5. Users can add them to their account
```

## 🔧 Customization

### Software Mapping

Edit `SOFTWARE_MAPPING` in `export-to-templates.js` to map StatsDrone's software names to your system:

```javascript
const SOFTWARE_MAPPING = {
  'MyAffiliates': 'MyAffiliates',
  'Cellxpert': 'CellXpert',
  // Add more...
};
```

### Category Mapping

Edit `CATEGORY_MAPPING` to map categories:

```javascript
const CATEGORY_MAPPING = {
  'Gambling': 'Casino',
  'Sports Betting': 'Sports',
  // Add more...
};
```

## ⚙️ Rate Limiting

The scraper automatically:
- Waits 3-5 seconds between requests
- Uses realistic browser user agent
- Respects server resources

**Never:**
- Run multiple instances simultaneously
- Reduce delay times below 3 seconds
- Scrape during peak hours (9am-5pm EST)

## 🧹 Maintenance

### Re-scrape Updated Data

Programs change over time. To refresh:

```bash
npm run scrape
```

Existing programs will be updated with new data.

### View Mapping Status

See which programs have been exported to templates:

```bash
npm run view
```

Look for the "Mapped to Templates" statistic.

## 🤝 Contributing Back

If you find errors in StatsDrone's data or have corrections:
- Contact them directly
- Help improve their database
- Build goodwill for future partnerships

## 📝 Notes

- This tool creates ~2,100 programs in your database
- First scrape may take 2-3 hours (with respectful delays)
- Subsequent scrapes are faster (upsert existing records)
- Data is kept separate in `statsdrone_` prefixed tables
- Original source URLs are preserved for attribution

## 🆘 Support

For issues with this tool:
- Check the scraping logs in database
- Review error messages in console
- Ensure Prisma schema is up to date

## 📄 License

This tool is for research and competitive intelligence purposes. Please respect StatsDrone's intellectual property and consider a partnership arrangement.

---

**Built for Stats Fetch** - Helping affiliates organize their data 📊
