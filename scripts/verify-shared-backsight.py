import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
book = {
    'schemaVersion': 7, 'id': 'shared-backsight-live', 'name': 'Kiểm tra mia sau tia phụ',
    'benchmarks': [{'id': 'b1', 'name': '4.1', 'elevation': '3,188'}],
    'runs': [{'id': 'r1', 'name': 'Lượt 4', 'roundNumber': 4, 'startPoint': '4.1', 'startMode': 'known', 'mode': 'three', 'stations': [
        {'id': 'source', 'point': 'DG4L1', 'pointType': 'turning', 'committedAt': 1,
         'bsUpper': '1,024', 'bsMiddle': '0,900', 'bsLower': '0,776',
         'fsUpper': '1,632', 'fsMiddle': '1,538', 'fsLower': '1,442'},
        {'id': 'side', 'point': 'DG4L2', 'pointType': 'turning', 'fsMiddle': '1,081'},
    ]}], 'settings': {},
}


def saved_book(page):
    return page.evaluate("JSON.parse(localStorage.getItem('so-thuy-chuan.library.v5')).books[0]")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True)
    context.add_init_script(script=f'''if (location.origin === 'http://127.0.0.1:5173' && !localStorage.getItem('shared-fixture')) {{
      localStorage.clear(); localStorage.setItem('shared-fixture', 'true');
      localStorage.setItem('so-thuy-chuan.active-draft.v2', {json.dumps(json.dumps(book, ensure_ascii=False))});
    }}''')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173', wait_until='networkidle')
    assert page.locator('input[data-reading]').count() == 6
    page.get_by_role('button', name='Trạm tiếp theo', exact=True).click()
    side_button = page.get_by_role('button', name='Tia phụ', exact=True)
    side_button.click()
    dialog = page.get_by_role('dialog', name='Chuyển sang Tia phụ')
    expect(dialog).to_contain_text('trạm 1 tại 4.1')
    expect(dialog).to_contain_text('chỉ cần nhập mia trước')
    page.get_by_role('button', name='Quay lại', exact=True).click()
    expect(side_button).to_have_attribute('aria-pressed', 'false')
    side_button.click()
    page.get_by_role('button', name='Dùng lại mia sau', exact=True).click()
    for field, value in [('bsUpper', '1,024'), ('bsMiddle', '0,900'), ('bsLower', '0,776')]:
        expect(page.locator(f'[data-reading="{field}"]')).to_have_value(value)
        expect(page.locator(f'[data-reading="{field}"]')).to_have_attribute('readonly', '')
    expect(page.locator('[data-reading="fsMiddle"]')).to_have_value('1,081')
    expect(page.locator('.console-top')).to_contain_text('4.1')
    expect(page.get_by_label('Kết quả tính tức thời')).to_contain_text('3,007 m')
    page.locator('[data-reading="fsUpper"]').fill('1,181')
    page.locator('[data-reading="fsUpper"]').press('Enter')
    expect(page.locator('[data-reading="fsMiddle"]')).to_be_focused()
    page.locator('[data-reading="fsMiddle"]').press('Enter')
    expect(page.locator('[data-reading="fsLower"]')).to_be_focused()
    page.locator('[data-reading="fsLower"]').fill('0,981')
    page.locator('[data-reading="fsLower"]').blur()
    page.screenshot(path=str(root / 'artifacts/screenshots/shared-backsight-mobile.png'))
    page.get_by_role('button', name='Lưu trạm', exact=True).click()
    expect(page.get_by_role('combobox', name='Điểm tới', exact=True)).to_have_attribute('placeholder', 'TP.4.1')
    expect(page.locator('[data-reading="fsUpper"]')).to_be_focused()
    expect(page.locator('[data-reading="bsMiddle"]')).to_have_value('0,900')
    expect(page.locator('[data-reading="fsMiddle"]')).to_have_value('')
    assert saved_book(page)['runs'][0]['stations'][1]['backsightSourceId'] == 'source'
    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Trạm tiếp theo', exact=True).click()
    page.get_by_role('button', name='Trạm tiếp theo', exact=True).click()
    expect(page.locator('[data-reading="bsMiddle"]')).to_have_value('0,900')
    expect(page.locator('.console-top')).to_contain_text('4.1')
    page.get_by_role('button', name='Đã chuyển máy · Nhập mới', exact=True).click()
    expect(page.get_by_role('dialog', name='Đã chuyển máy?')).to_be_visible()
    page.get_by_role('button', name='Nhập mia sau mới', exact=True).click()
    expect(page.locator('[data-reading="bsMiddle"]')).to_have_value('')
    assert page.locator('[data-reading="bsMiddle"]').get_attribute('readonly') is None
    expect(page.locator('.console-top')).to_contain_text('DG4L1')
    assert saved_book(page)['runs'][0]['stations'][2]['backsightMode'] == 'manual'
    # The alternative on the switch reminder also uses a fresh machine setup.
    page.get_by_role('button', name='Điểm chuyền', exact=True).click()
    side_button.click()
    page.get_by_role('button', name='Đã chuyển máy', exact=True).click()
    expect(page.locator('[data-reading="bsMiddle"]')).to_have_value('')
    expect(page.locator('.console-top')).to_contain_text('DG4L1')
    page.set_viewport_size({'width': 320, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    print('PASS: reminder, cancel, inherited three-wire BS/origin, H=3.007 m, FS-only Enter navigation, consecutive shots, persistence, and moved-machine manual branch.')
    browser.close()
