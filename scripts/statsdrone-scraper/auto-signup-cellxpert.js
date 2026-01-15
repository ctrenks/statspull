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
let limitCount = 1; // Default to 1 at a time
let customPath = null; // Custom registration path to append to base URL

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--software' && args[i + 1]) {
    softwareFilter = args[i + 1];
  }
  if (args[i] === '--limit' && args[i + 1]) {
    limitCount = parseInt(args[i + 1]) || 1;
  }
  if (args[i] === '--all') {
    limitCount = 9999;
  }
  if (args[i] === '--path' && args[i + 1]) {
    customPath = args[i + 1];
    // Ensure path starts with /
    if (!customPath.startsWith('/')) {
      customPath = '/' + customPath;
    }
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

// Generate a simple password like "TomTest12" - CellXpert compatible
function generatePassword() {
  const words = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Foxtrot',
    'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
    'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
    'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray',
    'Blue', 'Green', 'Red', 'Gold', 'Silver', 'Iron',
    'Star', 'Moon', 'Sun', 'Sky', 'Cloud', 'Rain'
  ];

  const word1 = words[crypto.randomInt(words.length)];
  const word2 = words[crypto.randomInt(words.length)];
  const num = crypto.randomInt(10, 99); // Two digit number

  return word1 + word2 + num;
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

  // Clean company name - remove extra spaces, some sites don't like them
  const cleanCompanyName = details.companyName ? details.companyName.replace(/\s+/g, '') : '';

  // Clean phone number - DIGITS ONLY (CellXpert pattern is [0-9]*)
  let cleanPhone = details.phone || '';
  if (cleanPhone) {
    // Keep ONLY digits, remove everything else including + and country codes
    cleanPhone = cleanPhone.replace(/\D/g, '');
    // Remove leading 1 if it's a US number (10 digits after)
    if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
      cleanPhone = cleanPhone.substring(1);
    }
  }
  console.log(`  Phone formatted: ${cleanPhone} (digits only)`);

  // First, let's analyze what fields are on the page
  console.log('  Analyzing form fields...');
  const allInputs = await page.$$eval('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])', inputs => {
    return inputs.map(i => ({
      id: i.id,
      name: i.name,
      type: i.type,
      placeholder: i.placeholder,
      className: i.className
    }));
  });

  for (const input of allInputs.slice(0, 15)) {
    console.log(`    Field: id="${input.id}" name="${input.name}" type="${input.type}" placeholder="${input.placeholder}"`);
  }
  if (allInputs.length > 15) {
    console.log(`    ... and ${allInputs.length - 15} more fields`);
  }
  console.log('');

  // Common CellXpert field selectors - try multiple variations
  const fieldMappings = [
    // First Name - many variations
    { name: 'First Name', value: details.firstName, selectors: [
      '#firstName', '#first_name', '#firstname', '#fname', '#first',
      '#given_name', '#givenName', '#givenname',
      'input[name="firstName"]', 'input[name="first_name"]', 'input[name="firstname"]',
      'input[name="fname"]', 'input[name="first"]', 'input[name="given_name"]',
      'input[name="givenName"]', 'input[name="name_first"]',
      'input[placeholder*="First Name"]', 'input[placeholder*="First name"]',
      'input[placeholder*="first name"]', 'input[placeholder="First"]',
      'input[id*="first"]', 'input[name*="first"]'
    ]},
    // Last Name - many variations
    { name: 'Last Name', value: details.lastName, selectors: [
      '#lastName', '#last_name', '#lastname', '#lname', '#last',
      '#family_name', '#familyName', '#familyname', '#surname',
      'input[name="lastName"]', 'input[name="last_name"]', 'input[name="lastname"]',
      'input[name="lname"]', 'input[name="last"]', 'input[name="family_name"]',
      'input[name="familyName"]', 'input[name="surname"]', 'input[name="name_last"]',
      'input[placeholder*="Last Name"]', 'input[placeholder*="Last name"]',
      'input[placeholder*="last name"]', 'input[placeholder="Last"]',
      'input[placeholder*="Surname"]', 'input[placeholder*="Family"]',
      'input[id*="last"]', 'input[name*="last"]', 'input[name*="surname"]'
    ]},
    // Email
    { name: 'Email', value: details.email, selectors: ['#email', 'input[name="email"]', 'input[type="email"]', 'input[placeholder*="Email"]'] },
    // Phone - use cleaned phone number
    { name: 'Phone', value: cleanPhone, selectors: ['#phone', '#telephone', '#mobile', '#cell', 'input[name="phone"]', 'input[name="telephone"]', 'input[name="mobile"]', 'input[type="tel"]'] },
    // Company (without spaces for CellXpert compatibility)
    { name: 'Company', value: cleanCompanyName, selectors: ['#company', '#companyName', 'input[name="company"]', 'input[name="companyName"]', 'input[placeholder*="Company"]'] },
    // Website
    { name: 'Website', value: details.website, selectors: ['#website', '#url', 'input[name="website"]', 'input[name="url"]', 'input[placeholder*="Website"]', 'input[placeholder*="URL"]'] },
    // Username
    { name: 'Username', value: details.username, selectors: ['#username', 'input[name="username"]', 'input[placeholder*="Username"]'] },
    // Address
    { name: 'Address', value: details.address, selectors: ['#address', 'input[name="address"]', 'input[placeholder*="Address"]'] },
    // City
    { name: 'City', value: details.city, selectors: ['#city', 'input[name="city"]', 'input[placeholder*="City"]'] },
    // State
    { name: 'State', value: details.state, selectors: ['#state', 'input[name="state"]', 'input[placeholder*="State"]'] },
    // Zip
    { name: 'Zip', value: details.zipCode, selectors: ['#zip', '#zipCode', '#postalCode', 'input[name="zip"]', 'input[name="zipCode"]', 'input[name="postalCode"]'] },
    // Skype/IM
    { name: 'Skype', value: details.skype, selectors: ['#skype', '#im', 'input[name="skype"]', 'input[name="im"]', 'input[placeholder*="Skype"]'] },
    // Telegram
    { name: 'Telegram', value: details.telegram, selectors: ['#telegram', 'input[name="telegram"]', 'input[placeholder*="Telegram"]'] },
    // Discord
    { name: 'Discord', value: details.discord, selectors: ['#discord', 'input[name="discord"]', 'input[placeholder*="Discord"]'] },
    // Traffic Sources
    { name: 'Traffic', value: details.trafficSources, selectors: ['#trafficSources', '#traffic', 'input[name="trafficSources"]', 'input[name="traffic"]', 'input[placeholder*="traffic"]'] },
    // Monthly Visitors
    { name: 'Visitors', value: details.monthlyVisitors, selectors: ['#visitors', '#monthlyVisitors', 'input[name="visitors"]', 'input[name="monthlyVisitors"]'] },
    // Promotion Methods
    { name: 'Promotion', value: details.promotionMethods, selectors: ['#promotion', '#promotionMethods', 'input[name="promotion"]', 'textarea[name="promotionMethods"]'] },
    // Comments
    { name: 'Comments', value: details.comments, selectors: ['#comments', '#message', '#notes', 'textarea[name="comments"]', 'textarea[name="message"]', 'textarea[name="notes"]', 'textarea'] },
  ];

  let filledCount = 0;

  for (const field of fieldMappings) {
    if (!field.value) continue;

    let filled = false;
    for (const selector of field.selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 }); // Select all existing text
          await element.type(field.value, { delay: 30 });
          filledCount++;
          console.log(`    ✓ ${field.name}: ${selector}`);
          filled = true;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    if (!filled && field.value) {
      console.log(`    ✗ ${field.name}: NOT FOUND`);
    }
  }

  // Handle confirm email field - find ALL email type inputs and fill the second one
  console.log('  Looking for confirm email field...');

  // First try specific selectors
  const confirmEmailSelectors = [
    '#confirmEmail', '#confirm_email', '#emailConfirm', '#email_confirm',
    '#reenterEmail', '#re_enter_email', '#verifyEmail', '#verify_email',
    'input[name="confirmEmail"]', 'input[name="confirm_email"]',
    'input[name="emailConfirm"]', 'input[name="email_confirm"]',
    'input[name="reenterEmail"]', 'input[name="verifyEmail"]',
    'input[name="email2"]', 'input[name="cemail"]',
    'input[placeholder*="Confirm"]', 'input[placeholder*="Re-enter"]',
    'input[placeholder*="Verify"]', 'input[placeholder*="Retype"]'
  ];

  let confirmEmailFilled = false;
  for (const selector of confirmEmailSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.click({ clickCount: 3 });
        await element.type(details.email, { delay: 30 });
        console.log(`    ✓ Confirm Email: ${selector}`);
        filledCount++;
        confirmEmailFilled = true;
        break;
      }
    } catch (e) {
      // Try next
    }
  }

  // If not found, try to find all email inputs and fill any we haven't filled yet
  if (!confirmEmailFilled) {
    const allEmailInputs = await page.$$('input[type="email"]');
    console.log(`    Found ${allEmailInputs.length} email input(s)`);

    // Fill all email inputs (first one is regular email, rest are confirm)
    for (let i = 1; i < allEmailInputs.length; i++) {
      try {
        await allEmailInputs[i].click({ clickCount: 3 });
        await allEmailInputs[i].type(details.email, { delay: 30 });
        console.log(`    ✓ Email input ${i + 1} filled (likely confirm)`);
        filledCount++;
        confirmEmailFilled = true;
      } catch (e) {
        console.log(`    ✗ Email input ${i + 1} failed`);
      }
    }
  }

  if (!confirmEmailFilled) {
    console.log(`    ⚠️ Confirm email field not found - may need manual entry`);
  }

  // Handle password fields separately - they need special handling
  console.log('  Filling password fields...');
  const passwordFields = await page.$$('input[type="password"]');
  console.log(`    Found ${passwordFields.length} password field(s)`);

  for (let i = 0; i < passwordFields.length; i++) {
    try {
      // Clear any existing value first
      await passwordFields[i].click();
      await passwordFields[i].evaluate(el => el.value = '');
      await delay(100);

      // Type password slowly
      await passwordFields[i].type(details.password, { delay: 50 });
      await delay(200);

      // Verify it was filled
      const value = await passwordFields[i].evaluate(el => el.value);
      if (value.length > 0) {
        console.log(`    ✓ Password field ${i + 1} filled (${value.length} chars)`);
        filledCount++;
      } else {
        console.log(`    ⚠️ Password field ${i + 1} appears empty after fill`);
      }
    } catch (e) {
      console.log(`    ✗ Password field ${i + 1} failed: ${e.message}`);
    }
  }

  // Show the password being used so user can manually enter if needed
  console.log(`    Password to use: ${details.password}`);

  // Handle country dropdown - find US option and select it robustly
  console.log('  Selecting country...');
  const countrySelectors = ['#country', 'select[name="country"]', 'select[name="countryCode"]', 'select[name="country_id"]', 'select[id*="country"]', 'select[name*="country"]'];

  let countrySelected = false;
  for (const selector of countrySelectors) {
    if (countrySelected) break;

    const selectEl = await page.$(selector);
    if (!selectEl) continue;

    try {
      // Find the US option value by searching option text
      const usValue = await page.evaluate((sel) => {
        const select = document.querySelector(sel);
        if (!select) return null;

        const options = Array.from(select.querySelectorAll('option'));

        // First try exact matches
        for (const opt of options) {
          const text = opt.textContent?.trim().toLowerCase() || '';
          const val = opt.value?.toLowerCase() || '';
          if (text === 'united states' || text === 'united states of america' ||
              val === 'us' || val === 'usa' || val === 'united states') {
            return opt.value;
          }
        }

        // Then try contains
        for (const opt of options) {
          const text = opt.textContent?.trim().toLowerCase() || '';
          if (text.includes('united states')) {
            return opt.value;
          }
        }

        return null;
      }, selector);

      if (usValue) {
        // Click the select first to ensure focus
        await selectEl.click();
        await delay(100);

        // Select the US value
        await page.select(selector, usValue);
        await delay(200);

        // Verify the selection stuck
        const selectedValue = await page.evaluate((sel) => {
          const select = document.querySelector(sel);
          return select ? select.value : null;
        }, selector);

        console.log(`    ✓ Selected country: "${usValue}" (verified: "${selectedValue}")`);
        countrySelected = true;

        // If it didn't stick, try clicking the option directly
        if (selectedValue !== usValue) {
          console.log(`    ⚠️ Selection didn't stick, trying direct option click...`);
          await page.evaluate((sel, val) => {
            const select = document.querySelector(sel);
            if (select) {
              select.value = val;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, selector, usValue);
          await delay(200);
        }
      }
    } catch (e) {
      console.log(`    ⚠️ Country selection error: ${e.message}`);
    }
  }

  if (!countrySelected) {
    console.log(`    ⚠️ Country selection failed - will need manual selection`);
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

  // Show list of programs
  console.log('Programs to process:');
  for (let i = 0; i < Math.min(programs.length, 20); i++) {
    console.log(`  ${i + 1}. ${programs[i].name}`);
  }
  if (programs.length > 20) {
    console.log(`  ... and ${programs.length - 20} more`);
  }
  console.log('\nPress Enter to start (or Ctrl+C to cancel)...');
  await new Promise(resolve => process.stdin.once('data', resolve));

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Show browser so you can see what's happening
    defaultViewport: { width: 1280, height: 800 },
    args: ['--start-maximized'],
  });

  let signedUp = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];
    const progress = `\n[${ i + 1}/${programs.length}]`;

    console.log(`${progress} ${program.name}`);
    console.log(`  URL: ${program.finalJoinUrl}`);

    // Validate URL
    if (!program.finalJoinUrl || program.finalJoinUrl.trim() === '') {
      console.log('  🚫 No URL - marking as closed\n');
      await prisma.statsDrone_Program.update({
        where: { id: program.id },
        data: { status: 'closed' },
      });
      failed++;
      continue;
    }

    // Handle custom path - strip to base URL and append custom path
    let targetUrl = program.finalJoinUrl;
    if (customPath) {
      try {
        const urlObj = new URL(program.finalJoinUrl);
        targetUrl = urlObj.origin + customPath;
        console.log(`  📝 Custom path: Using ${targetUrl}`);
      } catch (e) {
        // Keep original URL
      }
    } else if (softwareFilter.toLowerCase().includes('income access')) {
      // Default for Income Access - use /registration.asp
      try {
        const urlObj = new URL(program.finalJoinUrl);
        targetUrl = urlObj.origin + '/registration.asp';
        console.log(`  📝 Income Access: Using ${targetUrl}`);
      } catch (e) {
        // Keep original URL
      }
    }

    // Check if valid URL format
    try {
      new URL(program.finalJoinUrl);
    } catch (e) {
      console.log('  🚫 Invalid URL format - marking as closed\n');
      await prisma.statsDrone_Program.update({
        where: { id: program.id },
        data: { status: 'closed', finalJoinUrl: null },
      });
      failed++;
      continue;
    }

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
      await page.goto(targetUrl, {
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

      // Analyze form validation
      console.log('');
      console.log('  🔍 Analyzing form validation...');

      const analyzeValidation = async () => {
        // Check for validation attributes on form fields
        const validationInfo = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input, select, textarea');
          const validations = [];

          inputs.forEach(input => {
            const info = {
              name: input.name || input.id || input.placeholder || 'unknown',
              type: input.type,
              required: input.required,
              pattern: input.pattern || null,
              minLength: input.minLength > 0 ? input.minLength : null,
              maxLength: input.maxLength > 0 && input.maxLength < 1000000 ? input.maxLength : null,
              validationMessage: input.validationMessage || null,
              isValid: input.checkValidity ? input.checkValidity() : null,
              value: input.value ? input.value.substring(0, 20) + (input.value.length > 20 ? '...' : '') : '(empty)',
              classList: Array.from(input.classList).join(' ')
            };

            // Only show fields with validation issues
            if (info.required || info.pattern || info.validationMessage || info.isValid === false) {
              validations.push(info);
            }
          });

          return validations;
        });

        if (validationInfo.length > 0) {
          console.log('  Fields with validation:');
          for (const v of validationInfo) {
            let status = v.isValid === false ? '❌' : (v.isValid === true ? '✓' : '?');
            console.log(`    ${status} ${v.name} (${v.type}): value="${v.value}"`);
            if (v.required) console.log(`       - required: true`);
            if (v.pattern) console.log(`       - pattern: ${v.pattern}`);
            if (v.minLength) console.log(`       - minLength: ${v.minLength}`);
            if (v.validationMessage) console.log(`       - error: "${v.validationMessage}"`);
          }
        }

        // Look for visible error messages on the page with their associated field
        const errorMessages = await page.evaluate(() => {
          const errorSelectors = [
            '.error', '.error-message', '.validation-error', '.field-error',
            '.invalid-feedback', '.help-block', '[class*="error"]',
            '.form-error', '.input-error', '.text-danger',
            'span.error', 'div.error', '.alert-danger', '.has-error'
          ];

          const errors = [];
          for (const selector of errorSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && text.length > 0 && text.length < 200) {
                // Try to find which field this error is for
                let fieldName = 'unknown';
                const parent = el.closest('.form-group, .field-wrapper, .input-group, div');
                if (parent) {
                  const label = parent.querySelector('label');
                  const input = parent.querySelector('input, select, textarea');
                  if (label) fieldName = label.textContent?.trim() || 'unknown';
                  else if (input) fieldName = input.name || input.id || 'unknown';
                }
                errors.push({ field: fieldName, message: text });
              }
            });
          }

          // Deduplicate by message
          const seen = new Set();
          return errors.filter(e => {
            if (seen.has(e.message)) return false;
            seen.add(e.message);
            return true;
          }).slice(0, 10);
        });

        if (errorMessages.length > 0) {
          console.log('');
          console.log('  🚨 Visible error messages on page:');
          for (const err of errorMessages) {
            console.log(`     - [${err.field}]: "${err.message}"`);
          }
        }
      };

      await analyzeValidation();

      // Always pause for user review regardless of fields found
      console.log('');
      console.log(`  📝 Filled ${fieldsFound} fields total`);
      console.log('');
      console.log('  ⏸️  PAUSED - Complete signup manually if needed');
      console.log('     Commands:');
      console.log('       Enter = Mark as signed_up');
      console.log('       c     = Mark as closed');
      console.log('       s     = Skip (leave pending)');
      console.log('       q     = Quit');
      console.log('       v     = Re-check validation');
      console.log('       d     = Dump all field values');
      console.log('       r     = Refresh page (for CAPTCHA retry)');
      console.log('');
      process.stdout.write('  > ');

      // Wait for user input
      let input = await new Promise(resolve => {
        process.stdin.once('data', (data) => {
          resolve(data.toString().trim().toLowerCase());
        });
      });

      // Handle validation re-check, dump, or refresh
      while (input === 'v' || input === 'd' || input === 'r') {
        if (input === 'v') {
          console.log('');
          await analyzeValidation();
        } else if (input === 'd') {
          console.log('');
          console.log('  📋 All field values:');
          const allValues = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), select, textarea');
            return Array.from(inputs).map(el => ({
              name: el.name || el.id || 'unknown',
              type: el.type || el.tagName,
              value: el.value || '(empty)',
              valid: el.checkValidity ? el.checkValidity() : null,
              validationMsg: el.validationMessage || null
            }));
          });
          for (const f of allValues) {
            const status = f.valid === false ? '❌' : (f.valid === true ? '✓' : '?');
            console.log(`    ${status} ${f.name}: "${f.value}"`);
            if (f.validationMsg) {
              console.log(`       ⚠️ ${f.validationMsg}`);
            }
          }
        } else if (input === 'r') {
          console.log('');
          console.log('  🔄 Refreshing page... Fill form manually this time!');
          console.log('     (CAPTCHA should work when you interact manually)');
          await page.reload({ waitUntil: 'networkidle2' });
          await delay(2000);
          console.log('  ✓ Page refreshed. Fill the form manually, then:');
          console.log('    - Press Enter when done to mark as signed_up');
          console.log('    - Press c to mark as closed');
          console.log('    - Press s to skip');
        }
        console.log('');
        process.stdout.write('  > ');
        input = await new Promise(resolve => {
          process.stdin.once('data', (data) => {
            resolve(data.toString().trim().toLowerCase());
          });
        });
      }

      if (input === 'c' || input === 'closed') {
        await prisma.statsDrone_Program.update({
          where: { id: program.id },
          data: { status: 'closed' },
        });
        console.log('  🚫 Marked as closed\n');
        failed++;
      } else if (input === 's' || input === 'skip') {
        console.log('  ⏭️  Skipped\n');
        skipped++;
      } else if (input === 'q' || input === 'quit') {
        console.log('  👋 Quitting...\n');
        await page.close();
        break;
      } else {
        // Default: mark as signed up
        await prisma.statsDrone_Program.update({
          where: { id: program.id },
          data: { status: 'signed_up', signupDate: new Date() },
        });
        signedUp++;
        console.log('  ✅ Marked as signed up\n');
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      console.log('  Press Enter to continue, c to close, s to skip, q to quit');
      process.stdout.write('  > ');

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
      } else if (input === 'q' || input === 'quit') {
        console.log('  👋 Quitting...\n');
        break;
      } else {
        skipped++;
        console.log('  ⏭️  Skipped\n');
      }
    }

    try {
      await page.close();
    } catch (e) {
      // Page might already be closed
    }

    await delay(1000); // Brief delay between signups
  }

  await browser.close();

  console.log('=' .repeat(50));
  console.log('✅ Auto-signup complete!');
  console.log(`   Signed up: ${signedUp}`);
  console.log(`   Closed: ${failed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log('=' .repeat(50));

  await prisma.$disconnect();
}

main().catch(console.error);
