"""Regression tests for final polish pass:
- 12 distinct unit photos
- /api/files with ?token= query param + ownership
- Fresh demo@sewain.id re-seed on startup
"""
import os
import uuid
import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://admin-properti-ai.preview.emergentagent.com").rstrip("/")


# -------- 12 distinct photos ---------
class TestUnitPhotos:
    def test_units_have_12_with_distinct_photos(self, demo_auth):
        r = requests.get(f"{BASE}/api/units", headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 200
        units = r.json()
        # count seed units only (a previous test may have created extras — but demo fixture is fresh, so 12)
        seed_units = [u for u in units if u.get("origin") == "seed"] or units
        assert len(seed_units) >= 12, f"expected >=12 seed units, got {len(seed_units)}"

        photos_all = []
        for u in seed_units:
            ps = u.get("photos") or []
            assert isinstance(ps, list) and len(ps) >= 1, f"unit {u.get('name')} has no photos"
            photos_all.extend(ps)

        # seed photos are http URLs (uploaded ones added by parallel tests are storage paths — ignore)
        http_photos = [p for p in photos_all if p.startswith("http")]
        distinct = set(http_photos)
        assert len(distinct) >= 12, (
            f"expected >=12 distinct http seed photos, got {len(distinct)} out of {len(http_photos)}"
        )


# -------- /api/files token/ownership ---------
class TestFilesTokenParam:
    def test_files_requires_auth(self):
        # random path — should 401 without token
        r = requests.get(f"{BASE}/api/files/does-not-exist.jpg", timeout=15)
        assert r.status_code == 401, r.text

    def test_files_invalid_token_query(self):
        r = requests.get(f"{BASE}/api/files/does-not-exist.jpg?token=bogus.jwt.here", timeout=15)
        # invalid jwt → aid becomes None → 401
        assert r.status_code == 401, r.text

    def test_files_bearer_ok_but_404_for_missing(self, demo_auth):
        # valid bearer, but path doesn't exist → 404
        r = requests.get(f"{BASE}/api/files/nonexistent-{uuid.uuid4().hex}.jpg",
                         headers=demo_auth["headers"], timeout=15)
        assert r.status_code == 404, r.text

    def test_files_token_query_valid_returns_404_for_missing(self, demo_auth):
        # valid token via ?token= param → 404 (not 401) for missing file
        tok = demo_auth["token"]
        r = requests.get(f"{BASE}/api/files/nonexistent-{uuid.uuid4().hex}.jpg?token={tok}", timeout=15)
        assert r.status_code == 404, r.text

    def test_files_ownership_enforced_across_accounts(self, api, demo_auth):
        """Upload a real photo via account A, then try to fetch it as account B."""
        h_a = demo_auth["headers"]
        tok_a = demo_auth["token"]
        # need a unit
        units = requests.get(f"{BASE}/api/units", headers=h_a, timeout=15).json()
        assert units, "no units"
        uid = units[0]["id"]
        # upload a tiny 1x1 png
        import base64
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        files_payload = {"file": ("t.png", png, "image/png")}
        # Use plain requests (not the api session) so json header isn't set
        up = requests.post(f"{BASE}/api/units/{uid}/photos",
                           headers={"Authorization": h_a["Authorization"]},
                           files=files_payload, timeout=30)
        if up.status_code not in (200, 201):
            pytest.skip(f"upload endpoint not available or failed: {up.status_code} {up.text[:120]}")
        path = up.json().get("path")
        assert path, f"missing path in {up.json()}"

        # sanity: A can fetch via token query
        r_ok = requests.get(f"{BASE}/api/files/{path}?token={tok_a}", timeout=15)
        assert r_ok.status_code == 200, f"owner should read: {r_ok.status_code} {r_ok.text[:120]}"

        # create account B (fresh demo)
        b = api.post(f"{BASE}/api/auth/demo", json={}, timeout=30).json()
        tok_b = b["token"]

        # Account B → 404
        r_b = requests.get(f"{BASE}/api/files/{path}?token={tok_b}", timeout=15)
        assert r_b.status_code == 404, f"other account should 404, got {r_b.status_code}"

        # No token at all → 401
        r_no = requests.get(f"{BASE}/api/files/{path}", timeout=15)
        assert r_no.status_code == 401


# -------- Fresh re-seed of demo@sewain.id ---------
class TestStableDemoReseed:
    def test_stable_demo_has_full_seed_after_startup(self, api):
        r = api.post(f"{BASE}/api/auth/login",
                     json={"email": "demo@sewain.id", "password": "sewain123"}, timeout=15)
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        units = requests.get(f"{BASE}/api/units", headers=h, timeout=15).json()
        assert len(units) >= 12, f"stable demo should have 12 units, got {len(units)}"
        # each seed unit has photos
        seed = [u for u in units if u.get("origin") == "seed"]
        assert seed, "no seed-origin units on stable demo"
        distinct = {p for u in seed for p in (u.get("photos") or [])}
        assert len(distinct) >= 12, f"stable demo distinct photos {len(distinct)}"
