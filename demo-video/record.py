"""Record a 9:16 phone demo of SewAIn (1080x1920) from a scripted browser session.
Frames come from Chrome's screencast at 3x pixel density, so text stays sharp."""
import base64, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out') + '/'
FF = sys.argv[1] if len(sys.argv) > 1 else __import__('imageio_ffmpeg').get_ffmpeg_exe()
BASE = os.environ.get('E2E_URL', 'http://127.0.0.1:8055')
FR = D + 'frames/'
os.makedirs(FR, exist_ok=True)
for f in os.listdir(FR):
    os.remove(FR + f)
frames = []

OVERLAY_CSS = """
#demo-cap{position:fixed;left:50%;top:14px;transform:translate(-50%,-8px);opacity:0;z-index:99999;
  background:rgba(14,22,48,.86);color:#fff;font:600 16px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;
  padding:10px 16px;border-radius:999px;max-width:320px;text-align:center;transition:opacity .35s,transform .35s;
  pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.18)}
#demo-cap.on{opacity:1;transform:translate(-50%,0)}
.demo-tap{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;z-index:99998;
  background:rgba(36,87,214,.28);border:2px solid rgba(36,87,214,.65);pointer-events:none;
  animation:demotap .55s ease-out forwards}
@keyframes demotap{from{transform:scale(.4);opacity:1}to{transform:scale(1.25);opacity:0}}
#demo-end{position:fixed;inset:0;z-index:100000;background:#2457D6;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:14px;color:#fff;opacity:0;transition:opacity .5s;
  font-family:-apple-system,Segoe UI,Roboto,sans-serif;pointer-events:none}
#demo-end.on{opacity:1}
"""
INSTALL = """(css) => { if (!document.getElementById('demo-style')) { const s = document.createElement('style');
  s.id = 'demo-style'; s.textContent = css; document.head.appendChild(s);
  const c = document.createElement('div'); c.id = 'demo-cap'; document.body.appendChild(c); } }"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('PW_CHROMIUM') or None, args=['--no-sandbox', '--force-device-scale-factor=3'])
    ctx = b.new_context(viewport={'width': 360, 'height': 560}, device_scale_factor=3, is_mobile=True, has_touch=True, base_url=BASE, timezone_id='Asia/Jakarta', locale='id-ID')
    ctx.add_init_script("localStorage.setItem('sewain_lang','id')")
    rooms = [open(f'{D}room{i}.jpg', 'rb').read() for i in range(12)]
    idx = {}
    def photo_route(route):
        u = route.request.url
        i = idx.setdefault(u, len(idx) % 12)
        route.fulfill(status=200, content_type='image/jpeg', body=rooms[i])
    ctx.route(re.compile(r'https://images\.unsplash\.com/.*'), photo_route)
    page = ctx.new_page()
    ctx.on('page', lambda pg2: pg2.close() if pg2 != page else None)  # Google Calendar tab
    page.set_default_timeout(15000)

    cdp = ctx.new_cdp_session(page)
    def on_frame(ev):
        frames.append((ev['metadata']['timestamp'], ev['data']))
        try:
            cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
        except Exception:
            pass
    cdp.on('Page.screencastFrame', on_frame)

    def ov():
        page.evaluate(INSTALL, OVERLAY_CSS)
    caps = []
    def cap(text, hold=0):
        caps.append((time.time(), text))  # drawn in the band above the app when the video is assembled
        if hold: page.wait_for_timeout(hold)
    def tap(sel, wait=650, loc=None):
        el = loc or page.locator(sel).first
        el.scroll_into_view_if_needed()
        bb = el.bounding_box()
        ov()
        page.evaluate("""([x, y]) => { const d = document.createElement('div'); d.className = 'demo-tap';
            d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }""",
                      [bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2])
        page.wait_for_timeout(180)
        el.click()
        page.wait_for_timeout(wait)
    def typ(sel, text, delay=55):
        el = page.locator(sel).first
        el.scroll_into_view_if_needed()
        el.click()
        el.press_sequentially(text, delay=delay)
        page.wait_for_timeout(200)
    def T(tid):
        return f'[data-testid="{tid}"]'
    def scroll(dy, steps=18, pause=18):
        for _ in range(steps):
            page.mouse.wheel(0, dy / steps)
            page.wait_for_timeout(pause)

    # --- set up: demo account with a filled profile, before the camera rolls
    page.goto('/')
    page.locator(T('demo-button')).click()
    page.wait_for_url('**/today')
    page.evaluate("""async () => { const t = JSON.parse(localStorage.getItem('sewain_token'));
      await fetch('/api/me', {method: 'PATCH', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + t},
        body: JSON.stringify({name: 'Roberto', phone: '0812 7777 8888', agency: 'Frinsen Realty', bank_name: 'BCA',
          bank_account: '1234567890', bank_holder: 'Roberto Frinsen', office_bank_name: 'Mandiri',
          office_bank_account: '9876543210', office_bank_holder: 'PT Frinsen Realty', onboarding_dismissed: true})}); }""")
    page.goto('/today')
    page.locator(T('today-screen')).wait_for()
    page.wait_for_timeout(1200)

    cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 88, 'maxWidth': 1080, 'maxHeight': 1920, 'everyNthFrame': 1})
    t0 = time.time()

    # 1. Open
    cap('Prospek, unit, dan tenant di satu aplikasi', 1600)
    scroll(900, 30, 22)
    page.wait_for_timeout(500)
    scroll(-900, 20, 18)
    page.wait_for_timeout(300)

    # 2. Add a unit
    cap('Tambah unit: foto, tipe, harga, fasilitas')
    tap(T('tab-add'), 500)
    tap(T('quick-add-unit'), 700)
    with page.expect_file_chooser() as fc:
        tap(T('unit-photo-add'), 0)
    fc.value.set_files([f'{D}room2.jpg', f'{D}room5.jpg'])
    page.wait_for_timeout(700)
    typ(T('unit-name-input'), 'A15')
    typ(T('unit-size-input'), '36')
    typ(T('unit-residence-input'), 'Tokyo Riverside PIK 2', 35)
    tap(T('unit-type-1BR'), 250)
    typ(T('unit-price-input'), '4500000', 45)
    typ(T('unit-deposit-input'), '1500000', 40)
    tap(T('unit-furnish-furnished'), 200)
    tap(T('unit-facility-AC'), 150)
    tap(T('unit-facility-WiFi'), 150)
    tap(T('unit-facility-WaterHeater'), 200)
    typ(T('unit-owner-name-input'), 'Pak Hendra', 40)
    typ(T('unit-owner-phone-input'), '0812 1111 2222', 35)
    tap(T('unit-save-button'), 1200)
    cap('Kartu unit: harga, fasilitas, status', 600)
    scroll(260, 12, 25)
    page.wait_for_timeout(1300)

    # 3. Prospect -> viewing -> calendar -> invite
    cap('Jadwalkan viewing, lalu undang lewat WhatsApp')
    tap(T('tab-leads'), 900)
    card = page.locator('[data-testid^="lead-card-"]', has_text='Maya').first
    tap(None, 900, card.locator('[data-testid^="lead-schedule-"]'))
    page.locator(T('viewing-sheet')).wait_for()
    tap(None, 350, page.locator('[data-testid^="viewing-unit-"]', has_text='A15'))
    tap(T('viewing-save-button'), 1300)
    tap(None, 900, page.locator('[data-testid^="viewing-cal-"][data-testid$="-add"]:visible').first)
    page.wait_for_timeout(900)
    cap('Satu tombol jadi dua: Batal · Undang Viewing', 1600)

    # 4. Tenant invoice
    cap('Tenant: kirim invoice sekali ketuk')
    tap(T('back-button'), 800)
    tap(T('tab-tenants'), 900)
    tap(None, 900, page.locator('[data-testid^="tenant-card-"]', has_text='Kevin').first)
    tap(T('tenant-send-invoice'), 1100)
    opts = page.locator('[data-testid^="invoice-account-"]')
    if opts.count() > 1:
        tap(None, 800, opts.nth(1))
        tap(None, 900, opts.nth(0))
    page.wait_for_timeout(900)
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)

    # 5. Report
    cap('Laporan: pemasukan & unit terlaris')
    page.goto('/today')
    page.wait_for_timeout(700)
    ov()
    tap(T('header-menu-button'), 700)
    tap(T('menu-laporan'), 1000)
    tap(T('laporan-period-week'), 700)
    tap(T('laporan-period-month'), 600)
    scroll(700, 24, 22)
    page.wait_for_timeout(1000)

    cdp.send('Page.stopScreencast')
    print('recorded seconds', round(time.time() - t0, 1), 'frames', len(frames))
    b.close()

# ---- assemble: caption band on top, the app below, then an end card -------------
from PIL import Image, ImageDraw, ImageFont
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BLUE = (36, 87, 214)
W, H, BAND = 1080, 1920, 240

def band(text):
    im = Image.new('RGB', (W, BAND), BLUE)
    d = ImageDraw.Draw(im)
    if text:
        size = 50
        f = ImageFont.truetype(BOLD, size)
        words, lines, cur = text.split(), [], ''
        for w in words:  # wrap to two lines at most
            test = (cur + ' ' + w).strip()
            if d.textlength(test, font=f) > W - 120 and cur:
                lines.append(cur); cur = w
            else:
                cur = test
        lines.append(cur)
        y = (BAND - len(lines) * 62) // 2
        for ln in lines:
            d.text(((W - d.textlength(ln, font=f)) / 2, y), ln, font=f, fill='white')
            y += 62
    return im

def caption_at(ts):
    cur = ''
    for t, txt in caps:
        if t <= ts: cur = txt
    return cur

cache = {}
lst = []
for i, (ts, data) in enumerate(frames):
    fn = f'{FR}{i:05d}.jpg'
    open(fn, 'wb').write(base64.b64decode(data))
    app = Image.open(fn).convert('RGB').resize((W, H - BAND))
    txt = caption_at(ts)
    if txt not in cache: cache[txt] = band(txt)
    canvas = Image.new('RGB', (W, H), BLUE)
    canvas.paste(cache[txt], (0, 0))
    mask = Image.new('L', app.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, app.size[0], app.size[1] + 60], 48, fill=255)
    canvas.paste(app, (0, BAND), mask)
    canvas.save(fn, quality=92)
    nxt = frames[i + 1][0] if i + 1 < len(frames) else ts + 0.4
    lst.append(f"file '{fn}'\nduration {max(0.001, nxt - ts):.4f}\n")

# end card
end = Image.new('RGB', (W, H), BLUE)
d = ImageDraw.Draw(end)
def centered(y, txt, f, fill='white'):
    d.text(((W - d.textlength(txt, font=f)) / 2, y), txt, font=f, fill=fill)
centered(760, 'SewAIn', ImageFont.truetype(BOLD, 120))
centered(915, 'Property Manager', ImageFont.truetype(REG, 56))
d.rounded_rectangle([250, 1060, 830, 1180], 60, fill='white')
centered(1092, 'Coba gratis 14 hari', ImageFont.truetype(BOLD, 50), fill=BLUE)
centered(1260, 'Prospek · Unit · Tenant · Laporan', ImageFont.truetype(REG, 40), fill=(220, 230, 255))
endf = f'{FR}end.jpg'
end.save(endf, quality=92)
lst.append(f"file '{endf}'\nduration 3.0\n")
lst.append(f"file '{endf}'\n")
open(D + 'frames.txt', 'w').write(''.join(lst))
silent = D + 'silent.mp4'
subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', D + 'frames.txt',
                '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
                '-movflags', '+faststart', silent], check=True)
print('wrote', silent)
