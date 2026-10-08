import json
from pathlib import Path

from playwright.sync_api import sync_playwright, expect


root = Path(__file__).resolve().parents[1]


def fixture(mode):
    return {
        'schemaVersion': 7, 'id': 'keyboard-enter-' + mode, 'name': 'Kiểm tra Enter',
        'benchmarks': [{'id': 'b1', 'name': 'DG1', 'elevation': '10,000'}],
        'runs': [{'id': 'r1', 'name': 'Lượt 1', 'roundNumber': 1,
                  'startPoint': 'DG1', 'startMode': 'known', 'mode': mode,
                  'stations': [{'id': 's1', 'point': '', 'pointType': 'turning'}]}],
        'settings': {},
    }


def setup(browser, mode, width=390):
    context = browser.new_context(viewport={'width': width, 'height': 844}, has_touch=width < 700)
    context.add_init_script(script=f'''if (location.origin === 'http://127.0.0.1:5173') {{
      localStorage.clear();
      localStorage.setItem('so-thuy-chuan.active-draft.v2', {json.dumps(json.dumps(fixture(mode), ensure_ascii=False))});
      const viewport = new EventTarget();
      Object.assign(viewport, {{height: 844, width: {width}, offsetTop: 0, offsetLeft: 0}});
      Object.defineProperty(window, 'visualViewport', {{value: viewport, configurable: true}});
      window.testKeyboardViewport = viewport;
    }}''')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173', wait_until='networkidle')
    assert page.locator('input[data-reading]').count() == (6 if mode == 'three' else 2)
    return page, errors


def tap_enter(page, last=False):
    button = page.get_by_role('button', name='Enter: lưu trạm' if last else 'Enter: chuyển ô tiếp theo', exact=True)
    box = button.bounding_box()
    page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    page, errors = setup(browser, 'three')
    toolbar = page.get_by_role('toolbar', name='Điều khiển bàn phím số')
    expect(toolbar).to_have_count(0)
    page.locator('[data-reading="bsUpper"]').focus()
    page.evaluate('''() => {
      Object.assign(testKeyboardViewport, {height: 480, offsetTop: 40});
      testKeyboardViewport.dispatchEvent(new Event('resize'));
    }''')
    expect(toolbar).to_be_visible()
    expect(toolbar).to_contain_text('Mia sau chỉ giữa')
    expect(page.locator('.capture-dock')).to_be_hidden()
    assert abs(toolbar.bounding_box()['y'] + toolbar.bounding_box()['height'] - 520) < 1
    # Panning while the keyboard is open keeps Enter above its upper edge.
    page.evaluate('''() => {
      testKeyboardViewport.offsetTop = 80;
      testKeyboardViewport.dispatchEvent(new Event('scroll'));
    }''')
    expect(toolbar).to_have_attribute('style', 'top: 504px; left: 0px; width: 390px;')
    order = ['bsUpper', 'bsMiddle', 'bsLower', 'fsUpper', 'fsMiddle', 'fsLower']
    values = ['1,550', '1,500', '1,450', '1,250', '1,200', '1,150']
    for index, (field, value) in enumerate(zip(order, values)):
        input_field = page.locator(f'[data-reading="{field}"]')
        expect(input_field).to_be_focused()
        input_field.fill(value)
        if index == 1:
            # A physical Return key follows the same staff order as the touch button.
            input_field.press('Enter')
        else:
            tap_enter(page, last=index == len(order) - 1)
        if index < len(order) - 1:
            expect(page.locator(f'[data-reading="{order[index + 1]}"]')).to_be_focused()
            expect(input_field).to_have_value(value)
    expect(page.get_by_role('combobox', name='Điểm tới', exact=True)).to_have_attribute('placeholder', '1.2')
    expect(page.locator('[data-reading="bsUpper"]')).to_be_focused()
    saved = page.evaluate("JSON.parse(localStorage.getItem('so-thuy-chuan.library.v5')).books[0].runs[0].stations[0]")
    assert saved['point'] == '1.1'
    assert [saved[field] for field in order] == values
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    page.screenshot(path=str(root / 'artifacts/screenshots/keyboard-enter-mobile.png'))
    page.get_by_role('button', name='Xong', exact=True).click()
    expect(toolbar).to_have_count(0)
    expect(page.locator('.capture-dock')).to_be_visible()
    assert not errors, errors

    page, errors = setup(browser, 'single', width=320)
    page.locator('[data-reading="bs"]').fill('1,500')
    tap_enter(page)
    expect(page.locator('[data-reading="fs"]')).to_be_focused()
    expect(page.get_by_role('toolbar')).to_contain_text('Lưu trạm')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    # Dismiss closes the keyboard without committing an incomplete station.
    page.get_by_role('button', name='Xong', exact=True).click()
    expect(page.get_by_role('combobox', name='Điểm tới', exact=True)).to_have_attribute('placeholder', '1.1')
    page.locator('[data-reading="fs"]').fill('1,200')
    tap_enter(page, last=True)
    expect(page.get_by_role('combobox', name='Điểm tới', exact=True)).to_have_attribute('placeholder', '1.2')
    assert not errors, errors

    page, errors = setup(browser, 'single', width=1024)
    page.locator('[data-reading="bs"]').focus()
    expect(page.get_by_role('toolbar', name='Điều khiển bàn phím số')).to_have_count(0)
    page.locator('[data-reading="bs"]').press('Enter')
    expect(page.locator('[data-reading="fs"]')).to_be_focused()
    assert not errors, errors
    print('PASS: touch Enter and physical Return follow staff order, keep focus, save the last reading, dismiss safely, and follow simulated keyboard resize/pan at mobile widths.')
    browser.close()
