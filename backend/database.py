import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000)
db = client[DB_NAME]

users = db['users']
properties = db['properties']
units = db['units']
leads = db['leads']
conversations = db['conversations']
viewings = db['viewings']
tenants = db['tenants']
payments = db['payments']
maintenance = db['maintenance']
activities = db['activities']
ai_insights = db['ai_insights']
summaries = db['summaries']
tanya_messages = db['tanya_messages']
files = db['files']


async def ensure_indexes():
    await users.create_index('email', unique=True)
    await units.create_index([('account_id', 1), ('status', 1)])
    await leads.create_index([('account_id', 1), ('status', 1)])
    await payments.create_index([('account_id', 1), ('status', 1)])
    await activities.create_index([('account_id', 1), ('created_at', -1)])
    await tanya_messages.create_index([('account_id', 1), ('created_at', 1)])
