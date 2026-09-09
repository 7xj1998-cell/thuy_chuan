const fs = require('node:fs');
const path = require('node:path');

const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(process.argv[3] || process.cwd());
const localUrl = process.argv[4] || 'http://127.0.0.1:5173/';
const deployedUrl = process.argv[5] || '';
const executablePath = process.argv[6] || undefined;
const outputDirectory = path.join(root, 'artifacts/screenshots');
fs.mkdirSync(outputDirectory, { recursive: true });

const benchmarkBook = {
  schemaVersion: 6,
  id: 'visual-book',
  name: 'Sổ kiểm tra V2.8',
  benchmarks: [
    { id: 'b1', name: 'DG1', elevation: '1,000' },
    { id: 'b2', name: 'DG2', elevation: '1,500' },
  ],
  runs: [
    {
      id: 'r1', name: 'Lượt đi', roundNumber: 1, startPoint: 'DG1', startMode: 'known', mode: 'single',
      stations: [
        { id: 's1', point: 'DC1', pointType: 'turning', bs: '1,234', fs: '0,958', distance: '35,000', committedAt: 1 },
        { id: 's2', point: 'DG2', pointType: 'turning', bs: '1,120', fs: '0,896', distance: '32,000', committedAt: 2 },
      ],
    },
    {
      id: 'r2', name: 'Lượt về', roundNumber: 2, startPoint: 'DG2', startMode: 'known', mode: 'single',
      stations: [
        { id: 's3', point: 'DC1', pointType: 'turning', bs: '0,896', fs: '1,120', distance: '32,000', committedAt: 3 },
        { id: 's4', point: 'DG1', pointType: 'turning', bs: '0,958', fs: '1,234', distance: '35,000', committedAt: 4 },
      ],
    },
  ],
  settings: { toleranceCoefficient: '20' },
  createdAt: 1,
  updatedAt: Date.now(),
};

function hundredStationBook() {
  return {
    ...benchmarkBook,
    id: 'visual-100',
    name: 'Sổ kiểm tra 100 trạm',
    runs: [{
      ...benchmarkBook.runs[0],
      id: 'r100',
      name: 'Tuyến 100 trạm',
      stations: Array.from({ length: 100 }, (_, index) => ({
        id: `station-${index + 1}`,
        point: index === 99 ? 'DG2' : `DC${index + 1}`,
        pointType: 'turning',
        bs: '1,200',
        fs: '1,195',
        distance: '25,000',
        committedAt: index + 1,
      })),
    }],
  };
}

async function seed(page, book, outdoor = false) {
  await page.addInitScript(({ value, outdoorValue }) => {
    localStorage.setItem('so-thuy-chuan.active-draft.v2', JSON.stringify(value));
    localStorage.setItem('so-thuy-chuan.outdoor-mode.v1', String(outdoorValue));
  }, { value: book, outdoorValue: outdoor });
}

async function captureFour(browser, url, prefix) {
  const context = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page, benchmarkBook);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.app-v25').waitFor();
  const screens = [['measure', 'Đo'], ['route', 'Tuyến'], ['result', 'Kết quả'], ['files', 'Sổ & tệp']];
  for (const [name, label] of screens) {
    if (name !== 'measure') await page.getByRole('button', { name: label, exact: true }).click();
    await page.screenshot({ path: path.join(outputDirectory, `${prefix}-${name}.png`), fullPage: false });
  }
  await context.close();
  return errors;
}

async function responsiveChecks(browser) {
  const checks = [];
  for (const [width, height] of [[360, 800], [375, 812], [414, 896], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await seed(page, benchmarkBook, true);
    await page.goto(localUrl, { waitUntil: 'networkidle' });
    const values = await page.evaluate(() => ({
      width: innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      outdoor: document.documentElement.dataset.outdoor,
      dock: document.querySelector('.capture-dock')?.getBoundingClientRect().toJSON(),
      tabs: document.querySelector('.bottom')?.getBoundingClientRect().toJSON(),
      primaryBottom: document.querySelector('.quick-options')?.getBoundingClientRect().bottom,
      primaryVisibleWithoutScroll: document.querySelector('.quick-options')?.getBoundingClientRect().bottom <= document.querySelector('.capture-dock')?.getBoundingClientRect().top,
      dockAboveTabs: document.querySelector('.capture-dock')?.getBoundingClientRect().bottom <= document.querySelector('.bottom')?.getBoundingClientRect().top + 1,
    }));
    checks.push({ viewport: `${width}x${height}`, ...values });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await seed(page, hundredStationBook());
  await page.goto(localUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Tuyến', exact: true }).click();
  const cards = page.locator('.routecard');
  const count = await cards.count();
  await cards.last().scrollIntoViewIfNeeded();
  checks.push({ routeCards: count, lastStationVisible: await cards.last().isVisible() });
  await page.getByRole('button', { name: 'Đo', exact: true }).click();
  await page.evaluate(() => document.body.classList.add('keyboard-open'));
  checks.push(await page.evaluate(() => ({
    keyboardMode: true,
    bottomDisplay: getComputedStyle(document.querySelector('.bottom')).display,
    dockPosition: getComputedStyle(document.querySelector('.capture-dock')).position,
  })));
  await context.close();
  return checks;
}

async function dialogChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page, benchmarkBook);
  await page.goto(localUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Tuyến', exact: true }).click();
  await page.getByRole('button', { name: 'Cài đặt lượt đo' }).click();
  const settingsOpened = await page.getByRole('heading', { name: 'Cài đặt lượt', exact: true }).isVisible();
  await page.getByLabel('Tên lượt').fill('Lượt hiện trường');
  const renamed = await page.getByLabel('Tên lượt').inputValue();
  await page.getByRole('button', { name: 'Đổi điểm' }).click();
  const settingsAfterOrigin = await page.getByRole('heading', { name: 'Cài đặt lượt', exact: true }).count();
  const originOpened = await page.getByRole('heading', { name: 'Điểm xuất phát', exact: true }).isVisible();
  const sheetsAfterOrigin = await page.locator('.sheet-panel').count();
  await page.getByRole('button', { name: 'Kết quả', exact: true }).click({ force: true });
  const sheetsAfterTab = await page.locator('.sheet-panel').count();
  await context.close();
  return { settingsOpened, renamed, settingsAfterOrigin, originOpened, sheetsAfterOrigin, sheetsAfterTab, errors };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath });
  const report = { localErrors: await captureFour(browser, localUrl, 'after') };
  if (deployedUrl) {
    try { report.deployedErrors = await captureFour(browser, deployedUrl, 'before'); }
    catch (error) { report.deployedCaptureError = error.message; }
  }
  report.responsive = await responsiveChecks(browser);
  report.dialogs = await dialogChecks(browser);
  await browser.close();
  fs.writeFileSync(path.join(outputDirectory, 'visual-qa.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
