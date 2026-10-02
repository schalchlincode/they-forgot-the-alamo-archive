"""Capture selected historical game commits without touching the live checkout.

Run from anywhere with the project virtualenv Python. Requires Playwright and Edge.
Each capture's commit is fixed below; new captures get new filenames.
"""
import contextlib
import io
import json
import subprocess
import tempfile
import threading
import zipfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[4]
GAME = ROOT / 'projects' / 'they-forgot-the-alamo'
OUTPUT = GAME / 'captures' / 'historical'
EDGE = Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
COMMITS = {
    '2026-09-29-first-surviving-room': 'bf4a988e45a1f80994ee3390d61f95409cc873c6',
    '2026-09-30-pre-pixel-room': '14c3825',
}


def capture(name: str, commit: str) -> dict:
    output = OUTPUT / f'{name}.png'
    if output.exists():
        raise FileExistsError(f'Refusing to overwrite historical capture: {output}')
    archive = subprocess.run(
        ['git', 'archive', '--format=zip', commit, 'projects/they-forgot-the-alamo'],
        cwd=ROOT, check=True, capture_output=True,
    ).stdout
    with tempfile.TemporaryDirectory(prefix='alamo-history-') as tmp:
        temp = Path(tmp)
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            for member in zipped.infolist():
                path = Path(member.filename)
                if path.is_absolute() or '..' in path.parts:
                    raise ValueError(f'Unsafe archive path: {member.filename}')
            zipped.extractall(temp)
        game = temp / 'projects' / 'they-forgot-the-alamo'
        handler = partial(SimpleHTTPRequestHandler, directory=str(game))
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        errors = []
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    executable_path=str(EDGE), headless=True,
                    args=['--use-gl=angle', '--use-angle=swiftshader'],
                )
                try:
                    page = browser.new_page(viewport={'width': 1280, 'height': 720})
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    response = page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='networkidle')
                    page.wait_for_timeout(1500)
                    if response.status != 200 or errors:
                        raise RuntimeError(f'Historical game failed: HTTP {response.status}, errors={errors}')
                    canvas = page.locator('#game')
                    if canvas.count() != 1 or not canvas.is_visible():
                        raise RuntimeError('Historical game canvas did not appear')
                    output.parent.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(output))
                finally:
                    browser.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    return {
        'file': str(output.relative_to(GAME)).replace('\\', '/'),
        'commit': subprocess.check_output(['git', 'rev-parse', commit], cwd=ROOT, text=True).strip(),
        'kind': 'historical reconstruction',
        'captured_from': 'isolated git archive in local Edge browser',
    }


def main() -> None:
    results = [capture(name, commit) for name, commit in COMMITS.items()]
    manifest = OUTPUT / 'metadata.json'
    if manifest.exists():
        raise FileExistsError(manifest)
    manifest.write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
