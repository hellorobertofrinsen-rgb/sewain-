import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ.get('DB_NAME', 'sewain')

client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000)
db = client[DB_NAME]

users = db['users']
properties = db['properties']
units = db['units']
leads = db['leads']
viewings = db['viewings']
tenants = db['tenants']
payments = db['payments']
maintenance = db['maintenance']
activities = db['activities']
files = db['files']  # unit photos (bytes live in the document, see storage.py)

# Every collection holding per-account data (keyed by account_id). The last four are
# leftovers from the removed AI features; kept here so account cleanup removes them too.
ACCOUNT_COLLECTIONS = ['properties', 'units', 'leads', 'viewings', 'tenants', 'payments',
                       'maintenance', 'activities',
                       'conversations', 'ai_insights', 'summaries', 'tanya_messages']


async def ensure_indexes():
    await users.create_index('email', unique=True)
    await users.create_index([('is_demo', 1), ('created_at', 1)])
    await units.create_index([('account_id', 1), ('status', 1)])
    await leads.create_index([('account_id', 1), ('status', 1)])
    await viewings.create_index([('account_id', 1), ('lead_id', 1)])
    await tenants.create_index([('account_id', 1), ('status', 1)])
    await payments.create_index([('account_id', 1), ('status', 1)])
    await payments.create_index([('account_id', 1), ('tenant_id', 1)])
    await activities.create_index([('account_id', 1), ('created_at', -1)])
    await files.create_index('path', unique=True)
    await files.create_index('owner_id')


async def delete_account_data(account_id: str) -> None:
    for name in ACCOUNT_COLLECTIONS:
        await db[name].delete_many({'account_id': account_id})
    await files.delete_many({'owner_id': account_id})
