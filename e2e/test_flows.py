"""End-to-end flows in a real browser against the real app (in-memory database).

Run:  cd frontend && npx expo export -p web && cd .. && pytest e2e -q
"""
import base64
import time
from urllib.parse import quote

from playwright.sync_api import expect

from conftest import admin_set_plan, tid

# 1x1 PNG, for photo pickers.
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')


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


def api(page, method, path, body=None):
    """Call the API as the signed-in user (for setup that isn't what the test is about)."""
    return page.evaluate(
        """async ([method, path, body]) => {
            const token = JSON.parse(localStorage.getItem('sewain_token'));
            const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                                                    body: body ? JSON.stringify(body) : undefined });
            return await r.json();
        }""",
        [method, path, body],
    )


def pick_files(page, trigger, n=1):
    with page.expect_file_chooser() as fc:
        trigger.click()
    fc.value.set_files([{'name': f'foto{i}.png', 'mimeType': 'image/png', 'buffer': PNG} for i in range(n)])


def add_unit_via_form(page, code='A12'):
    page.goto('/units?add=1')
    tid(page, 'add-unit-sheet').wait_for()
    pick_files(page, tid(page, 'unit-photo-add'), 2)
    expect(page.locator('[data-testid^="unit-photo-remove-"]')).to_have_count(2)
    tid(page, 'unit-name-input').fill(code)
    tid(page, 'unit-size-input').fill('36')
    tid(page, 'unit-residence-input').fill('Tokyo Riverside PIK 2')
    tid(page, 'unit-type-1BR').click()
    tid(page, 'unit-price-input').fill('4500000')
    tid(page, 'unit-daily-price-input').fill('650000')
    tid(page, 'unit-deposit-input').fill('1500000')
    tid(page, 'unit-furnish-semi').click()
    tid(page, 'unit-facility-AC').click()
    tid(page, 'unit-facility-WiFi').click()
    tid(page, 'unit-view-input').fill('Kolam renang')
    tid(page, 'unit-owner-name-input').fill('Pak Hendra')
    expect(tid(page, 'unit-save-button')).to_be_disabled()  # owner phone still missing
    tid(page, 'unit-owner-phone-input').fill('0812 1111 2222')
    tid(page, 'unit-save-button').click()
    tid(page, 'add-unit-sheet').wait_for(state='hidden')


def test_public_pages_open_without_account(phone):
    phone.goto('/privasi')
    tid(phone, 'privacy-page').wait_for()
    assert 'UU No. 27 Tahun 2022' in phone.content()
    phone.goto('/ketentuan')
    tid(phone, 'terms-page').wait_for()
    phone.goto('/reset?token=abc')
    tid(phone, 'reset-screen').wait_for()


def test_add_unit_card_and_detail(phone):
    register(phone)
    add_unit_via_form(phone)
    card = phone.locator('[data-testid^="unit-card-"]').first
    card.wait_for()
    text = card.inner_text()
    for part in ('A12', '1 Bedroom (36 m²)', 'Tokyo Riverside PIK 2', 'Semi-Furnished', 'AC', 'Wi-Fi', 'Available', '/hari', '/bulan'):
        assert part in text, part
    assert 'Water Heater' not in text  # unchecked facilities stay hidden
    card.click()
    tid(phone, 'unit-detail-screen').wait_for()
    tid(phone, 'unit-photo-0').wait_for()
    tid(phone, 'unit-photo-1').wait_for()
    tid(phone, 'unit-add-photo-button').wait_for()  # camera on the first photo
    assert tid(phone, 'unit-owner-wa').is_visible()
    assert 'Kolam renang' in tid(phone, 'unit-view-row').inner_text()


def test_free_limit_after_trial(phone, base_url):
    email = register(phone)
    for code in ('V1', 'V2', 'V3', 'V4'):  # the 14-day trial allows more than the Free 3
        api(phone, 'POST', '/units', {'name': code, 'residence': 'Casa', 'unit_type': 'Studio', 'size_m2': 20,
                                      'monthly_price': 3_000_000, 'furnishing': 'furnished',
                                      'owner_name': 'Bu Lina', 'owner_phone': '0813 3333 4444'})
    admin_set_plan(base_url, email, 'free')  # trial over
    phone.goto('/units')
    tid(phone, 'unit-usage').wait_for()
    assert '1 unit disembunyikan' in tid(phone, 'unit-usage').inner_text()
    tid(phone, 'add-unit-button').click()
    tid(phone, 'upgrade-sheet').wait_for()


def test_tenant_needs_a_unit_first(phone):
    register(phone)
    phone.goto('/tenants?add=1')
    tid(phone, 'add-tenant-sheet').wait_for()
    tid(phone, 'tenant-no-unit').wait_for()
    tid(phone, 'tenant-add-unit-first').click()
    tid(phone, 'add-unit-sheet').wait_for()


def test_prospect_form_preferences_and_card(phone):
    register(phone)
    phone.goto('/lead/new')
    tid(phone, 'lead-name-input').fill('Sinta')
    expect(tid(phone, 'lead-save-button')).to_be_disabled()  # phone is required
    tid(phone, 'lead-phone-input').fill('0812 3333 4444')
    tid(phone, 'lead-hot-switch').click()
    tid(phone, 'lead-cat-apartemen').click()
    expect(phone.locator('[data-testid^="lead-type-apartemen-"]')).to_have_count(4)
    tid(phone, 'lead-cat-keduanya').click()
    expect(phone.locator('[data-testid^="lead-type-"]')).to_have_count(8)
    tid(phone, 'lead-type-apartemen-Studio').click()
    tid(phone, 'lead-type-rumah-2-Bedroom').click()
    tid(phone, 'lead-term-bulanan').click()
    tid(phone, 'lead-term-tahunan').click()
    tid(phone, 'lead-save-button').click()
    phone.wait_for_url('**/lead/*')
    tid(phone, 'lead-detail-hot').wait_for()
    tid(phone, 'lead-photo').wait_for()
    phone.goto('/leads')
    card = phone.locator('[data-testid^="lead-card-"]', has_text='Sinta').first
    text = card.inner_text()
    assert 'Hot Buyer' in text and 'Mencari: Bulanan, Tahunan' in text
    assert 'Budget' not in text


def test_paste_chat_then_deal_with_yearly_bill(phone):
    register(phone)
    add_unit_via_form(phone)
    phone.goto('/lead/new')
    tid(phone, 'paste-open-button').click()
    tid(phone, 'paste-chat-input').fill(
        '[26/09/26 10.21] Jessica: Halo kak, masih ada studio di daerah PIK 2?\n'
        '[26/09/26 10.23] Jessica: budget aku 3,5 jt ya kak, nomor aku 0811 9000 3342')
    tid(phone, 'paste-apply-button').click()
    assert tid(phone, 'lead-name-input').input_value() == 'Jessica'
    assert tid(phone, 'lead-phone-input').input_value().startswith('+62 811')
    tid(phone, 'lead-save-button').click()
    phone.wait_for_url('**/lead/*')

    tid(phone, 'lead-direct-nego').click()
    tid(phone, 'negotiation-sheet').wait_for()
    phone.locator('[data-testid^="nego-unit-"]').first.click()
    tid(phone, 'nego-price-input').fill('4200000')
    tid(phone, 'nego-deposit-input').fill('0')
    assert tid(phone, 'nego-deposit-input').input_value() == '0'  # a typed zero stays
    tid(phone, 'nego-months-12').click()
    tid(phone, 'nego-interval-12').click()
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
    text = quote('Halo kak saya Dina, cari studio dekat Cempaka Putih budget 1,5jt. WA 0857 1111 2048')
    phone.goto(f'/lead/new?text={text}')
    tid(phone, 'shared-banner').wait_for()
    assert tid(phone, 'lead-name-input').input_value() == 'Dina'
    assert tid(phone, 'lead-phone-input').input_value().startswith('+62 857')


def test_demo_home_facts_previews_and_quick_add(phone):
    demo(phone)
    for t in ('stat-leads', 'stat-viewings', 'stat-unpaid', 'stat-leases', 'preview-units', 'preview-leads', 'preview-tenants'):
        tid(phone, t).wait_for()
    unpaid = tid(phone, 'stat-unpaid').inner_text()
    assert 'Jatuh tempo' in unpaid and 'Rp' in unpaid and 'jt' not in unpaid
    assert 'Selesai dalam' in tid(phone, 'preview-tenants').inner_text()
    tid(phone, 'stat-unpaid').click()
    tid(phone, 'focus-sheet').wait_for()
    assert phone.locator('[data-testid^="queue-payment-"]').count() >= 1
    phone.keyboard.press('Escape')
    tid(phone, 'focus-sheet').wait_for(state='hidden')
    tid(phone, 'preview-units-all').click()
    phone.wait_for_url('**/units**')
    tid(phone, 'tab-add').click()
    tid(phone, 'quick-add-sheet').wait_for()
    tid(phone, 'quick-add-unit').click()
    tid(phone, 'add-unit-sheet').wait_for()


def test_tenant_cards_show_photo_name_and_end(phone):
    demo(phone)
    phone.goto('/tenants')
    card = phone.locator('[data-testid^="tenant-card-"]').first
    card.wait_for()
    text = card.inner_text()
    assert 'Selesai' in text and 'Rp' not in text and 'Lunas' not in text


def test_schedule_viewing_for_two_units_then_invite(phone):
    demo(phone)
    phone.goto('/leads')
    card = phone.locator('[data-testid^="lead-card-"]', has_text='Maya').first
    card.locator('[data-testid^="lead-schedule-"]').click()
    tid(phone, 'viewing-sheet').wait_for()
    chips = phone.locator('[data-testid^="viewing-unit-"]')
    # Maya's matched unit is ticked already; tick one more, then untick both to see the guard.
    chips.nth(1).click()
    checked = phone.locator('[data-testid^="viewing-unit-"][aria-checked="true"]')
    for i in range(checked.count()):
        checked.first.click()
    expect(tid(phone, 'viewing-save-button')).to_be_disabled()
    chips.nth(0).click()
    chips.nth(1).click()
    tid(phone, 'viewing-save-button').click()
    tid(phone, 'viewing-sheet').wait_for(state='hidden')
    # "Jadwalkan Viewing" on the card opens the prospect page; the viewing buttons are there.
    tid(phone, 'lead-detail-screen').wait_for()
    add = phone.locator('[data-testid^="viewing-cal-"][data-testid$="-add"]:visible').first
    add.wait_for()
    with phone.context.expect_page() as popup:  # Google Calendar opens in a new tab
        add.click()
    popup.value.close()
    phone.locator('[data-testid^="viewing-cal-"][data-testid$="-primary"]:visible').first.wait_for()
    phone.locator('[data-testid^="viewing-cal-"][data-testid$="-cancel"]:visible').first.wait_for()
    assert 'A12, C03' in tid(phone, 'next-step-card').inner_text()  # one viewing, two units


def test_unit_matches_list_prospects_and_tenants(phone):
    demo(phone)
    phone.goto('/units')
    phone.locator('[data-testid^="unit-card-"]', has_text='A12').first.click()
    tid(phone, 'find-matches-button').click()
    tid(phone, 'unit-matches-sheet').wait_for()
    phone.locator('[data-testid^="match-card-"]').first.wait_for()
    assert phone.locator('[data-testid^="match-tenant-label-"]').count() >= 1  # Studio tenants, labelled


def test_share_unit_invoice_and_follow_up_extend(phone):
    demo(phone)
    phone.goto('/units')
    phone.locator('[data-testid^="unit-card-"]').first.click()
    tid(phone, 'unit-share-button').wait_for()
    phone.goto('/tenants')
    phone.locator('[data-testid^="tenant-card-"]', has_text='Kevin').first.click()
    tid(phone, 'tenant-followup-extend').wait_for()
    tid(phone, 'tenant-send-invoice').click()
    tid(phone, 'invoice-sheet').wait_for()


def test_menu_laporan_periods(phone):
    demo(phone)
    tid(phone, 'header-menu-button').click()
    tid(phone, 'main-menu').wait_for()
    tid(phone, 'menu-laporan').click()
    tid(phone, 'laporan-screen').wait_for()
    for step in ('funnel-viewing', 'funnel-negotiation', 'funnel-deal', 'funnel-extend'):
        tid(phone, step).wait_for()
    for p in ('today', 'week', 'custom', 'month'):
        tid(phone, f'laporan-period-{p}').click()
    tid(phone, 'stat-monthly_income').wait_for()
    tid(phone, 'laporan-compare').click()
    assert 'Kecepatan' not in phone.content()


def test_todo_calendar_then_inform(phone):
    demo(phone)
    phone.goto('/todo?add=1')
    tid(phone, 'add-todo-sheet').wait_for()
    phone.locator('[data-testid^="todo-tenant-"]').first.click()
    tid(phone, 'todo-description').fill('Cek water heater')
    tid(phone, 'todo-save').click()
    tid(phone, 'add-todo-sheet').wait_for(state='hidden')
    card = phone.locator('[data-testid^="todo-card-"]', has_text='Cek water heater').first
    card.wait_for()
    with phone.context.expect_page() as popup:
        card.locator('[data-testid$="-add"]').click()
    popup.value.close()
    card.locator('[data-testid$="-primary"]').wait_for()
    card.locator('[data-testid$="-cancel"]').wait_for()


def test_profile_and_english(phone):
    register(phone)
    tid(phone, 'header-profile-button').click()
    tid(phone, 'profile-screen').wait_for()
    expect(tid(phone, 'profile-save')).to_be_disabled()  # phone number is required
    tid(phone, 'profile-phone').fill('0812 7777 8888')
    tid(phone, 'profile-agency').fill('Frinsen Realty')
    tid(phone, 'profile-bank-BCA').click()
    expect(tid(phone, 'profile-save')).to_be_disabled()  # a started account must be complete
    tid(phone, 'profile-account').fill('1234567890')
    tid(phone, 'profile-holder').fill('Rina Agen')
    tid(phone, 'profile-save').click()
    phone.goto('/settings')
    tid(phone, 'settings-language').click()
    tid(phone, 'language-en').click()
    phone.goto('/today')
    tid(phone, 'tab-units').wait_for()
    assert 'Units' in tid(phone, 'tab-bar').inner_text()
    phone.reload()  # stays English after a reload
    tid(phone, 'today-screen').wait_for()
    assert 'Prospects' in tid(phone, 'tab-bar').inner_text()


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
