"""Lead -> viewing -> negotiation -> deal -> tenant -> payments, plus the audited bug fixes."""
from datetime import date, timedelta

from helpers import contract_end
from models import today_wib


def _setup(account):
    pid = account.property(area='PIK 2')['id']
    studio = account.unit(pid, 'A12', price=3_200_000, unit_type='Studio', owner_name='Pak Hendra', owner_phone='0812')
    two_br = account.unit(pid, 'D11', price=6_800_000, unit_type='2 Bedroom')
    return pid, studio, two_br


def test_full_lifecycle_keeps_context(account):
    _, studio, two_br = _setup(account)

    # Lead is auto-matched to the right unit without any AI call.
    lead = account.ok('post', '/leads', {'name': 'Rizky', 'phone': '0812-3456', 'budget_max': 7_000_000,
                                         'unit_type': '2 Bedroom', 'preferred_location': 'PIK 2',
                                         'requirements': ['Untuk keluarga'], 'notes': 'Pindah bulan depan'})
    lid = lead['id']
    assert lead['matched_unit']['id'] == two_br['id']
    assert account.ok('get', f'/leads/{lid}')['suggestions'][0]['unit']['id'] == two_br['id']

    # Viewing -> result -> negotiation with terms.
    past = (today_wib() - timedelta(days=1)).strftime('%Y-%m-%dT15:00:00')
    viewing = account.ok('post', '/viewings', {'lead_id': lid, 'unit_id': two_br['id'], 'scheduled_at': past})
    today_items = account.ok('get', '/today')['items']
    assert any(i['type'] == 'viewing_result' and i['viewing_id'] == viewing['id'] for i in today_items)
    lead = account.ok('post', f'/leads/{lid}/negotiation', {'agreed_price': 6_500_000, 'deposit': 2_000_000,
                                                            'contract_months': 6, 'note': 'Diskon 300rb'})
    assert lead['status'] == 'negotiation' and lead['viewings'][0]['status'] == 'selesai'

    # Deal: defaults come from the negotiation — nothing re-typed.
    start = date.today().replace(day=1).isoformat()
    deal = account.ok('post', f'/leads/{lid}/deal', {'start_date': start})
    assert deal['payments_created'] == 6
    tenant = account.ok('get', f'/tenants/{deal["tenant_id"]}')
    assert tenant['monthly_rent'] == 6_500_000 and tenant['deposit'] == 2_000_000
    assert tenant['end_date'] == contract_end(start, 6)
    assert tenant['history']['notes'] == 'Pindah bulan depan'
    assert tenant['history']['negotiation_note'] == 'Diskon 300rb'
    assert tenant['history']['viewings'] == 1
    assert account.ok('get', f'/units/{two_br["id"]}')['status'] == 'terisi'
    assert account.ok('get', f'/leads/{lid}')['tenant_id'] == deal['tenant_id']
    # A double tap on "deal" must not create a second tenant.
    assert account.post(f'/leads/{lid}/deal', {}).status_code == 400

    # Extend the lease -> new bills for the new months only.
    ext = account.ok('post', f'/tenants/{deal["tenant_id"]}/extend', {'months': 3})
    assert ext['payments_created'] == 3
    assert len(account.ok('get', f'/tenants/{deal["tenant_id"]}')['payments']) == 9


def test_checkout_cancels_future_bills_only(account):
    _, studio, _ = _setup(account)
    start = (today_wib().date().replace(day=1) - timedelta(days=62)).replace(day=1).isoformat()
    tid = account.ok('post', '/tenants', {'name': 'Kevin', 'unit_id': studio['id'], 'start_date': start,
                                          'monthly_rent': 3_200_000, 'payment_due_day': 5})['tenant_id']
    before = account.ok('get', f'/tenants/{tid}')['payments']
    assert len(before) == 12
    today_iso = today_wib().date().isoformat()
    past_unpaid = [p for p in before if p['due_date'] <= today_iso]
    res = account.ok('post', f'/tenants/{tid}/checkout', {})
    assert res['payments_cancelled'] == 12 - len(past_unpaid)
    after = account.ok('get', f'/tenants/{tid}')['payments']
    assert all(p['due_date'] <= today_iso for p in after)
    # Future bills no longer appear as "belum bayar" anywhere; overdue ones still do.
    today_pay = [i for i in account.ok('get', '/today')['items'] if i['type'] == 'payment']
    assert len(today_pay) == len([p for p in past_unpaid if p['status'] == 'belum_bayar'])
    assert account.ok('get', f'/units/{studio["id"]}')['status'] == 'kosong'
    assert account.post(f'/tenants/{tid}/checkout', {}).status_code == 400


def test_patch_lead_preserves_stage_and_match(account):
    _, studio, _ = _setup(account)
    lid = account.ok('post', '/leads', {'name': 'Jessica', 'budget_max': 3_500_000, 'unit_type': 'Studio'})['id']
    account.ok('post', f'/leads/{lid}/negotiation', {'agreed_price': 3_100_000})
    lead = account.ok('patch', f'/leads/{lid}', {'phone': '0811'})
    assert lead['phone'] == '0811'
    assert lead['status'] == 'negotiation'
    assert lead['matched_unit']['id'] == studio['id']
    assert lead['negotiation']['agreed_price'] == 3_100_000


def test_followup_scheduling_on_today(account):
    lid = account.ok('post', '/leads', {'name': 'Maya'})['id']
    assert not [i for i in account.ok('get', '/today')['items'] if i['type'] == 'followup']
    account.ok('post', f'/leads/{lid}/contacted', {'message': 'Halo Maya', 'next_followup_date': today_wib().date().isoformat()})
    items = [i for i in account.ok('get', '/today')['items'] if i['type'] == 'followup']
    assert items and items[0]['reason'] == 'Jadwal follow-up hari ini'
    lead = account.ok('get', f'/leads/{lid}')
    assert lead['last_message'] == 'Halo Maya' and lead['status'] == 'sedang_ngobrol'


def test_lease_ending_soon_shows_on_today(account):
    _, studio, _ = _setup(account)
    start = (today_wib().date() - timedelta(days=350)).isoformat()
    account.ok('post', '/tenants', {'name': 'Dewi', 'unit_id': studio['id'], 'start_date': start,
                                    'contract_months': 12, 'monthly_rent': 1})
    lease = [i for i in account.ok('get', '/today')['items'] if i['type'] == 'lease']
    assert lease and 0 <= lease[0]['days_left'] <= 30


def test_invalid_ids_are_404_not_500(account):
    for path in ('/leads/new', '/units/xyz', '/tenants/123', '/leads/000000000000000000000000'):
        assert account.get(path).status_code == 404, path
    assert account.post('/payments/nope/mark-paid').status_code == 404
    assert account.post('/viewings/nope/confirm').status_code == 404


def test_accounts_are_isolated(account, client):
    _, studio, _ = _setup(account)
    lid = account.ok('post', '/leads', {'name': 'Private'})['id']
    other_tok = client.post('/api/auth/register', json={'name': 'B', 'email': 'isolated-b@contoh.com',
                                                         'password': 'rahasia1'}).json()['token']
    h = {'Authorization': f'Bearer {other_tok}'}
    assert client.get(f'/api/units/{studio["id"]}', headers=h).status_code == 404
    assert client.get(f'/api/leads/{lid}', headers=h).status_code == 404
    assert client.patch(f'/api/units/{studio["id"]}', headers=h, json={'name': 'hacked'}).status_code == 404
    assert client.delete(f'/api/units/{studio["id"]}', headers=h).json() == {'detail': 'Unit tidak ditemukan'}
    # Can't attach someone else's unit to your own lead.
    my_lead = client.post('/api/leads', headers=h, json={'name': 'Mine'}).json()['id']
    r = client.post('/api/viewings', headers=h, json={'lead_id': my_lead, 'unit_id': studio['id'],
                                                      'scheduled_at': '2030-01-01T10:00:00'})
    assert r.status_code == 404
    assert account.ok('get', f'/units/{studio["id"]}')['name'] == 'A12'


def test_unit_with_active_tenant_cannot_be_deleted(account):
    _, studio, _ = _setup(account)
    account.ok('post', '/tenants', {'name': 'Sinta', 'unit_id': studio['id'], 'start_date': '2026-01-01', 'monthly_rent': 1})
    assert account.delete(f'/units/{studio["id"]}').status_code == 400


def test_issue_gets_keyword_category(account):
    m = account.ok('post', '/maintenance', {'description': 'Lampu kamar mandi mati', 'urgent': True})
    assert m['category'] == 'Listrik' and m['priority'] == 'urgent'
    assert account.ok('get', '/today')['counts']['urgent'] == 1


def test_spa_fallback_does_not_swallow_api(client):
    assert client.get('/api/does-not-exist').status_code == 404
    assert client.get('/api/health').json()['ok'] is True
