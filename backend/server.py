from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.middleware.cors import CORSMiddleware

from database import client, ensure_indexes
from routers_admin import router as admin_router
from routers_auth import cleanup_expired_demos, router as auth_router
from routers_main import router as main_router

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('sewain')

# The built web app (`npx expo export -p web` -> frontend/dist). Served by this same
# process so the whole product is one service with one URL.
WEB_DIST = Path(os.environ.get('WEB_DIST') or Path(__file__).resolve().parent.parent / 'frontend' / 'dist')


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    await cleanup_expired_demos()
    if not (WEB_DIST / 'index.html').exists():
        logger.warning('Web build not found at %s — only the API is served', WEB_DIST)
    yield
    client.close()


app = FastAPI(title='Sewain', lifespan=lifespan, docs_url=None, redoc_url=None)

# Only needed when the web app is served from a different origin (e.g. `expo start` in dev).
# Auth is a bearer token (no cookies), so a permissive origin list is safe here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',')],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router)
app.include_router(main_router)
app.include_router(admin_router)


@app.get('/api/health')
async def health():
    return {'ok': True, 'service': 'sewain'}


@app.api_route('/{path:path}', methods=['GET', 'HEAD'], include_in_schema=False)
async def web_app(path: str):
    """Serve the PWA: real files as-is, every other route falls back to index.html (SPA)."""
    if path.startswith('api/') or path == 'api':
        raise HTTPException(404, 'Not found')
    root = WEB_DIST.resolve()
    target = (root / path).resolve() if path else root / 'index.html'
    if not target.is_relative_to(root) or not target.is_file():
        target = root / 'index.html'
    if not target.is_file():
        raise HTTPException(404, 'Web app belum di-build')
    if '/_expo/static/' in f'/{path}' or path.startswith('assets/'):
        cache = 'public, max-age=31536000, immutable'  # content-hashed build output
    else:
        cache = 'no-cache'  # index.html, sw.js, manifest: always revalidate so deploys show up
    return FileResponse(target, headers={'Cache-Control': cache})
