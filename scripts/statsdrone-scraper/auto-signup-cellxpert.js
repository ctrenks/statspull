/**
 * Auto-signup for CellXpert affiliate programs
 *
 * This script:
 * - Reads signup details from the database (SignupProfile)
 * - Finds all pending CellXpert programs with resolved URLs
 * - Opens each signup page
 * - Fills in the form with provided details
 * - Submits and marks as signed_up on success
 *
 * Usage:
 *   npm run signup:cellxpert
 *   npm run signup:cellxpert -- --software "MyAffiliates"
 */

const puppeteer = require('puppeteer');
const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

// Parse command line args
const args = process.argv.slice(2);
let softwareFilter = 'Cellxpert'; // Default
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--software' && args[i + 1]) {
    softwareFilter = args[i + 1];
  }
}

// Load signup details from database
async function loadSignupProfile() {
  const profile = await prisma.signupProfile.findFirst({
    where: { isDefault: true },
  });

  if (!profile) {
    console.log('❌ No default signup profile found!');
    console.log('   Go to Admin → Signup Profiles to create one.');
    console.log('   URL: https://statsfetch.com/admin/signup-profiles');
    process.exit(1);
  }

  return {
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    email: profile.email || '',
    phone: profile.phone || '',
    companyName: profile.companyName || '',
    website: profile.website || '',
    address: profile.address || '',
    city: profile.city || '',
    state: profile.state || '',
    country: profile.country || 'US',
    zipCode: profile.zipCode || '',
    username: profile.username || '',
    password: profile.password || '',
    confirmPassword: profile.password || '',
    skype: profile.skype || '',
    telegram: profile.telegram || '',
    discord: profile.discord || '',
    trafficSources: profile.trafficSources || '',
    monthlyVisitors: profile.monthlyVisitors || '',
    promotionMethods: profile.promotionMethods || '',
    comments: profile.comments || '',
  };
}

const crypto = require('crypto');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Generate a secure random password
function generatePassword(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  // Ensure at least one of each type
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%&*';

  let result = password.split('');
  result[0] = upper[crypto.randomInt(upper.length)];
  result[1] = lower[crypto.randomInt(lower.length)];
  result[2] = digits[crypto.randomInt(digits.length)];
  result[3] = special[crypto.randomInt(special.length)];

  // Shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

// Generate and save password for a program
async function getOrGeneratePassword(programId) {
  const program = await prisma.statsDrone_Program.findUnique({
    where: { id: programId },
    select: { signupPassword: true },
  });

  if (program?.signupPassword) {
    return program.signupPassword;
  }

  // Generate new password and save
  const password = generatePassword(16);
  await prisma.statsDrone_Program.update({
    where: { id: programId },
    data: { signupPassword: password },
  });

  return password;
}

async function fillCellXpertForm(page, details) {
  console.log('  Filling form fields...');

  // Common CellXpert field selectors - try multiple variations
  const fieldMappings = [
    // First Name
    { value: details.firstName, selectors: ['#firstName', '#first_name', 'input[name="firstName"]', 'input[name="first_name"]', 'input[placeholder*="First"]'] },
    // Last Name
    { value: details.lastName, selectors: ['#lastName', '#last_name', 'input[name="lastName"]', 'input[name="last_name"]', 'input[placeholder*="Last"]'] },
    // Email
    { value: details.email, selectors: ['#email', 'input[name="email"]', 'input[type="email"]', 'input[placeholder*="Email"]'] },
    // Phone
    { value: details.phone, selectors: ['#phone', '#telephone', 'input[name="phone"]', 'input[name="telephone"]', 'input[type="tel"]'] },
    // Company
    { value: details.companyName, selectors: ['#company', '#companyName', 'input[name="company"]', 'input[name="companyName"]', 'input[placeholder*="Company"]'] },
    // Website
    { value: details.website, selectors: ['#website', '#url', 'input[name="website"]', 'input[name="url"]', 'input[placeholder*="Website"]', 'input[placeholder*="URL"]'] },
    // Username
    { value: details.username, selectors: ['#username', 'input[name="username"]', 'input[placeholder*="Username"]'] },
    // Password
    { value: details.password, selectors: ['#password', 'input[name="password"]', 'input[type="password"]:first-of-type'] },
    // Confirm Password
    { value: details.confirmPassword || details.password, selectors: ['#confirmPassword', '#password_confirm', 'input[name="confirmPassword"]', 'input[name="password_confirm"]', 'input[type="password"]:last-of-type'] },
    // Address
    { value: details.address, selectors: ['#address', 'input[name="address"]', 'input[placeholder*="Address"]'] },
    // City
    { value: details.city, selectors: ['#city', 'input[name="city"]', 'input[placeholder*="City"]'] },
    // State
    { value: details.state, selectors: ['#state', 'input[name="state"]', 'input[placeholder*="State"]'] },
    // Zip
    { value: details.zipCode, selectors: ['#zip', '#zipCode', '#postalCode', 'input[name="zip"]', 'input[name="zipCode"]', 'input[name="postalCode"]'] },
    // Skype/IM
    { value: details.skype, selectors: ['#skype', '#im', 'input[name="skype"]', 'input[name="im"]', 'input[placeholder*="Skype"]'] },
    // Telegram
    { value: details.telegram, selectors: ['#telegram', 'input[name="telegram"]', 'input[placeholder*="Telegram"]'] },
    // Discord
    { value: details.discord, selectors: ['#discord', 'input[name="discord"]', 'input[placeholder*="Discord"]'] },
    // Traffic Sources
    { value: details.trafficSources, selectors: ['#trafficSources', '#traffic', 'input[name="trafficSources"]', 'input[name="traffic"]', 'input[placeholder*="traffic"]'] },
    // Monthly Visitors
    { value: details.monthlyVisitors, selectors: ['#visitors', '#monthlyVisitors', 'input[name="visitors"]', 'input[name="monthlyVisitors"]'] },
    // Promotion Methods
    { value: details.promotionMethods, selectors: ['#promotion', '#promotionMethods', 'input[name="promotion"]', 'textarea[name="promotionMethods"]'] },
    // Comments
    { value: details.comments, selectors: ['#comments', '#message', '#notes', 'textarea[name="comments"]', 'textarea[name="message"]', 'textarea[name="notes"]', 'textarea'] },
  ];

  let filledCount = 0;

  for (const field of fieldMappings) {
    if (!field.value) continue;

    for (const selector of field.selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 }); // Select all existing text
          await element.type(field.value, { delay: 50 });
          filledCount++;
          console.log(`    ✓ Filled: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
  }

  // Handle country dropdown
  if (details.country) {
    const countrySelectors = ['#country', 'select[name="country"]', 'select[name="countryCode"]'];
    for (const selector of countrySelectors) {
      try {
        await page.select(selector, details.country);
        console.log(`    ✓ Selected country: ${details.country}`);
        break;
      } catch (e) {
        // Try next selector
      }
    }
  }

  // Check terms checkbox if present
  const checkboxSelectors = ['input[name="terms"]', 'input[name="agree"]', 'input[type="checkbox"]'];
  for (const selector of checkboxSelectors) {
    try {
      const checkbox = await page.$(selector);
      if (checkbox) {
        const isChecked = await checkbox.evaluate(el => el.checked);
        if (!isChecked) {
          await checkbox.click();
          console.log(`    ✓ Checked terms checkbox`);
        }
        break;
      }
    } catch (e) {
      // Continue
    }
  }

  console.log(`  Filled ${filledCount} fields`);
  return filledCount;
}

async function submitForm(page) {
  console.log('  Looking for submit button...');

  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:contains("Sign Up")',
    'button:contains("Register")',
    'button:contains("Submit")',
    'button:contains("Create Account")',
    '.submit-btn',
    '.register-btn',
    '#submit',
    '#register',
  ];

  for (const selector of submitSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        console.log(`  Found submit button: ${selector}`);
        // Don't actually click - just report we found it
        // await button.click();
        return true;
      }
    } catch (e) {
      // Try next
    }
  }

  return false;
}

async function main() {
  console.log('🤖 Affiliate Auto-Signup Script');
  console.log('=' .repeat(50));
  console.log(`Software filter: ${softwareFilter}`);
  console.log();

  // Load signup profile from database
  console.log('Loading signup profile from database...');
  const SIGNUP_DETAILS = await loadSignupProfile();
  console.log(`✓ Using profile for: ${SIGNUP_DETAILS.firstName} ${SIGNUP_DETAILS.lastName} (${SIGNUP_DETAILS.email})\n`);

  // Get pending programs with resolved URLs
  const programs = await prisma.statsDrone_Program.findMany({
    where: {
      software: { contains: softwareFilter, mode: 'insensitive' },
      status: 'pending',
      finalJoinUrl: { not: null },
    },
    select: {
      id: true,
      name: true,
      finalJoinUrl: true,
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Found ${programs.length} pending ${softwareFilter} programs with resolved URLs\n`);

  if (programs.length === 0) {
    console.log('No programs to process!');
    await prisma.$disconnect();
    return;
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Show browser so you can see what's happening
    defaultViewport: { width: 1280, height: 800 },
    args: ['--start-maximized'],
  });

  let signedUp = 0;
  let failed = 0;

  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];
    const progress = `[${i + 1}/${programs.length}]`;

    console.log(`${progress} ${program.name}`);
    console.log(`  URL: ${program.finalJoinUrl}`);

    // Skip if URL still contains statsdrone.com (redirect didn't resolve)
    if (program.finalJoinUrl.includes('statsdrone.com')) {
      console.log('  🚫 URL still contains statsdrone.com - marking as closed\n');
      await prisma.statsDrone_Program.update({
        where: { id: program.id },
        data: { status: 'closed', finalJoinUrl: null },
      });
      failed++;
      continue;
    }

    // Generate unique password for this program
    const programPassword = await getOrGeneratePassword(program.id);
    console.log(`  Password: ${programPassword.substring(0, 4)}****`);

    // Create details with program-specific password
    const programDetails = {
      ...SIGNUP_DETAILS,
      password: programPassword,
      confirmPassword: programPassword,
    };

    const page = await browser.newPage();

    try {
      await page.goto(program.finalJoinUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await delay(2000); // Wait for page to fully load

      // Check if page shows "email already exists" or similar
      const pageContent = await page.content();
      const emailAlreadyUsed = /email.*(already|exists|registered|in use)|already.*registered|account.*exists/i.test(pageContent);
      
      if (emailAlreadyUsed) {
        console.log('  ✅ Email already registered - marking as signed up\n');
        await prisma.statsDrone_Program.update({
          where: { id: program.id },
          data: { status: 'signed_up', signupDate: new Date() },
        });
        signedUp++;
        await page.close();
        continue;
      }

      // Fill the form with program-specific password
      const fieldsFound = await fillCellXpertForm(page, programDetails);

      if (fieldsFound > 3) {
        // Found enough fields, looks like a valid signup form
        const hasSubmit = await submitForm(page);

        if (hasSubmit) {
          console.log('  ⏸️  PAUSED - Review form. Enter: signed_up | c: closed | s: skip');

          // Wait for user input
          const input = await new Promise(resolve => {
            process.stdin.once('data', (data) => {
              resolve(data.toString().trim().toLowerCase());
            });
          });

          if (input === 'c' || input === 'closed') {
            await prisma.statsDrone_Program.update({
              where: { id: program.id },
              data: { status: 'closed' },
            });
            console.log('  🚫 Marked as closed\n');
            failed++;
          } else if (input === 's' || input === 'skip') {
            console.log('  ⏭️  Skipped\n');
          } else {
            // Default: mark as signed up
            await prisma.statsDrone_Program.update({
              where: { id: program.id },
              data: { status: 'signed_up', signupDate: new Date() },
            });
            signedUp++;
            console.log('  ✅ Marked as signed up\n');
          }
        } else {
          console.log('  ⚠️  Could not find submit button\n');
          failed++;
        }
      } else {
        console.log('  ⚠️  Form structure not recognized\n');
        failed++;
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}\n`);
      failed++;
    }

    await page.close();
    await delay(2000); // Delay between signups
  }

  await browser.close();

  console.log('=' .repeat(50));
  console.log('✅ Auto-signup complete!');
  console.log(`   Signed up: ${signedUp}`);
  console.log(`   Failed: ${failed}`);
  console.log('=' .repeat(50));

  await prisma.$disconnect();
}

main().catch(console.error);
