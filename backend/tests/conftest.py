"""Shared fixtures for Sewain backend tests."""
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://admin-properti-ai.preview.emergentagent.com"
BASE_URL = BASE.rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_auth(api):
    """One-tap demo account (fresh, fully seeded)."""
    r = api.post(f"{BASE_URL}/api/auth/demo", json={}, timeout=30)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["token"]
    return {
        "token": token,
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    }
