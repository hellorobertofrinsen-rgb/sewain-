import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PORT = os.environ.get('E2E_PORT', '8055')
BASE = os.environ.get('E2E_URL', f'http://127.0.0.1:{PORT}')
ADMIN = os.environ.get('ADMIN_SECRET', 'e2e-admin')


def _up() -> bool:
    try:
        urllib.request.urlopen(BASE + '/api/health', timeout=2)
        return True
    except Exception:
        return False


@pytest.fixture(scope='session')
def base_url():
    proc = None
    if not _up():
        proc = subprocess.Popen([sys.executable, str(HERE / 'server.py')], env={**os.environ, 'E2E_PORT': PORT})
        for _ in range(60):
            if _up():
                break
            time.sleep(0.5)
        else:
            proc.kill()
            raise RuntimeError('e2e server did not start')
    yield BASE
    if proc:
        proc.terminate()


@pytest.fixture(scope='session')
def browser():
    with sync_playwright() as p:
        # PW_CHROMIUM: use a preinstalled Chromium instead of Playwright's own download.
        exe = os.environ.get('PW_CHROMIUM') or None
        b = p.chromium.launch(executable_path=exe, args=['--no-sandbox'])
        yield b
        b.close()


def _page(browser, base_url, mobile):
    vp = {'width': 390, 'height': 844} if mobile else {'width': 1366, 'height': 860}
    ctx = browser.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, base_url=base_url)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.set_default_timeout(15000)
    return ctx, page


@pytest.fixture
def phone(browser, base_url):
    ctx, page = _page(browser, base_url, True)
    yield page
    assert not page.errors, page.errors
    ctx.close()


@pytest.fixture
def desktop(browser, base_url):
    ctx, page = _page(browser, base_url, False)
    yield page
    assert not page.errors, page.errors
    ctx.close()


def tid(page, t):
    return page.locator(f'[data-testid="{t}"]')


def admin_set_plan(base_url, email, plan):
    import json
    req = urllib.request.Request(base_url + '/api/admin/set-plan', method='POST',
                                 data=json.dumps({'email': email, 'plan': plan}).encode(),
                                 headers={'Content-Type': 'application/json', 'X-Admin-Secret': ADMIN})
    urllib.request.urlopen(req, timeout=5)
