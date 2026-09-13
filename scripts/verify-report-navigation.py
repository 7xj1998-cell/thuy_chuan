"""Read-only fixture input; browser data lives in an isolated temporary context."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

with open(sys.argv[1], encoding='utf-8-sig') as source:
    library = json.load(source)['library']

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 414, 'height': 896})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173')
    page.evaluate('(library) => localStorage.setItem("so-thuy-chuan.library.v5", JSON.stringify(library))', library)
    page.reload(wait_until='networkidle')
    assert page.locator('.workspace-header img').count() == 0
    assert '2.8.2' not in page.locator('.workspace-header').inner_text()
    nav = page.get_by_role('navigation', name='Điều hướng chính')
    nav.get_by_role('button', name='Kết quả', exact=True).click()
    assert page.locator('[data-result-area="closure"]').is_visible()
    assert not page.locator('[data-result-area="comparison"]').is_visible()
    count = page.locator('.result-card').count()
    page.locator('.result-card summary').first.click()
    page.evaluate('window.scrollTo(0, 300)')
    page.wait_for_timeout(200)
    before = page.evaluate('window.scrollY')
    nav.get_by_role('button', name='Tuyến', exact=True).click()
    page.evaluate('window.scrollTo(0, 900)')
    page.wait_for_timeout(200)
    route_before = page.evaluate('window.scrollY')
    nav.get_by_role('button', name='Kết quả', exact=True).click()
    page.wait_for_timeout(200)
    assert abs(page.evaluate('window.scrollY') - before) <= 2
    assert page.locator('.result-card').first.get_attribute('open') is not None
    nav.get_by_role('button', name='Tuyến', exact=True).click()
    page.wait_for_timeout(200)
    assert abs(page.evaluate('window.scrollY') - route_before) <= 2
    nav.get_by_role('button', name='Kết quả', exact=True).click()
    page.get_by_role('button', name='Điểm chung', exact=True).click()
    assert page.locator('[data-result-area="comparison"]').is_visible()
    assert not page.locator('[data-result-area="closure"]').is_visible()
    nav.get_by_role('button', name='Sổ & tệp', exact=True).click()
    version = json.loads((Path(__file__).resolve().parents[1] / 'package.json').read_text(encoding='utf-8'))['version']
    assert version in page.locator('.app-version').inner_text()
    nav.get_by_role('button', name='Kết quả', exact=True).click()
    assert page.locator('[data-result-area="comparison"]').is_visible()
    page.get_by_role('searchbox', name='Tìm điểm chung').fill('DC7')
    assert page.locator('.compare.report-disclosure').count() == 1
    assert 'DC7' in page.locator('.compare.report-disclosure').inner_text()
    page.get_by_role('searchbox', name='Tìm điểm chung').fill('')
    page.get_by_role('button', name='Lệch lớn trước').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    page.screenshot(path=sys.argv[2], full_page=False)
    print(json.dumps({'runs': count, 'resultScroll': before, 'routeScroll': route_before, 'consoleErrors': errors, 'viewport': '414x896'}))
    browser.close()
