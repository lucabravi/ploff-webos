"""Build the diagnostic TTF from the packaged WOFF2 (fonttools + brotli)."""
from pathlib import Path
from fontTools.ttLib import TTFont

vendor = Path(__file__).resolve().parent.parent / 'app' / 'vendor'
font = TTFont(vendor / 'default.woff2', recalcTimestamp=False)
font.flavor = None
font.save(vendor / 'default.ttf')
check = TTFont(vendor / 'default.ttf')
assert check.getBestCmap() == font.getBestCmap()
for tag in ('glyf', 'hmtx', 'name'):
    assert check.getTableData(tag) == font.getTableData(tag), tag
print('Verified equivalent font tables:', (vendor / 'default.ttf').stat().st_size, 'bytes')
