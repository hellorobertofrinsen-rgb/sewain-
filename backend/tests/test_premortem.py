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
    assert account.ok('get', '/stats')['money']['commission'] == 1_500_000


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

def test_stats_three_metrics(account):
    u = _unit(account, owner_name='Pak Hendra', owner_phone='0812')
    a = account.ok('post', '/leads', {'name': 'Andi'})['id']
    b = account.ok('post', '/leads', {'name': 'Budi'})['id']
    account.ok('post', '/leads', {'name': 'Cici'})
    account.ok('post', f'/leads/{a}/contacted', {'message': 'Halo'})
    account.ok('post', f'/leads/{b}/not-interested', {'reason': 'Harga terlalu mahal'})
    account.ok('post', f'/leads/{a}/deal', {'unit_id': u['id']})
    st = account.ok('get', '/stats')
    assert st['speed']['responded'] == 1 and st['speed']['median_minutes'] == 0 and st['speed']['waiting'] == 1
    assert st['leads']['new'] == 3 and st['leads']['deals'] == 1 and st['leads']['lost'] == 1
    assert st['leads']['conversion'] == 50
    assert st['leads']['lost_reasons'] == [{'reason': 'Harga terlalu mahal', 'count': 1}]
    tid = account.ok('get', '/tenants')[0]['id']
    account.ok('post', f'/tenants/{tid}/extend', {'months': 6})
    st = account.ok('get', '/stats')
    assert st['retention']['extended'] == 1 and st['retention']['rate'] == 100
    assert st['occupancy'] == 100
    assert st['owners'][0]['name'] == 'Pak Hendra' and st['owners'][0]['terisi'] == 1


def test_stats_are_private_to_the_account(account, client):
    from conftest import register
    other = register(client)
    _unit(account, owner_name='Rahasia')
    assert other.ok('get', '/stats')['owners'] == []
