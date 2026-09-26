"""Freemium limits, manual premium, downgrade behaviour and the admin switch."""
import io

from PIL import Image

from conftest import set_plan


def test_new_account_is_free_with_config_limits(account):
    assert account.ok('get', '/me')['plan'] == 'free'
    plan = account.ok('get', '/plan')
    assert plan['plan'] == 'free'
    assert plan['limits']['max_units'] == 3 and plan['limits']['max_active_leads'] == 20
    assert plan['upgrade_whatsapp'] == '6282122232421'
    assert [p['price'] for p in plan['pricing']] == [277_000, 777_777]


def test_free_blocks_fourth_unit_with_upgrade_code(account):
    pid = account.property()['id']
    for n in ('A1', 'A2', 'A3'):
        account.unit(pid, n)
    r = account.post('/units', {'property_id': pid, 'name': 'A4', 'monthly_price': 1})
    assert r.status_code == 403
    assert r.json()['detail']['code'] == 'limit_units'
    assert account.ok('get', '/plan')['usage']['units'] == 3


def test_free_blocks_csv_import_and_export(account):
    r = account.post('/units/import-csv', {'csv_text': 'name,property\nX,Y'})
    assert r.status_code == 403 and r.json()['detail']['code'] == 'feature_bulk_import'
    r = account.get('/export/units')
    assert r.status_code == 403 and r.json()['detail']['code'] == 'feature_export'


def test_free_active_lead_limit_counts_only_open_leads(account):
    ids = [account.ok('post', '/leads', {'name': f'Calon {i}'})['id'] for i in range(20)]
    r = account.post('/leads', {'name': 'Calon 21'})
    assert r.status_code == 403 and r.json()['detail']['code'] == 'limit_leads'
    account.ok('post', f'/leads/{ids[0]}/not-interested')
    account.ok('post', '/leads', {'name': 'Calon 21'})
    # Reopening a closed lead also respects the limit.
    r = account.post(f'/leads/{ids[0]}/reopen')
    assert r.status_code == 403


def test_premium_unlimited_then_downgrade_hides_extra_units(account):
    pid = account.property()['id']
    first = [account.unit(pid, f'U{i}')['id'] for i in range(3)]
    set_plan(account.email, 'premium', '2099-12-31')
    assert account.ok('get', '/plan')['plan'] == 'premium'
    extra = account.unit(pid, 'U4')['id']
    assert len(account.ok('get', '/units')) == 4

    # CSV import + export are premium features.
    res = account.ok('post', '/units/import-csv', {'csv_text': 'name,property,monthly_price,owner_name\nU5,Tokyo Riverside,2500000,Pak Budi'})
    assert res['imported'] == 1
    csv_text = account.get('/export/units').text
    assert 'U5' in csv_text and 'Pak Budi' in csv_text

    # Premium lapses after premium_until -> back to free; only the first 3 units stay visible.
    set_plan(account.email, 'premium', '2020-01-01')
    plan = account.ok('get', '/plan')
    assert plan['plan'] == 'free' and plan['hidden_units'] == 2
    assert sorted(u['id'] for u in account.ok('get', '/units')) == sorted(first)
    assert account.get(f'/units/{extra}').status_code == 404
    assert account.post('/units', {'property_id': pid, 'name': 'U6'}).status_code == 403

    # Re-upgrade brings everything back — nothing was deleted.
    set_plan(account.email, 'premium')
    assert len(account.ok('get', '/units')) == 5


def test_user_cannot_change_own_plan(account):
    # There is no user-facing endpoint that accepts a plan; extra fields are ignored.
    account.patch('/leads/000000000000000000000000', {'plan': 'premium'})
    r = account.c.post('/api/auth/register', json={'name': 'X', 'email': 'sneaky@contoh.com', 'password': 'rahasia12',
                                                   'plan': 'premium', 'premium_until': '2099-12-31', 'is_demo': True})
    assert r.json()['user']['is_demo'] is False
    sneaky = r.json()['token']
    plan = account.c.get('/api/plan', headers={'Authorization': f'Bearer {sneaky}'}).json()
    assert plan['trial'] and plan['premium_until'] != '2099-12-31' and plan['trial_days_left'] == 14


def test_admin_endpoint_requires_secret(account, monkeypatch):
    body = {'email': account.email, 'plan': 'premium'}
    assert account.c.post('/api/admin/set-plan', json=body).status_code == 404  # disabled without ADMIN_SECRET
    monkeypatch.setenv('ADMIN_SECRET', 's3cret')
    assert account.c.post('/api/admin/set-plan', json=body, headers={'X-Admin-Secret': 'wrong'}).status_code == 403
    r = account.c.post('/api/admin/set-plan', json=body, headers={'X-Admin-Secret': 's3cret'})
    assert r.status_code == 200 and r.json()['plan'] == 'premium'
    assert account.ok('get', '/me')['plan'] == 'premium'


def test_demo_account_is_seeded_and_expires(client):
    import asyncio
    from datetime import timedelta
    from bson import ObjectId
    from database import users
    from models import now_utc
    from routers_auth import cleanup_expired_demos

    r = client.post('/api/auth/demo')
    token, uid = r.json()['token'], r.json()['user']['id']
    h = {'Authorization': f'Bearer {token}'}
    assert r.json()['user']['plan'] == 'demo'
    assert len(client.get('/api/units', headers=h).json()) == 12
    types = {i['type'] for i in client.get('/api/today', headers=h).json()['items']}
    assert {'followup', 'viewing', 'viewing_result', 'payment', 'lease', 'maintenance'} <= types

    asyncio.run(users.update_one({'_id': ObjectId(uid)}, {'$set': {'created_at': now_utc() - timedelta(days=8)}}))
    assert asyncio.run(cleanup_expired_demos()) >= 1
    assert client.get('/api/me', headers=h).status_code == 401


def test_photo_upload_is_compressed_and_private(account, client):
    pid = account.property()['id']
    uid = account.unit(pid, 'P1')['id']
    buf = io.BytesIO()
    Image.new('RGB', (3000, 2000), (200, 120, 50)).save(buf, 'PNG')
    r = client.post(f'/api/units/{uid}/photos', headers=account.h,
                    files={'file': ('foto.png', buf.getvalue(), 'image/png')})
    assert r.status_code == 200, r.text
    path = r.json()['path']
    token = account.h['Authorization'].split()[1]
    img = client.get(f'/api/files/{path}?token={token}')
    assert img.status_code == 200 and img.headers['content-type'] == 'image/jpeg'
    assert max(Image.open(io.BytesIO(img.content)).size) == 1280
    other = client.post('/api/auth/register', json={'name': 'B', 'email': 'other-photo@contoh.com', 'password': 'rahasia1'}).json()
    assert client.get(f'/api/files/{path}?token={other["token"]}').status_code == 404
    assert client.get(f'/api/files/{path}').status_code == 401
    bad = client.post(f'/api/units/{uid}/photos', headers=account.h, files={'file': ('x.jpg', b'not an image', 'image/jpeg')})
    assert bad.status_code == 400
