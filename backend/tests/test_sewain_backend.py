"""Sewain backend integration tests — covers auth, CRUD, workflows & AI."""
import os
import time
import uuid
import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://admin-properti-ai.preview.emergentagent.com").rstrip("/")
AI_TIMEOUT = 120  # real GPT can take up to 90s


# --------------------------- Health ------------------------------------------
def test_health():
    r = requests.get(f"{BASE}/api/health", timeout=15)
    assert r.status_code == 200


# --------------------------- Auth --------------------------------------------
class TestAuth:
    def test_demo_login_creates_seeded_account(self, api):
        r = api.post(f"{BASE}/api/auth/demo", json={}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and data["user"]["is_demo"] is True
        # verify seed
        hdrs = {"Authorization": f"Bearer {data['token']}"}
        u = requests.get(f"{BASE}/api/units", headers=hdrs, timeout=15)
        assert u.status_code == 200
        assert len(u.json()) >= 10, "demo seed should have >=10 units"

    def test_login_stable_demo(self, api):
        r = api.post(f"{BASE}/api/auth/login", json={"email": "demo@sewain.id", "password": "sewain123"}, timeout=15)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_register_new_account(self, api):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{BASE}/api/auth/register", json={"email": email, "password": "testpass123", "name": "TEST User"}, timeout=15)
        assert r.status_code == 200, r.text
        assert "token" in r.json()

    def test_login_bad_password(self, api):
        r = api.post(f"{BASE}/api/auth/login", json={"email": "demo@sewain.id", "password": "wrong"}, timeout=15)
        assert r.status_code in (400, 401)

    def test_me_endpoint(self, demo_auth):
        r = requests.get(f"{BASE}/api/me", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == demo_auth["user"]["email"]

    def test_unauthorized_without_token(self):
        r = requests.get(f"{BASE}/api/units", timeout=15)
        assert r.status_code in (401, 403)


# --------------------------- Today -------------------------------------------
class TestToday:
    def test_today_dashboard(self, demo_auth):
        r = requests.get(f"{BASE}/api/today", headers=demo_auth["headers"], timeout=30)
        assert r.status_code == 200
        d = r.json()
        # Expect essential keys (counts + items are the queue payload)
        for k in ("counts", "items"):
            assert k in d, f"missing key {k} in /today response ({list(d.keys())})"

    def test_today_summary_is_ai_string(self, demo_auth):
        r = requests.get(f"{BASE}/api/today/summary", headers=demo_auth["headers"], timeout=AI_TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "summary" in d and isinstance(d["summary"], str) and len(d["summary"]) > 5


# --------------------------- Properties & Units -------------------------------
class TestPropertiesUnits:
    def test_list_properties(self, demo_auth):
        r = requests.get(f"{BASE}/api/properties", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        props = r.json()
        assert isinstance(props, list) and len(props) >= 1

    def test_units_crud(self, demo_auth):
        h = demo_auth["headers"]
        props = requests.get(f"{BASE}/api/properties", headers=h).json()
        pid = props[0]["id"]
        payload = {"property_id": pid, "name": f"TEST-U-{uuid.uuid4().hex[:6]}", "unit_type": "kamar", "monthly_price": 1500000, "status": "kosong"}
        r = requests.post(f"{BASE}/api/units", headers=h, json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        uid = r.json()["id"]
        # GET to verify
        g = requests.get(f"{BASE}/api/units/{uid}", headers=h, timeout=15)
        assert g.status_code == 200 and g.json()["name"] == payload["name"]
        # Update — PUT requires full UnitIn body
        update_payload = {**payload, "monthly_price": 1800000}
        up = requests.put(f"{BASE}/api/units/{uid}", headers=h, json=update_payload, timeout=15)
        assert up.status_code == 200, up.text
        g2 = requests.get(f"{BASE}/api/units/{uid}", headers=h).json()
        assert g2["monthly_price"] == 1800000
        # Delete
        d = requests.delete(f"{BASE}/api/units/{uid}", headers=h, timeout=15)
        assert d.status_code == 200
        g3 = requests.get(f"{BASE}/api/units/{uid}", headers=h)
        assert g3.status_code == 404


# --------------------------- Leads & Deal Flow --------------------------------
class TestLeadsFlow:
    def test_list_leads(self, demo_auth):
        r = requests.get(f"{BASE}/api/leads", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_lead_detail(self, demo_auth):
        h = demo_auth["headers"]
        leads = requests.get(f"{BASE}/api/leads", headers=h).json()
        if not leads:
            pytest.skip("no leads")
        lid = leads[0]["id"]
        r = requests.get(f"{BASE}/api/leads/{lid}", headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == lid

    def test_lead_mark_contacted(self, demo_auth):
        h = demo_auth["headers"]
        leads = requests.get(f"{BASE}/api/leads", headers=h).json()
        if not leads:
            pytest.skip()
        lid = leads[0]["id"]
        r = requests.post(f"{BASE}/api/leads/{lid}/contacted", headers=h, json={}, timeout=15)
        assert r.status_code == 200

    def test_lead_deal_creates_tenant_and_marks_unit_terisi(self, demo_auth):
        h = demo_auth["headers"]
        leads = requests.get(f"{BASE}/api/leads", headers=h).json()
        units = requests.get(f"{BASE}/api/units", headers=h).json()
        kosong = [u for u in units if u.get("status") == "kosong"]
        open_leads = [l for l in leads if l.get("status") not in ("deal",)]
        if not kosong or not open_leads:
            pytest.skip("no vacant unit or open lead")
        lid = open_leads[0]["id"]
        uid = kosong[0]["id"]
        r = requests.post(f"{BASE}/api/leads/{lid}/deal", headers=h,
                          json={"unit_id": uid, "start_date": "2026-01-15", "due_day": 10}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("tenant_id") and body.get("payments_created", 0) >= 0
        # unit should be terisi
        u = requests.get(f"{BASE}/api/units/{uid}", headers=h).json()
        assert u["status"] == "terisi"


# --------------------------- Tenants & Payments -------------------------------
class TestTenantsPayments:
    def test_list_tenants(self, demo_auth):
        r = requests.get(f"{BASE}/api/tenants", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_payments(self, demo_auth):
        r = requests.get(f"{BASE}/api/payments", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200

    def test_mark_payment_paid(self, demo_auth):
        h = demo_auth["headers"]
        pays = requests.get(f"{BASE}/api/payments", headers=h).json()
        unpaid = [p for p in pays if p.get("status") != "lunas" and p.get("status") != "paid"]
        if not unpaid:
            pytest.skip("no unpaid payment")
        pid = unpaid[0]["id"]
        r = requests.post(f"{BASE}/api/payments/{pid}/mark-paid", headers=h, json={}, timeout=15)
        assert r.status_code == 200
        # verify persisted
        pays2 = requests.get(f"{BASE}/api/payments", headers=h).json()
        matched = next((p for p in pays2 if p["id"] == pid), None)
        assert matched and matched.get("status") in ("lunas", "paid")

    def test_payment_reminder_draft_ai(self, demo_auth):
        h = demo_auth["headers"]
        pays = requests.get(f"{BASE}/api/payments", headers=h).json()
        unpaid = [p for p in pays if p.get("status") not in ("lunas", "paid")]
        if not unpaid:
            pytest.skip()
        r = requests.post(f"{BASE}/api/payments/{unpaid[0]['id']}/remind-draft", headers=h, json={}, timeout=AI_TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        # expect a draft message
        text = body.get("draft") or body.get("message") or body.get("text") or ""
        assert isinstance(text, str) and len(text) > 5


# --------------------------- Maintenance --------------------------------------
class TestMaintenance:
    def test_list_maintenance(self, demo_auth):
        r = requests.get(f"{BASE}/api/maintenance", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200

    def test_create_maintenance_ai_classifies(self, demo_auth):
        h = demo_auth["headers"]
        units = requests.get(f"{BASE}/api/units", headers=h).json()
        if not units:
            pytest.skip()
        uid = units[0]["id"]
        r = requests.post(f"{BASE}/api/maintenance", headers=h,
                          json={"unit_id": uid, "description": "TEST Kamar mandi bocor parah, air merembes ke lantai"},
                          timeout=AI_TIMEOUT)
        assert r.status_code in (200, 201), r.text
        m = r.json()
        # AI should classify category & priority
        assert m.get("category"), f"missing AI category: {m}"
        assert m.get("priority"), f"missing AI priority: {m}"
        mid = m["id"]
        # start
        s = requests.post(f"{BASE}/api/maintenance/{mid}/start", headers=h, json={}, timeout=15)
        assert s.status_code == 200
        # resolve
        rz = requests.post(f"{BASE}/api/maintenance/{mid}/resolve", headers=h, json={"resolution": "TEST fixed"}, timeout=15)
        assert rz.status_code == 200


# --------------------------- AI: analyze-chat, ask, matches -------------------
class TestAIFeatures:
    def test_sample_chat_available(self, demo_auth):
        r = requests.get(f"{BASE}/api/ai/sample-chat", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        body = r.json()
        text = body.get("text") or body.get("chat") or ""
        assert len(text) > 30

    def test_analyze_chat_extracts_leads(self, demo_auth):
        h = demo_auth["headers"]
        sample_body = requests.get(f"{BASE}/api/ai/sample-chat", headers=h).json()
        sample = sample_body.get("text") or sample_body.get("chat") or ""
        r = requests.post(f"{BASE}/api/ai/analyze-chat", headers=h,
                          json={"text": sample}, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        leads = body.get("leads") or body.get("extracted") or []
        assert isinstance(leads, list) and len(leads) >= 2, f"expected >=2 extracted leads, got: {body}"

    def test_ai_ask_tanya(self, demo_auth):
        r = requests.post(f"{BASE}/api/ai/ask", headers=demo_auth["headers"],
                          json={"question": "Siapa yang belum bayar bulan ini?"}, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        ans = body.get("answer") or body.get("response") or body.get("text") or ""
        assert isinstance(ans, str) and len(ans) > 5

    def test_unit_ai_matches(self, demo_auth):
        h = demo_auth["headers"]
        units = requests.get(f"{BASE}/api/units", headers=h).json()
        kosong = [u for u in units if u.get("status") == "kosong"]
        if not kosong:
            pytest.skip()
        r = requests.get(f"{BASE}/api/units/{kosong[0]['id']}/matches", headers=h, timeout=AI_TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert "matches" in body or isinstance(body, list)


# --------------------------- Impact & Activities ------------------------------
class TestImpactActivities:
    def test_impact(self, demo_auth):
        r = requests.get(f"{BASE}/api/impact", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict)

    def test_activities(self, demo_auth):
        r = requests.get(f"{BASE}/api/activities", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --------------------------- Viewings -----------------------------------------
class TestViewings:
    def test_list_and_create_viewing(self, demo_auth):
        h = demo_auth["headers"]
        leads = requests.get(f"{BASE}/api/leads", headers=h).json()
        units = requests.get(f"{BASE}/api/units", headers=h).json()
        if not leads or not units:
            pytest.skip()
        r = requests.post(f"{BASE}/api/viewings", headers=h,
                          json={"lead_id": leads[0]["id"], "unit_id": units[0]["id"], "scheduled_at": "2026-01-20T10:00:00"},
                          timeout=15)
        assert r.status_code in (200, 201), r.text
        vid = r.json().get("id")
        assert vid
        c = requests.post(f"{BASE}/api/viewings/{vid}/confirm", headers=h, json={}, timeout=15)
        assert c.status_code == 200
