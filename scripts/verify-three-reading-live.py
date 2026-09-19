import json
from pathlib import Path

from playwright.sync_api import sync_playwright


root = Path(__file__).resolve().parents[1]
output = root / 'artifacts' / 'screenshots' / 'three-reading-live.png'
book = '''{
  "schemaVersion": 7,
  "id": "three-reading-live",
  "name": "Kiểm tra đo 3 chỉ",
  "benchmarks": [{"id":"b1","name":"DG1","elevation":"1,000"}],
  "runs": [{
    "id":"r1","name":"Lượt 1","roundNumber":1,"startPoint":"DG1",
    "startMode":"known","mode":"three",
    "stations":[{"id":"s1","point":"","pointType":"turning","bsUpper":"","bsMiddle":"","bsLower":"","fsUpper":"","fsMiddle":"","fsLower":""}]
  }],
  "settings": {}
}'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(script=f'''localStorage.clear();
      localStorage.setItem('so-thuy-chuan.active-draft.v2', {json.dumps(book)});''')
    page.goto('http://127.0.0.1:5173', wait_until='networkidle')

    stats = page.get_by_label('Kết quả kiểm tra ba chỉ')
    assert 'Lệch chỉ giữa BS\n— mm' in stats.inner_text()
    assert 'Lệch chỉ giữa FS\n— mm' in stats.inner_text()

    for label, value in [
        ('Mia sau chỉ trên theo mét', '1,234'),
        ('Mia sau chỉ giữa theo mét', '1,201'),
    ]:
        page.get_by_role('textbox', name=label).fill(value)
        page.get_by_role('textbox', name=label).blur()
        assert 'Lệch chỉ giữa BS\n— mm' in stats.inner_text()

    page.get_by_role('textbox', name='Mia sau chỉ dưới theo mét').fill('1,166')
    page.get_by_role('textbox', name='Mia sau chỉ dưới theo mét').blur()
    assert 'Lệch chỉ giữa BS\n+1 mm' in stats.inner_text()
    assert 'Lệch chỉ giữa FS\n— mm' in stats.inner_text()
    assert 'Chênh cự ly · ΔD\n— m' in stats.inner_text()

    for label, value in [
        ('Mia trước chỉ trên theo mét', '0,998'),
        ('Mia trước chỉ giữa theo mét', '0,966'),
        ('Mia trước chỉ dưới theo mét', '0,932'),
    ]:
        page.get_by_role('textbox', name=label).fill(value)
        page.get_by_role('textbox', name=label).blur()

    assert 'Lệch chỉ giữa BS\n+1 mm' in stats.inner_text()
    assert 'Lệch chỉ giữa FS\n+1 mm' in stats.inner_text()
    assert 'Chênh cự ly · ΔD\n' in stats.inner_text()
    assert 'Chênh cự ly · ΔD\n— m' not in stats.inner_text()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    stats.screenshot(path=str(output))
    assert not errors, errors
    print('PASS: each middle-reading error appears immediately after its own three readings; ΔD waits for both staffs.')
    browser.close()
