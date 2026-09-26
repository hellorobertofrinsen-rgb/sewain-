"""Trial, accounts, rate limits, billing intervals, timezones and the Laporan metrics."""
from datetime import timedelta

from conftest import set_plan
from helpers import generate_payments
from models import today_wib


def _unit(acc, name='A1', price=3_000_000, **extra):
    pid = acc.property()['id']
    return acc.unit(pid, name, price, **extra)


# ------------------------------ Trial ------------------------------------------

def test_new_account_gets_14_day_premium_trial(trial_account):
    plan = trial_account.ok('get', '/plan')
    assert plan['plan'] == 'premium' and plan['label'] == 'Trial Premium' and plan['trial_days_left'] == 14
    pid = trial_account.property()['id']
    for i in range(5):  # more than the Free limit, while the trial runs
        trial_account.unit(pid, f'U{i}')


def test_trial_lapses_to_free_and_hides_extra_units(trial_account):
    import asyncio
    from database import users
    pid = trial_account.property()['id']
    for i in range(5):
        trial_account.unit(pid, f'U{i}')
    yesterday = (today_wib().date() - timedelta(days=1)).isoformat()
    asyncio.run(users.update_one({'email': trial_account.email}, {'$set': {'premium_until': yesterday}}))
    plan = trial_account.ok('get', '/plan')
    assert plan['plan'] == 'free' and plan['trial_ended'] and plan['hidden_units'] == 2
    assert len(trial_account.ok('get', '/units')) == 3


def test_paying_clears_trial_flag(trial_account):
    set_plan(trial_account.email, 'premium', '2099-01-01')
    plan = trial_account.ok('get', '/plan')
    assert plan['plan'] == 'premium' and not plan['trial'] and plan['label'] == 'Premium'


# ------------------------------ Accounts ---------------------------------------

def test_login_is_rate_limited(client, account):
    codes = [client.post('/api/auth/login', json={'email': account.email, 'password': 'salah'}).status_code
             for _ in range(10)]
    assert codes[:8] == [401] * 8 and codes[-1] == 429


def test_demo_is_rate_limited(client):
    codes = [client.post('/api/auth/demo').status_code for _ in range(6)]
    assert codes[:5] == [200] * 5 and codes[5] == 429


def test_register_requires_8_char_password(client):
    r = client.post('/api/auth/register', json={'name': 'A', 'email': 'pendek@contoh.com', 'password': 'abc1234'})
    assert r.status_code == 422


def test_change_password_signs_out_old_sessions(account):
    import time
    time.sleep(1.1)  # tokens carry whole seconds
    r = account.post('/auth/change-password', {'current_password': 'salah', 'new_password': 'barubaru1'})
    assert r.status_code == 400
    new = account.ok('post', '/auth/change-password', {'current_password': 'rahasia12', 'new_password': 'barubaru1'})
    assert account.get('/me').status_code == 401  # the old token is dead
    h = {'Authorization': f'Bearer {new["token"]}'}
    assert account.c.get('/api/me', headers=h).status_code == 200
    assert account.c.post('/api/auth/login', json={'email': account.email, 'password': 'barubaru1'}).status_code == 200


def test_reset_link_flow(account, monkeypatch):
    body = {'email': account.email}
    assert account.c.post('/api/admin/reset-link', json=body).status_code == 404  # disabled without ADMIN_SECRET
    monkeypatch.setenv('ADMIN_SECRET', 's3cret')
    monkeypatch.setenv('PUBLIC_URL', 'https://sewain.duckdns.org')
    r = account.c.post('/api/admin/reset-link', json=body, headers={'X-Admin-Secret': 's3cret'})
    url = r.json()['url']
    assert url.startswith('https://sewain.duckdns.org/reset?token=')
    token = url.split('token=')[1]
    ok = account.c.post('/api/auth/reset-password', json={'token': token, 'new_password': 'lupa12345'})
    assert ok.status_code == 200 and ok.json()['token']
    again = account.c.post('/api/auth/reset-password', json={'token': token, 'new_password': 'lagi12345'})
    assert again.status_code == 400  # one-time
    assert account.c.post('/api/auth/login', json={'email': account.email, 'password': 'lupa12345'}).status_code == 200


def test_delete_account_removes_everything(account):
    import asyncio
    from database import units, users
    _unit(account)
    aid = account.ok('get', '/me')['id']
    assert asyncio.run(units.count_documents({'account_id': aid})) == 1
    assert account.post('/auth/delete-account', {'password': 'salah'}).status_code == 400
    account.ok('post', '/auth/delete-account', {'password': 'rahasia12'})
    assert asyncio.run(users.find_one({'email': account.email})) is None
    assert asyncio.run(units.count_documents({'account_id': aid})) == 0
    assert account.get('/me').status_code == 401


def test_timezone_setting(account):
    assert account.ok('get', '/me')['timezone'] == 'Asia/Jakarta'
    assert account.patch('/me', {'timezone': 'Europe/London'}).status_code == 400
    assert account.ok('patch', '/me', {'timezone': 'Asia/Jayapura'})['timezone'] == 'Asia/Jayapura'
    assert account.ok('get', '/me')['timezone'] == 'Asia/Jayapura'


# ------------------------------ Billing ----------------------------------------

def test_payment_interval_bills_every_n_months():
    docs = generate_payments('a', 't', 'u', 1_000_000, '2026-01-01', '2026-12-31', 5, interval=6)
    assert [(d['period'], d['amount'], d['months']) for d in docs] == [('2026-01', 6_000_000, 6), ('2026-07', 6_000_000, 6)]
    docs = generate_payments('a', 't', 'u', 1_000_000, '2026-01-01', '2026-04-30', 5, interval=3)
    assert [(d['period'], d['months']) for d in docs] == [('2026-01', 3), ('2026-04', 1)]  # last bill: what's left


def test_tenant_with_yearly_payment_and_commission(account):
    u = _unit(account)
    start = today_wib().date().replace(day=1).isoformat()
    tid = account.ok('post', '/tenants', {'name': 'Kevin', 'unit_id': u['id'], 'start_date': start, 'contract_months': 12,
                                          'monthly_rent': 2_000_000, 'payment_interval_months': 12,
                                          'commission': 1_500_000})['tenant_id']
    t = account.ok('get', f'/tenants/{tid}')
    assert len(t['payments']) == 1 and t['payments'][0]['amount'] == 24_000_000
    assert t['payment_interval_months'] == 12 and t['commission'] == 1_500_000
    assert account.post('/tenants', {'name': 'X', 'unit_id': u['id'], 'start_date': start, 'monthly_rent': 1,
                                     'payment_interval_months': 5}).status_code == 400


def test_deal_carries_negotiated_interval_and_commission(account):
    u = _unit(account)
    lid = account.ok('post', '/leads', {'name': 'Sari'})['id']
    account.ok('post', f'/leads/{lid}/negotiation', {'unit_id': u['id'], 'agreed_price': 2_500_000,
                                                     'contract_months': 6, 'payment_interval_months': 6,
                                                     'commission': 500_000})
    tid = account.ok('post', f'/leads/{lid}/deal', {})['tenant_id']
    t = account.ok('get', f'/tenants/{tid}')
    assert t['commission'] == 500_000 and len(t['payments']) == 1 and t['payments'][0]['amount'] == 15_000_000


# ------------------------------ Laporan ----------------------------------------

def test_stats_funnel_counts_only_recorded_steps(account):
    from datetime import timedelta
    from models import today_wib
    u = _unit(account)
    u2 = _unit(account, 'A2')
    a = account.ok('post', '/leads', {'name': 'Andi'})['id']
    b = account.ok('post', '/leads', {'name': 'Budi'})['id']
    account.ok('post', '/leads', {'name': 'Cici'})
    past = (today_wib() - timedelta(days=1)).strftime('%Y-%m-%dT14:00:00')
    for lid in (a, b):
        account.ok('post', '/viewings', {'lead_id': lid, 'unit_id': u['id'], 'scheduled_at': past})
    account.ok('post', f'/leads/{a}/negotiation', {'unit_id': u['id'], 'agreed_price': 3_000_000})
    account.ok('post', f'/leads/{a}/deal', {})
    steps = {st['key']: st for st in account.ok('get', '/stats')['steps']}
    assert (steps['viewing']['count'], steps['viewing']['of'], steps['viewing']['percent']) == (2, 3, 67)
    assert (steps['negotiation']['count'], steps['negotiation']['of']) == (1, 2)
    assert (steps['deal']['count'], steps['deal']['of'], steps['deal']['percent']) == (1, 1, 100)
    assert (steps['extend']['count'], steps['extend']['of']) == (0, 1)
    tid = account.ok('get', '/tenants')[0]['id']
    account.ok('post', f'/tenants/{tid}/extend', {'months': 6})
    steps = {st['key']: st for st in account.ok('get', '/stats')['steps']}
    assert steps['extend']['percent'] == 100
    # A viewing that hasn't happened yet doesn't count.
    c = account.ok('post', '/leads', {'name': 'Dina'})['id']
    future = (today_wib() + timedelta(days=2)).strftime('%Y-%m-%dT14:00:00')
    account.ok('post', '/viewings', {'lead_id': c, 'unit_id': u2['id'], 'scheduled_at': future})
    assert {st['key']: st for st in account.ok('get', '/stats')['steps']}['viewing']['count'] == 2


def test_lead_list_carries_viewing_facts(account):
    from datetime import timedelta
    from models import today_wib
    u = _unit(account)
    lid = account.ok('post', '/leads', {'name': 'Eka'})['id']
    past = (today_wib() - timedelta(days=3)).strftime('%Y-%m-%dT10:00:00')
    account.ok('post', '/viewings', {'lead_id': lid, 'unit_id': u['id'], 'scheduled_at': past})
    row = account.ok('get', '/leads?status=aktif')[0]
    assert row['last_viewing_at'] and row['next_viewing_at'] is None


def test_stats_are_private_to_the_account(account, client):
    from conftest import register
    other = register(client)
    _unit(account)
    account.ok('post', '/leads', {'name': 'Rahasia'})
    assert other.ok('get', '/stats')['prospects'] == 0


# ------------------------------ Round 3: profile, to-do, bookings, reports ----------

def test_profile_fields_and_language(account):
    body = {'name': 'Roberto Frinsen', 'phone': '0812 1111 2222', 'agency': 'Frinsen Realty', 'domicile': 'Jakarta Utara',
            'bank_name': 'BCA', 'bank_account': '1234567890', 'bank_holder': 'Roberto F',
            'office_bank_name': 'Mandiri', 'office_bank_account': '9876543210', 'office_bank_holder': 'PT Frinsen',
            'language': 'en'}
    me = account.ok('patch', '/me', body)
    for k, v in body.items():
        assert me[k] == v, k
    assert account.patch('/me', {'language': 'fr'}).status_code == 400
    assert account.ok('get', '/me')['office_bank_account'] == '9876543210'


def test_profile_photo(account):
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (40, 40), 'blue').save(buf, 'PNG')
    r = account.c.post('/api/me/photo', headers=account.h, files={'file': ('me.png', buf.getvalue(), 'image/png')})
    assert r.status_code == 200 and r.json()['photo']
    assert account.c.get(f"/api/files/{r.json()['photo']}", headers=account.h).status_code == 200
    r = account.c.delete('/api/me/photo', headers=account.h)
    assert r.status_code == 200 and r.json()['photo'] is None


def test_units_and_tenants_need_no_setup_order(account):
    u = account.ok('post', '/units', {'name': 'V1', 'monthly_price': 5_000_000})  # no property yet
    assert u['property_name'] == 'Properti utama'
    u2 = account.ok('post', '/units', {'name': 'V2', 'property_name': 'Villa Canggu'})
    assert u2['property_name'] == 'Villa Canggu'
    tid = account.ok('post', '/tenants', {'name': 'Kevin', 'start_date': '2026-01-01', 'monthly_rent': 4_000_000,
                                          'new_unit': {'name': 'B1', 'property_name': 'Villa Canggu'}})['tenant_id']
    t = account.ok('get', f'/tenants/{tid}')
    assert t['unit_name'] == 'B1'
    assert len(account.ok('get', '/properties')) == 2


def test_todo_links_schedule_calendar_cancel(account):
    u = _unit(account, 'T1')
    tid = account.ok('post', '/tenants', {'name': 'Dewi', 'unit_id': u['id'], 'start_date': '2026-01-01',
                                          'monthly_rent': 1_000_000})['tenant_id']
    by_unit = account.ok('post', '/maintenance', {'description': 'AC bocor', 'unit_id': u['id'], 'scheduled_at': '2026-10-01T10:00'})
    assert by_unit['tenant_id'] == tid  # the unit's tenant is filled in
    by_tenant = account.ok('post', '/maintenance', {'description': 'Parkir', 'tenant_id': tid})
    assert by_tenant['unit_id'] == u['id']
    account.ok('post', f"/maintenance/{by_unit['id']}/calendar")
    row = [m for m in account.ok('get', '/maintenance') if m['id'] == by_unit['id']][0]
    assert row['calendar_added'] and row['tenant_name'] == 'Dewi' and row['scheduled_at'].startswith('2026-10-01')
    account.ok('post', f"/maintenance/{by_unit['id']}/cancel")
    row = [m for m in account.ok('get', '/maintenance') if m['id'] == by_unit['id']][0]
    assert row['status'] == 'batal' and not row['calendar_added']


def test_viewing_calendar_flag_resets_on_reschedule(account):
    from datetime import timedelta
    from models import today_wib
    u = _unit(account)
    lid = account.ok('post', '/leads', {'name': 'Eka', 'phone': '0812'})['id']
    when = (today_wib() + timedelta(days=2)).strftime('%Y-%m-%dT10:00:00')
    vid = account.ok('post', '/viewings', {'lead_id': lid, 'unit_id': u['id'], 'scheduled_at': when})['id']
    account.ok('post', f'/viewings/{vid}/calendar')
    lead = account.ok('get', '/leads?status=aktif')[0]
    assert lead['next_viewing']['calendar_added'] is True
    later = (today_wib() + timedelta(days=3)).strftime('%Y-%m-%dT10:00:00')
    account.ok('post', f'/viewings/{vid}/reschedule', {'scheduled_at': later})
    assert account.ok('get', '/leads?status=aktif')[0]['next_viewing']['calendar_added'] is False


def test_daily_bookings(account):
    u = account.ok('post', '/units', {'name': 'Villa 1', 'daily_price': 1_500_000})
    b = account.ok('post', f"/units/{u['id']}/bookings", {'guest_name': 'Anna', 'check_in': '2026-10-01', 'check_out': '2026-10-04'})
    assert (b['nights'], b['total']) == (3, 4_500_000)
    r = account.post(f"/units/{u['id']}/bookings", {'guest_name': 'Ben', 'check_in': '2026-10-03', 'check_out': '2026-10-05'})
    assert r.status_code == 409
    account.ok('post', f"/units/{u['id']}/bookings", {'guest_name': 'Ben', 'check_in': '2026-10-04', 'check_out': '2026-10-05'})
    st = account.ok('get', '/stats?start=2026-10-02&end=2026-10-04')
    # Nights of 2, 3 (Anna) and 4 (Ben) fall inside 2-4 Oct.
    assert st['current']['daily_nights'] == 3 and st['current']['daily_income'] == 4_500_000
    assert st['previous_period'] == {'start': '2026-09-29', 'end': '2026-10-01', 'days': 3}
    assert st['previous']['daily_income'] == 1_500_000  # Anna's first night
    account.ok('delete', f"/bookings/{b['id']}")
    assert len(account.ok('get', f"/units/{u['id']}/bookings")) == 1


def test_stats_portfolio_numbers_and_units_ranking(account):
    from datetime import timedelta
    from models import today_wib
    busy = _unit(account, 'Busy')
    quiet = _unit(account, 'Quiet')
    full = _unit(account, 'Full')
    account.ok('post', '/tenants', {'name': 'T', 'unit_id': full['id'], 'start_date': '2026-01-01', 'monthly_rent': 2_000_000})
    past = (today_wib() - timedelta(days=0)).strftime('%Y-%m-%dT00:30:00')
    for n in ('A', 'B'):
        lid = account.ok('post', '/leads', {'name': n})['id']
        account.ok('post', '/viewings', {'lead_id': lid, 'unit_id': busy['id'], 'scheduled_at': past})
    today = today_wib().date().isoformat()
    st = account.ok('get', f'/stats?start={today}&end={today}')
    assert st['current']['prospects'] == 2 and st['current']['tenants'] == 1
    assert st['current']['units'] == 3 and st['current']['monthly_income'] == 2_000_000
    assert st['hot_units'][0]['name'] == 'Busy' and st['hot_units'][0]['viewings'] == 2
    assert [r['name'] for r in st['least_units']][0] == 'Quiet'
    assert all(r['name'] != 'Full' for r in st['least_units'])
    assert account.get('/stats?start=2026-10-05&end=2026-10-01').status_code == 400
