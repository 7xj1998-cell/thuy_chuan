from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
output = root / 'artifacts/screenshots'
output.mkdir(parents=True, exist_ok=True)
url = 'http://127.0.0.1:5173/'

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url + '?icons=compare', wait_until='networkidle')
    assert page.locator('.icon-option').count() == 5
    print(page.locator('h1').inner_text())
    page.screenshot(path=str(output / 'five-icon-sets.png'), full_page=True)
    for i, family in enumerate(['technical', 'rounded', 'duotone', 'solid', 'compact']):
        page.locator('.choose-icons').nth(i).click()
        page.reload(wait_until='networkidle')
        assert page.locator('.choose-icons').nth(i).get_attribute('aria-pressed') == 'true'
        page.get_by_role('link', name='Mở ứng dụng').click()
        page.wait_for_load_state('networkidle')
        families = page.locator('svg[data-icon-family]').evaluate_all('(els) => [...new Set(els.map(el => el.dataset.iconFamily))]')
        assert families == [family], families
        assert page.get_by_role('button', name='Làm lại thay đổi', exact=True).locator('svg[data-icon-name="Redo2"]').count() == 1
        page.goto(url + '?icons=compare', wait_until='networkidle')
    page.locator('.choose-icons').nth(0).click()
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(output / 'icon-sets-mobile.png'), full_page=True)
    page.goto(url, wait_until='networkidle')
    # Fixtures live only in this isolated browser context.
    page.evaluate('''() => {
      localStorage.clear();
      localStorage.setItem('so-thuy-chuan.active-draft.v2', JSON.stringify({
        schemaVersion:7,id:'qa-profile',name:'Tuyến kiểm tra 12 trạm',
        benchmarks:[{id:'b',name:'DG1',elevation:'10,000'}],
        runs:[{id:'r',name:'Lượt 1',roundNumber:1,startPoint:'DG1',startMode:'known',mode:'single',
          stations:Array.from({length:12},(_,i)=>({id:`s${i}`,point:i===5?'MỐC GIỮA TUYẾN CÓ TÊN DÀI':i===11?'DG2':`1.${i+1}`,pointType:'turning',bs:'1,500',fs:i%3===0?'1,650':'1,200',distance:'25,000',committedAt:i+1}))}],settings:{measurementClass:''}
      }));
    }''')
    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Tuyến', exact=True).click()
    assert page.locator('.profile-point-label').count() == 13
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.locator('.profile-scroll').evaluate('(el) => el.scrollWidth > el.clientWidth')
    page.locator('.profile-point-label').nth(6).click()
    assert 'MỐC GIỮA TUYẾN CÓ TÊN DÀI' in page.locator('.profile-selection').inner_text()
    page.locator('.profile-card').screenshot(path=str(output / 'elevation-profile-mobile.png'))
    page.get_by_role('button', name='Xem điểm tiếp theo').click()
    assert 'Điểm 8/13' in page.locator('.profile-selection').inner_text()
    page.get_by_role('button', name='Xem điểm trước').click()
    assert 'Điểm 7/13' in page.locator('.profile-selection').inner_text()
    page.locator('.profile-point-label').last.click()
    assert page.get_by_role('button', name='Xem điểm tiếp theo').is_disabled()
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.locator('.profile-point-label').nth(6).click()
    page.locator('.profile-card').screenshot(path=str(output / 'elevation-profile-desktop.png'))
    page.get_by_role('button', name='Sổ & tệp', exact=True).click()
    page.get_by_role('button', name='Giao diện · chọn 1 trong 5 bộ icon').click()
    assert page.get_by_role('dialog').is_visible()
    page.locator('.choose-icons').nth(2).click()
    page.get_by_role('button', name='Đóng hộp thoại', exact=True).click()
    page.get_by_role('button', name='Đo', exact=True).click()
    assert page.get_by_role('button', name='Làm lại thay đổi').locator('svg').get_attribute('data-icon-family') == 'duotone'
    page.set_viewport_size({'width': 320, 'height': 740})
    page.get_by_role('button', name='Tuyến', exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    print('PASS: five complete families, persistence, redo icon, 13 visible point labels, long names, scrolling, point navigation, in-app chooser; no runtime errors at 320/390/1440px.')
    browser.close()
