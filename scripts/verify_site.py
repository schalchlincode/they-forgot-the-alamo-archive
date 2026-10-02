"""Browser acceptance checks against the built archive; no external service needed."""
import json
import threading
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    dist = SITE / 'dist'
    assert (dist / 'index.html').is_file(), 'Run npm run build first'
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    evidence = SITE / 'browser-evidence' / stamp
    evidence.mkdir(parents=True, exist_ok=False)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(dist)))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    # The standalone game is also an index.html, but it has no archive-page h1
    # contract or image gallery. Its WebGL runtime is exercised separately.
    routes = sorted('/' + p.parent.relative_to(dist).as_posix().strip('.') + '/' for p in dist.rglob('index.html') if p.parent != dist / 'game')
    routes = sorted(set('/' if r == '//' else r for r in routes))
    media = json.loads((dist / 'media' / 'metadata.json').read_text(encoding='utf-8'))
    results = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=EDGE, headless=True)
            try:
                for label, width, height in [('desktop', 1440, 900), ('phone', 390, 844), ('tablet', 768, 1024)]:
                    page = browser.new_page(viewport={'width': width, 'height': height})
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                    for route in routes:
                        response = page.goto(origin + route, wait_until='networkidle')
                        assert response.status == 200, (route, response.status)
                        # Force lazy images to load before checking actual decoding.
                        page.locator('img').evaluate_all("imgs => imgs.forEach(i => i.loading = 'eager')")
                        page.wait_for_function("Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)")
                        assert page.locator('h1').count() == 1, route
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), (label, route, 'overflow')
                        for href in page.locator('a[href]').evaluate_all("links => links.map(a => a.getAttribute('href'))"):
                            parsed = urlsplit(href)
                            if parsed.scheme or parsed.netloc or not parsed.path:
                                continue
                            target = page.request.get(origin + parsed.path)
                            assert target.status == 200, (route, href, target.status)
                        if route == '/gallery/':
                            for item in media:
                                card = page.locator(f'a:has(img[src="{item["web"]}"])')
                                assert card.count() == 1, item['web']
                                assert card.get_attribute('href') == '/devlog/' + item['entry'] + '/', item
                        if route == '/devlog/':
                            for button in page.locator('[data-filter] button').all():
                                tag = button.get_attribute('data-tag')
                                button.click()
                                assert button.get_attribute('aria-pressed') == 'true'
                                for card in page.locator('#entry-grid .card').all():
                                    expected = tag == 'all' or tag in card.get_attribute('data-tags').split('|')
                                    assert card.is_visible() == expected, (tag, 'filter mismatch')
                            page.locator('[data-tag="all"]').click()
                        assert not errors, (route, errors)
                        if route in ['/', '/gallery/', '/timeline/']:
                            name = route.strip('/').replace('/', '-') or 'home'
                            page.screenshot(path=str(evidence / f'{label}-{name}.png'), full_page=True)
                        results.append({'viewport': label, 'route': route, 'status': 'passed'})
                    # Test navigation by clicking, not just direct requests.
                    for link in page.locator('nav a').all():
                        destination = link.get_attribute('href')
                        link.click()
                        page.wait_for_url(origin + destination)
                    page.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)
    report = {'checked_at': stamp, 'scope': 'local built site only', 'checks': results, 'media_associations': len(media)}
    (evidence / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'PASS: {len(results)} page/viewport checks; {len(media)} media associations. Evidence: {evidence}')


if __name__ == '__main__':
    main()
