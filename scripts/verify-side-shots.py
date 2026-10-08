import json
from pathlib import Path

from playwright.sync_api import sync_playwright, expect


root = Path(__file__).resolve().parents[1]
book = {
    'schemaVersion': 7, 'id': 'side-shot-live', 'name': 'Kiểm tra tia phụ',
    'benchmarks': [{'id': 'b1', 'name': 'DG1', 'elevation': '10,000'}],
    'runs': [{'id': 'r1', 'name': 'Lượt 1', 'roundNumber': 1,
              'startPoint': 'DG1', 'startMode': 'known', 'mode': 'single',
              'stations': [{'id': 's1', 'point': '', 'pointType': 'turning'}]}],
    'settings': {},
}


def current_book(page):
    return page.evaluate('''() => {
      const library = JSON.parse(localStorage.getItem('so-thuy-chuan.library.v5'));
      return library.books.find(book => book.id === library.activeBookId);
    }''')


def save_readings(page, expected_next, three=False):
    readings = [
        ('Mia sau chỉ trên theo mét', '1,550'),
        ('Mia sau chỉ giữa theo mét', '1,500'),
        ('Mia sau chỉ dưới theo mét', '1,450'),
        ('Mia trước chỉ trên theo mét', '1,250'),
        ('Mia trước chỉ giữa theo mét', '1,200'),
        ('Mia trước chỉ dưới theo mét', '1,150'),
    ] if three else [
        ('Số đọc mia sau BS theo mét', '1,500'),
        ('Số đọc mia trước FS theo mét', '1,200'),
    ]
    for label, value in readings:
        field = page.get_by_role('textbox', name=label, exact=True)
        field.fill(value)
        field.blur()
    page.get_by_role('button', name='Lưu trạm', exact=True).click()
    confirmation = page.get_by_role('button', name='Đã kiểm tra · Lưu trạm', exact=True)
    if confirmation.is_visible():
        confirmation.click()
    expect(page.get_by_role('combobox', name='Điểm tới', exact=True)).to_have_attribute('placeholder', expected_next)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    errors = []
    context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
    context.add_init_script(script=f'''if (location.origin === 'http://127.0.0.1:5173' && !localStorage.getItem('side-shot-fixture-loaded')) {{
      localStorage.clear();
      localStorage.setItem('so-thuy-chuan.active-draft.v2', {json.dumps(json.dumps(book, ensure_ascii=False))});
      localStorage.setItem('side-shot-fixture-loaded', 'true');
    }}''')
    page = context.new_page()
    page.goto('http://127.0.0.1:5173', wait_until='networkidle')
    print('Rendered controls:', page.get_by_role('group', name='Chọn loại điểm tới').inner_text())
    side = page.get_by_role('button', name='Tia phụ', exact=True)
    turning = page.get_by_role('button', name='Điểm chuyền', exact=True)
    target = page.get_by_role('combobox', name='Điểm tới', exact=True)
    expect(target).to_have_attribute('placeholder', '1.1')
    side.click()
    expect(target).to_have_attribute('placeholder', 'TP.1.1')
    save_readings(page, 'TP.1.2')
    expect(side).to_have_attribute('aria-pressed', 'true')
    assert current_book(page)['runs'][0]['stations'][0]['point'] == 'TP.1.1'
    assert 'DG1' in page.locator('.console-top').inner_text()
    save_readings(page, 'TP.1.3')
    turning.click()
    expect(target).to_have_attribute('placeholder', '1.1')
    save_readings(page, '1.2')
    assert '1.1' in page.locator('.console-top').inner_text()
    side.click()
    expect(target).to_have_attribute('placeholder', 'TP.1.3')
    save_readings(page, 'TP.1.4')
    saved = current_book(page)['runs'][0]['stations']
    assert [(s['point'], s['pointType']) for s in saved] == [
        ('TP.1.1', 'side'), ('TP.1.2', 'side'), ('1.1', 'turning'),
        ('TP.1.3', 'side'), ('', 'side'),
    ]
    page.reload(wait_until='networkidle')
    assert current_book(page)['runs'][0]['stations'] == saved
    # Navigate to the last station; selection persists in the stored station.
    while not page.get_by_role('button', name='Trạm tiếp theo', exact=True).is_disabled():
        page.get_by_role('button', name='Trạm tiếp theo', exact=True).click()
    expect(target).to_have_attribute('placeholder', 'TP.1.4')
    expect(side).to_have_attribute('aria-pressed', 'true')
    assert '1.1' in page.locator('.console-top').inner_text()
    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert side.bounding_box()['height'] >= 44
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('.pointbox').screenshot(path=str(root / 'artifacts/screenshots/side-shot-selector.png'))

    # A separate book/round tests three-wire mode and stable round numbering.
    three_context = browser.new_context(viewport={'width': 390, 'height': 844})
    three_book = json.loads(json.dumps(book))
    three_book['runs'][0].update({'mode': 'three', 'roundNumber': 2, 'name': 'Lượt 2'})
    three_context.add_init_script(script=f'''if (location.origin === 'http://127.0.0.1:5173') {{
      localStorage.clear();
      localStorage.setItem('so-thuy-chuan.active-draft.v2', {json.dumps(json.dumps(three_book, ensure_ascii=False))});
    }}''')
    three_page = three_context.new_page()
    three_page.on('pageerror', lambda error: errors.append(str(error)))
    three_page.goto('http://127.0.0.1:5173', wait_until='networkidle')
    three_page.get_by_role('button', name='Tia phụ', exact=True).click()
    expect(three_page.get_by_role('combobox', name='Điểm tới', exact=True)).to_have_attribute('placeholder', 'TP.2.1')
    save_readings(three_page, 'TP.2.2', three=True)
    assert current_book(three_page)['runs'][0]['stations'][0]['point'] == 'TP.2.1'
    assert 'DG1' in three_page.locator('.console-top').inner_text()
    assert not errors, errors
    print('PASS: side/turning switching, TP.round.index names, origin retention, persistence, 3-wire entry and narrow mobile layout.')
    browser.close()
