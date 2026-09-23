"""Run: python3 scripts/ux-check.py (local server :3000, installed Playwright).
All browser mutation requests are mocked except local administrator login.
"""
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = os.environ.get('UX_BASE_URL', 'http://localhost:3000')
assert base.startswith(('http://localhost:', 'http://127.0.0.1:'))

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    reservations = {}
    reservation_posts = []
    fail_fill = True
    def api(route):
        if '/api/fill' in route.request.url and route.request.method == 'POST' and not fail_fill:
            body = route.request.post_data_json
            reservation_posts.append(body)
            reservation = {
                'productNo': body['productNo'], 'unit': body.get('unit'), 'depth': body['depth'],
                'status': 'filled', 'slot': 1, 'stored': True, 'coupon': None,
                'expiresAt': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                'delivery': 'price', 'settled': 'open',
            }
            reservations[body['productNo']] = reservation
            route.fulfill(json={'ok': True, 'filled': True, 'quantity': 30, 'remaining': 29, **reservation})
            return
        if route.request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
            route.fulfill(status=503, json={'ok': False, 'error': '테스트: 저장 서버에 연결할 수 없습니다.'})
        elif '/api/fill' in route.request.url:
            route.fulfill(json={'ok': True, 'filled': {}, 'reservations': list(reservations.values())})
        else:
            route.continue_()
    page.route('**/api/**', api)
    page.goto(base, wait_until='networkidle', timeout=60000)
    expect(page.get_by_role('dialog', name='빵장 오프닝')).to_have_count(0, timeout=10000)
    assert page.evaluate("document.documentElement.style.overflow !== 'hidden'")
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.emulate_media(reduced_motion='reduce')
    cards = page.locator('button[class*="topCard"]')
    assert cards.count() > 0
    for index in range(cards.count()):
        cards.nth(index).click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_be_visible()
        assert page.evaluate("document.body.style.overflow === 'hidden'")
        page.keyboard.press('Shift+Tab')
        assert dialog.locator(':focus').count() == 1
        page.keyboard.press('Escape')
        expect(dialog).to_have_count(0)
    cards.first.click()
    reserve = page.get_by_role('button', name=re.compile('원에 예약하기'))
    if reserve.count() and reserve.is_enabled():
        reserve.click()
        expect(page.get_by_text('테스트: 저장 서버에 연결할 수 없습니다.', exact=True)).to_be_visible()
    page.screenshot(path='/tmp/bread-detail-mobile.png', full_page=True)
    page.keyboard.press('Escape')
    page.screenshot(path='/tmp/bread-mobile.png', full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/bread-desktop.png', full_page=True)
    print('PASS: intro dismisses, all product cards open, focus stays in dialog, mobile/desktop fit, reservation error shown when open')

    # Reproduce: reserve in TODAY, close without checkout, resume from portfolio.
    fail_fill = False
    cards.first.click()
    dialog = page.get_by_role('dialog')
    product_name = dialog.locator('h3').inner_text()
    watch = dialog.get_by_role('button', name='♡ 관심 담기', exact=True)
    if watch.count():
        watch.click()
    radio = dialog.locator('input[type=radio]:not(:disabled)')
    if radio.count() > 1:
        radio.nth(1).check()
    selected_unit = dialog.locator('input[type=radio]:checked').input_value() if radio.count() else None
    reserve = dialog.get_by_role('button', name=re.compile('원에 예약하기'))
    assert reserve.count() and reserve.is_enabled(), 'Run reservation scenario with local market open'
    reserve.click()
    checkout = page.get_by_role('link', name='자사몰에서 결제 이어가기 ↗', exact=True)
    expect(checkout).to_be_visible()
    assert len(reservation_posts) == 1
    assert reservation_posts[0].get('unit') == selected_unit
    page.keyboard.press('Escape')
    page.get_by_role('button', name='예약한 빵 결제 이어가기', exact=True).click()
    expect(checkout).to_be_visible()
    assert len(reservation_posts) == 1, 'Resuming must not reserve again'
    if selected_unit:
        expect(page.locator('input[type=radio]:checked')).to_have_value(selected_unit)
    page.keyboard.press('Escape')
    # The reservation remains reachable even without a saved interest list.
    page.evaluate("localStorage.removeItem('makji_portfolio')")
    page.reload(wait_until='networkidle')
    page.get_by_role('button', name=product_name + ' · 결제 안내', exact=True).click()
    expect(checkout).to_be_visible()
    if selected_unit:
        expect(page.locator('input[type=radio]:checked')).to_have_value(selected_unit)
    assert len(reservation_posts) == 1
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/bread-reservation-resume.png', full_page=True)
    page.keyboard.press('Escape')
    print('PASS: TODAY -> portfolio checkout resume -> reload recovery; original option retained; exactly one mocked POST')

    password = os.environ.get('ADMIN_PASSWORD')
    env = Path(__file__).resolve().parents[1] / '.env.local'
    if not password and env.exists():
        match = re.search(r'^ADMIN_PASSWORD=(.*)$', env.read_text(), re.M)
        if match:
            password = match[1].strip().strip('\"\'')
    page.goto(base + '/admin', wait_until='networkidle')
    expect(page.get_by_label('관리자 비밀번호')).to_be_visible()
    if password:
        response = page.request.post(base + '/api/admin/login', data={'password': password})
        assert response.ok, 'Local administrator login failed'
        page.reload(wait_until='networkidle')
        expect(page.get_by_role('link', name='빵장 화면 확인 ↗')).to_be_visible()
        row = page.locator('li[class*="planRow"]').first
        name = row.locator('input[type="checkbox"]').get_attribute('aria-label')
        row.locator('input[type="checkbox"]').check()
        page.get_by_role('button', name='고른 빵 빼기', exact=True).click()
        page.get_by_role('button', name='빵 추가', exact=True).click()
        product_name = name.split(' 고르기')[0]
        page.locator('ul[class*="addList"] button').filter(has_text=product_name).click()
        row = page.locator('li[class*="planRow"]').filter(has=page.get_by_role('checkbox', name=name))
        cap = row.get_by_role('spinbutton', name=product_name + ' 물량(건)', exact=True)
        before = cap.input_value()
        cap.fill('47' if before != '47' else '48')
        cap.press('Enter')
        expect(page.get_by_role('status').filter(has_text='테스트: 저장 서버')).to_be_visible()
        expect(cap).to_have_value(before)
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('[class*=rowName]').first.bounding_box()['width'] > 150
        page.screenshot(path='/tmp/bread-admin-mobile.png', full_page=True)
        print('PASS: admin login, removed product restored, failed save rolls back, mobile fits; no production changes sent')
    else:
        print('SKIP: admin editing check requires local ADMIN_PASSWORD')
    browser.close()
