"""Local test setup: the app runs against an in-memory MongoDB (mongomock) — no network needed."""
import os
import sys
from pathlib import Path

import motor.motor_asyncio
import pytest
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault('MONGO_URL', 'mongodb://localhost:27017')
os.environ.setdefault('DB_NAME', 'sewain_test')
os.environ.setdefault('AUTH_SECRET', 'test-secret')
os.environ['WEB_DIST'] = str(Path(__file__).parent / '_no_web_build')
motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from server import app  # noqa: E402


@pytest.fixture(scope='session')
def client():
    with TestClient(app) as c:
        yield c


_n = 0


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    import ratelimit
    ratelimit.reset()


def register(client):
    global _n
    _n += 1
    r = client.post('/api/auth/register', json={'name': 'Agen', 'email': f'agen{_n}@contoh.com', 'password': 'rahasia12'})
    assert r.status_code == 200, r.text
    return Account(client, r.json()['token'], r.json()['user']['email'])


@pytest.fixture
def account(client):
    """A fresh account on the Free plan (trial switched off); a requests-style client with auth set."""
    acc = register(client)
    set_plan(acc.email, 'free')
    return acc


@pytest.fixture
def trial_account(client):
    """A freshly registered account, still in its 14-day Premium trial."""
    return register(client)


class Account:
    def __init__(self, client, token, email):
        self.c, self.email = client, email
        self.h = {'Authorization': f'Bearer {token}'}

    def get(self, path, **kw):
        return self.c.get('/api' + path, headers=self.h, **kw)

    def post(self, path, json=None, **kw):
        return self.c.post('/api' + path, headers=self.h, json=json, **kw)

    def patch(self, path, json=None):
        return self.c.patch('/api' + path, headers=self.h, json=json)

    def delete(self, path):
        return self.c.delete('/api' + path, headers=self.h)

    def ok(self, method, path, json=None):
        r = getattr(self, method)(path, json) if json is not None or method in ('post', 'patch') else getattr(self, method)(path)
        assert r.status_code == 200, f'{method} {path}: {r.status_code} {r.text}'
        return r.json()

    def property(self, name='Tokyo Riverside', area='PIK 2'):
        return self.ok('post', '/properties', {'name': name, 'type': 'apartment', 'city': 'Jakarta Utara', 'area': area})

    def unit(self, pid, name, price=3_000_000, unit_type='Studio', **extra):
        return self.ok('post', '/units', {'property_id': pid, 'name': name, 'unit_type': unit_type,
                                          'monthly_price': price, 'deposit': 1_000_000, **extra})


def set_plan(email, plan, until=None):
    import asyncio
    from plans import set_user_plan
    return asyncio.run(set_user_plan(email, plan, until))
