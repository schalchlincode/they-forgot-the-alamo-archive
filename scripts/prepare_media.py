"""Create web copies without changing archival PNG sources."""
import json
from pathlib import Path
from PIL import Image

GAME = Path(__file__).resolve().parents[2]
PUBLIC = GAME / 'site' / 'public' / 'media'
SOURCES = {
    'first-commit-room': ('captures/historical/2026-09-29-first-surviving-room.png', 'Reconstructed from commit bf4a988 in isolated Edge browser capture, 2026-10-01', 'first-room'),
    'pre-pixel-room': ('captures/historical/2026-09-30-pre-pixel-room.png', 'Reconstructed from commit 14c3825 in isolated Edge browser capture, 2026-10-01', 'camera-finds-davy'),
    'early-room': ('b0-before-20261001/gameplay-rear.png', 'Baseline capture made 2026-10-01 of the earlier procedural character state', 'first-room'),
    'pixel-grid-on': ('b2-lowres-on.png', 'Experimental capture made 2026-10-01', 'pixel-grid'),
    'pixel-grid-off': ('b2-lowres-off.png', 'Experimental capture made 2026-10-01', 'pixel-grid'),
    'dither-on': ('b2-dither-tuned-on-20261001.png', 'Experimental capture made 2026-10-01', 'graphics-laboratory'),
    'vertex-snap-on': ('b2-vertex-snap-on-20261001.png', 'Experimental capture made 2026-10-01', 'graphics-laboratory'),
    'davy-b3': ('art/renders/davy-b3/three-quarter.png', 'Model review render recorded 2026-10-01', 'davy-gets-a-face'),
    'davy-b4': ('art/renders/davy-b4/contact-sheet.png', 'Model review contact sheet recorded 2026-10-01', 'davy-learns-to-move'),
    'raccoon-room': ('regression-screenshots/b4-05-raccoon-view.png', 'Regression capture from 2026-10-01, before later integration fixes', 'raccoon-gets-bones'),
    'current-room': ('captures/2026-10-01-current-room.png', 'Fresh browser capture of the current game on 2026-10-01; not a screenshot from the older commit', 'making-the-models-work'),
    'shotgun-model': ('shotgun-review.png', 'Game browser review capture made 2026-10-02 after the Blender shotgun integration', 'blender-shotgun'),
    'shotgun-open': ('shotgun-open-review.png', 'Game browser review capture made 2026-10-02 of the break-open reload', 'blender-shotgun'),
    'two-hand-carry': ('tmp-two-hand.png', 'Game browser capture made 2026-10-02 during the two-arm carry review', 'two-hand-carry'),
}

def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    metadata = []
    for name, (source, note, entry) in SOURCES.items():
        original = GAME / source
        if not original.is_file():
            raise FileNotFoundError(original)
        destination = PUBLIC / f'{name}.webp'
        with Image.open(original) as image:
            image.convert('RGB').save(destination, 'WEBP', quality=86, method=6)
        metadata.append({'web': f'/media/{name}.webp', 'original': source, 'note': note, 'entry': entry})
    (PUBLIC / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared {len(metadata)} web images; original PNGs untouched.')

if __name__ == '__main__':
    main()
