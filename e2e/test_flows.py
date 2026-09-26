"""End-to-end flows in a real browser against the real app (in-memory database).

Run:  cd frontend && npx expo export -p web && cd .. && pytest e2e -q
"""
import time
from urllib.parse import quote

from playwright.sync_api import expect

from conftest import admin_set_plan, tid


def register(page, name='Rina Agen'):
    email = f'agen{time.time_ns()}@contoh.com'
    page.goto('/')
    tid(page, 'login-mode-toggle').click()
    tid(page, 'register-name-input').fill(name)
    tid(page, 'login-email-input').fill(email)
    tid(page, 'login-password-input').fill('rahasia123')
    tid(page, 'login-submit-button').click()
    page.wait_for_url('**/today')
    return email


def demo(page):
    page.goto('/')
    tid(page, 'demo-button').click()
    page.wait_for_url('**/today')
    tid(page, 'today-screen').wait_for()


def test_public_pages_open_without_account(phone):
    phone.goto('/privasi')
    tid(phone, 'privacy-page').wait_for()
    assert 'UU No. 27 Tahun 2022' in phone.content()
    phone.goto('/ketentuan')
    tid(phone, 'terms-page').wait_for()
    phone.goto('/reset?token=abc')
    tid(phone, 'reset-screen').wait_for()


def test_register_setup_and_free_limit(phone, base_url):
    email = register(phone)
    tid(phone, 'today-setup-button').click()
    tid(phone, 'setup-add-property-button').click()
    tid(phone, 'property-name-input').fill('Canggu Villas')
    tid(phone, 'property-save-button').click()
    tid(phone, 'setup-property-sheet').wait_for(state='hidden')
    for name in ('V1', 'V2', 'V3', 'V4'):  # the 14-day trial allows more than the Free 3
        tid(phone, 'setup-unit-name-input').fill(name)
        tid(phone, 'setup-unit-price-input').fill('8000000')
        tid(phone, 'setup-save-unit-button').click()
        expect(tid(phone, 'setup-unit-name-input')).to_have_value('')
    assert not tid(phone, 'upgrade-sheet').is_visible()
    admin_set_plan(base_url, email, 'free')  # trial over
    phone.goto('/units')
    tid(phone, 'unit-usage').wait_for()
    assert '1 unit disembunyikan' in tid(phone, 'unit-usage').inner_text()
    tid(phone, 'add-unit-button').click()
    tid(phone, 'upgrade-sheet').wait_for()


def test_paste_chat_to_deal_with_yearly_bill(phone):
    register(phone)
    phone.goto('/setup')
    tid(phone, 'setup-add-property-button').click()
    tid(phone, 'property-name-input').fill('Tokyo Riverside')
    tid(phone, 'property-save-button').click()
    tid(phone, 'setup-property-sheet').wait_for(state='hidden')
    tid(phone, 'setup-unit-name-input').fill('A12')
    tid(phone, 'setup-unit-price-input').fill('3200000')
    tid(phone, 'setup-type-Studio').click()
    tid(phone, 'setup-save-unit-button').click()
    expect(tid(phone, 'setup-unit-name-input')).to_have_value('')

    phone.goto('/lead/new')
    tid(phone, 'paste-open-button').click()
    tid(phone, 'paste-chat-input').fill(
        '[26/09/26 10.21] Jessica: Halo kak, masih ada studio di daerah PIK 2?\n'
        '[26/09/26 10.23] Jessica: budget aku 3,5 jt ya kak, nomor aku 0811 9000 3342')
    tid(phone, 'paste-apply-button').click()
    assert tid(phone, 'lead-name-input').input_value() == 'Jessica'
    assert tid(phone, 'lead-budget-input').input_value() == '3.500.000'
    assert tid(phone, 'lead-phone-input').input_value().startswith('+62 811')
    tid(phone, 'lead-save-button').click()
    phone.wait_for_url('**/lead/*')

    tid(phone, 'lead-direct-nego').click()
    tid(phone, 'negotiation-sheet').wait_for()
    phone.locator('[data-testid^="nego-unit-"]').first.click()
    tid(phone, 'nego-months-12').click()
    tid(phone, 'nego-interval-12').click()
    tid(phone, 'nego-commission-input').fill('1500000')
    tid(phone, 'nego-save-button').click()
    tid(phone, 'lead-mark-deal-button').click()
    tid(phone, 'deal-sheet').wait_for()
    tid(phone, 'deal-save-button').click()
    tid(phone, 'celebrate-overlay').wait_for()
    phone.wait_for_url('**/tenant/*')
    bills = phone.locator('[data-testid^="payment-card-"]')
    bills.first.wait_for()
    assert bills.count() == 1  # one yearly bill instead of twelve monthly ones
    assert '12 bulan' in bills.first.inner_text()


def test_share_target_prefills_new_prospect(phone):
    register(phone)
    text = quote('Halo kak saya Dina, cari kos dekat Cempaka Putih budget 1,5jt. WA 0857 1111 2048')
    phone.goto(f'/lead/new?text={text}')
    tid(phone, 'shared-banner').wait_for()
    assert tid(phone, 'lead-name-input').input_value() == 'Dina'
    assert tid(phone, 'lead-location-input').input_value() == 'Cempaka Putih'


def test_demo_today_new_prospect_first_and_quick_add(phone):
    demo(phone)
    first = phone.locator('[data-testid^="queue-"]').first
    assert 'Nadia' in first.inner_text() and 'balas' in first.inner_text().lower()
    tid(phone, 'tab-add').click()
    tid(phone, 'quick-add-sheet').wait_for()
    tid(phone, 'quick-add-unit').click()
    phone.wait_for_url('**/units**')
    tid(phone, 'add-unit-sheet').wait_for()


def test_laporan_shows_three_metrics(phone):
    demo(phone)
    tid(phone, 'header-report-button').click()
    tid(phone, 'laporan-screen').wait_for()
    for m in ('metric-speed', 'metric-lost', 'metric-retention', 'laporan-owners'):
        tid(phone, m).wait_for()
    assert '25 mnt' in tid(phone, 'metric-speed').inner_text()


def test_desktop_split_view(desktop):
    demo(desktop)
    tid(desktop, 'web-sidebar').wait_for()
    tid(desktop, 'nav-leads').click()
    desktop.locator('[data-testid^="lead-card-"]').first.click()
    tid(desktop, 'lead-detail-screen').wait_for()
    assert '/leads' in desktop.url  # detail opened beside the list, not as a new page
    tid(desktop, 'nav-units').click()
    desktop.locator('[data-testid^="unit-card-"]').first.click()
    tid(desktop, 'unit-detail-screen').wait_for()


def test_timezone_and_delete_account(phone, base_url):
    email = register(phone)
    phone.goto('/settings')
    tid(phone, 'settings-timezone').click()
    tid(phone, 'timezone-WITA').click()
    phone.wait_for_timeout(500)
    assert 'WITA' in tid(phone, 'settings-timezone').inner_text()
    tid(phone, 'settings-delete-account').click()
    tid(phone, 'delete-password').fill('rahasia123')
    tid(phone, 'delete-confirm').click()
    tid(phone, 'demo-button').wait_for()
    tid(phone, 'login-email-input').fill(email)
    tid(phone, 'login-password-input').fill('rahasia123')
    tid(phone, 'login-submit-button').click()
    tid(phone, 'error-box').wait_for()
