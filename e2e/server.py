"""Run the real Sewain app (API + built web app) on an in-memory database, for the e2e tests.

  cd frontend && npx expo export -p web      # build the web app into frontend/dist first
  python e2e/server.py                        # serves http://127.0.0.1:8055
"""
import os
import sys
from pathlib import Path

import motor.motor_asyncio
from mongomock_motor import AsyncMongoMockClient

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault('MONGO_URL', 'mongodb://localhost')
os.environ.setdefault('AUTH_SECRET', 'e2e-secret-e2e-secret-e2e-secret-e2e')
os.environ.setdefault('ADMIN_SECRET', 'e2e-admin')
os.environ['SEWAIN_DISABLE_RATE_LIMIT'] = '1'  # the suite registers many accounts from one IP
os.environ.setdefault('WEB_DIST', str(ROOT / 'frontend' / 'dist'))
motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient
sys.path.insert(0, str(ROOT / 'backend'))

import uvicorn  # noqa: E402

from server import app  # noqa: E402

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('E2E_PORT', '8055')), log_level='warning')
