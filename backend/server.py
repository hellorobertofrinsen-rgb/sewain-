from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from database import (client, users, ensure_indexes, properties as properties_col,
                      units as units_col, leads as leads_col, conversations as conversations_col,
                      viewings as viewings_col, tenants as tenants_col, payments as payments_col,
                      maintenance as maintenance_col, activities as activities_col,
                      ai_insights as ai_insights_col, summaries as summaries_col,
                      tanya_messages as tanya_col)
from routers_auth import router as auth_router
from routers_main import router as main_router
from routers_ai import router as ai_router
from models import now_utc

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('sewain')


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    # Stable competition/test demo account: demo@sewain.id / sewain123
    from seed import seed_demo_account
    from auth_utils import hash_password
    from bson import ObjectId
    # Rebuild the stable competition demo fresh each boot so it always reflects
    # the latest seed (photos, data). One-tap "Coba Demo" accounts are untouched.
    existing = await users.find_one({'email': 'demo@sewain.id'})
    if existing:
        aid = str(existing['_id'])
        for col in (properties_col, units_col, leads_col, conversations_col, viewings_col,
                    tenants_col, payments_col, maintenance_col, activities_col,
                    ai_insights_col, summaries_col, tanya_col):
            await col.delete_many({'account_id': aid})
        await seed_demo_account(aid)
        logger.info('Re-seeded stable demo account demo@sewain.id')
    else:
        uid = ObjectId()
        await users.insert_one({'_id': uid, 'name': 'Roberto', 'email': 'demo@sewain.id',
                                'password_hash': hash_password('sewain123'), 'is_demo': True,
                                'created_at': now_utc()})
        await seed_demo_account(str(uid))
        logger.info('Seeded stable demo account demo@sewain.id')
    try:
        from storage_client import init_storage
        await asyncio.get_running_loop().run_in_executor(None, init_storage)
        logger.info('Object storage initialized')
    except Exception as e:  # storage is optional until a photo is uploaded
        logger.warning(f'Object storage init skipped: {e}')
    yield
    client.close()


app = FastAPI(title='Sewain', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router)
app.include_router(main_router)
app.include_router(ai_router)


@app.get('/api/health')
async def health():
    return {'ok': True, 'service': 'sewain'}
