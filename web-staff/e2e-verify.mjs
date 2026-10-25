import { chromium } from './node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '../docs/screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function run() {
  console.log('Starting Playwright verification & screenshot capture...');
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 375, height: 812 },
  ];

  const themes = ['dark', 'light'];

  // Helper to set theme in localStorage
  async function setTheme(page, theme) {
    await page.evaluate((t) => {
      localStorage.setItem('atelier-theme', t);
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
  }

  // Helper to login
  async function login(page, username, password) {
    await page.goto('http://localhost:5174/dang-nhap');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  }

  // 1. Test & Screenshot: /quen-mat-khau
  for (const vp of viewports) {
    for (const th of themes) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto('http://localhost:5174/quen-mat-khau');
      await setTheme(page, th);
      await page.reload();
      await page.waitForLoadState('networkidle');
      const shotPath = path.join(screenshotsDir, `staff-forgot-${vp.name}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved ${shotPath}`);
      await page.close();
    }
  }

  // 2. Test & Screenshot: 404 Page (unauthenticated)
  for (const vp of viewports) {
    for (const th of themes) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto('http://localhost:5174/duong-dan-khong-ton-tai');
      await setTheme(page, th);
      await page.reload();
      await page.waitForLoadState('networkidle');
      const shotPath = path.join(screenshotsDir, `staff-404-${vp.name}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved ${shotPath}`);
      await page.close();
    }
  }

  // 3. Test & Screenshot: Authenticated as OWNER
  for (const vp of viewports) {
    for (const th of themes) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto('http://localhost:5174/dang-nhap');
      await setTheme(page, th);
      await login(page, 'owner', '123456');

      // 3a. /tai-khoan
      await page.goto('http://localhost:5174/tai-khoan');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      let shotPath = path.join(screenshotsDir, `staff-accounts-${vp.name}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved ${shotPath}`);

      // 3b. /nhan-vien/tao-moi
      await page.goto('http://localhost:5174/nhan-vien/tao-moi');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      shotPath = path.join(screenshotsDir, `staff-new-employee-${vp.name}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved ${shotPath}`);

      // 3c. /yeu-cau-mat-khau
      await page.goto('http://localhost:5174/yeu-cau-mat-khau');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      shotPath = path.join(screenshotsDir, `staff-password-requests-${vp.name}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved ${shotPath}`);

      // 3d. /ho-so
      await page.goto('http://localhost:5174/ho-so');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      shotPath = path.join(screenshotsDir, `staff-profile-${vp.name}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved ${shotPath}`);

      // 3e. /doi-mat-khau (normal)
      await page.goto('http://localhost:5174/doi-mat-khau');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      shotPath = path.join(screenshotsDir, `staff-change-password-${vp.name}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved ${shotPath}`);

      await page.close();
    }
  }

  // 4. Test 403 Forbidden: Login as Receptionist (letan), visit /tai-khoan (owner only)
  for (const vp of viewports) {
    for (const th of themes) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto('http://localhost:5174/dang-nhap');
      await setTheme(page, th);
      await login(page, 'letan', '123456');

      await page.goto('http://localhost:5174/tai-khoan');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      const shotPath = path.join(screenshotsDir, `staff-403-${vp.name}-${th}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved ${shotPath}`);
      await page.close();
    }
  }

  // 5. Test Force Password Change:
  // Create an employee with account having mustChangePassword = true, login, verify forced change password screen
  const adminPage = await browser.newPage();
  await adminPage.goto('http://localhost:5174/dang-nhap');
  await login(adminPage, 'owner', '123456');
  await adminPage.goto('http://localhost:5174/tai-khoan');
  await adminPage.waitForLoadState('networkidle');

  const token = await adminPage.evaluate(() => localStorage.getItem('salon_token'));
  
  // Call API to create/reset password for ST-002
  const resetRes = await fetch('http://localhost:3000/api/accounts', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());

  const target = Array.isArray(resetRes) ? resetRes.find(r => r.employee.code === 'ST-002') : null;
  if (target && target.account) {
    const patchRes = await fetch(`http://localhost:3000/api/accounts/${target.account.id}/reset-password`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'TempPass123' })
    }).then(r => r.json());
    console.log('Reset ST-002 password to TempPass123, tempPassword:', patchRes.temporaryPassword);

    await adminPage.close();

    // Now login as ST-002
    for (const vp of viewports) {
      for (const th of themes) {
        const forcedPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await forcedPage.goto('http://localhost:5174/dang-nhap');
        await setTheme(forcedPage, th);
        await login(forcedPage, 'ST-002', patchRes.temporaryPassword || 'TempPass123');

        // Check current URL is /doi-mat-khau
        console.log(`ST-002 forced redirect URL: ${forcedPage.url()}`);
        if (!forcedPage.url().includes('/doi-mat-khau')) {
          throw new Error(`Expected redirect to /doi-mat-khau, but got ${forcedPage.url()}`);
        }

        // Try navigating to /ngay-cua-toi, verify it redirects back to /doi-mat-khau
        await forcedPage.goto('http://localhost:5174/ngay-cua-toi');
        await forcedPage.waitForLoadState('networkidle');
        console.log(`ST-002 after navigating to /ngay-cua-toi: ${forcedPage.url()}`);
        if (!forcedPage.url().includes('/doi-mat-khau')) {
          throw new Error(`ForcePasswordGuard failed: allowed navigation to ${forcedPage.url()}`);
        }

        const shotPath = path.join(screenshotsDir, `staff-change-password-forced-${vp.name}-${th}.png`);
        await forcedPage.screenshot({ path: shotPath, fullPage: true });
        console.log(`Saved ${shotPath}`);
        await forcedPage.close();
      }
    }
  }

  await browser.close();
  console.log('All Playwright tests and screenshots completed successfully!');
}

run().catch((err) => {
  console.error('Error running test script:', err);
  process.exit(1);
});
