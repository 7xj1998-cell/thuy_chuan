from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 414, 'height': 896})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173', wait_until='networkidle')
    page.evaluate('''() => {
      localStorage.clear();
      localStorage.setItem('so-thuy-chuan.active-draft.v2', JSON.stringify({schemaVersion:7,id:'qa-book',name:'QA Undo',benchmarks:[{id:'b',name:'A',elevation:'1.000'}],runs:[{id:'r',name:'Lượt 1',roundNumber:1,startPoint:'A',mode:'single',stations:[{id:'s',point:'',bs:'',fs:'',distance:''}]}],settings:{measurementClass:''}}));
    }''')
    page.reload(wait_until='networkidle')
    reading = page.get_by_role('textbox', name='Số đọc mia sau BS theo mét', exact=True)
    reading.fill('1,234')
    reading.blur()
    page.get_by_role('button', name='Hoàn tác:', exact=False).click()
    page.get_by_role('button', name='Hoàn tác an toàn', exact=True).click()
    assert reading.input_value() == ''
    page.get_by_role('button', name='Làm lại thay đổi', exact=True).click()
    page.get_by_role('button', name='Làm lại', exact=True).click()
    assert reading.input_value() == '1,234'
    page.get_by_role('button', name='Hoàn tác:', exact=False).click()
    page.get_by_role('button', name='Hoàn tác an toàn', exact=True).click()
    reading.fill('2,345')
    reading.blur()
    assert page.get_by_role('button', name='Làm lại thay đổi', exact=True).is_disabled()
    assert not errors, errors
    print('PASS: undo, redo, changed input clears redo; no runtime errors (414x896)')
    browser.close()
