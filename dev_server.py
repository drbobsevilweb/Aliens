#!/usr/bin/env python3
import argparse
import base64
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

LOG_DIR = Path('logs')
LOG_FILE = LOG_DIR / 'error-notes.ndjson'
GRAPHICS_DIR = Path('src/graphics')
ASSETS_DIRS = {
    'floor':   Path('assets/floor'),
    'wall':    Path('assets/wall'),
    'door':    Path('assets/door'),
    'objects': Path('assets/objects'),
    'sprites': Path('assets/sprites/scaled'),
}
# Reference sprites (untouched originals) — not served via /api/sprites but accessible via static files
SPRITES_REFERENCE_DIR = Path('assets/sprites/reference')
MUSIC_DIR = Path('src/music')
AUDIO_DIR = Path('src/audio')
ASSETS_AUDIO_DIR = Path('assets/audio')
MAPS_DIR = Path('maps')
DATA_DIR = Path('data')
HUD_CONFIG_FILE = Path('src/data/hudConfig.js')
ROOT_AUDIO = Path('.')
PROJECT_ROOT = None  # Set in main() after chdir

# File extensions we recognize
IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
AUDIO_EXTS = {'.mp3', '.ogg', '.wav', '.flac', '.m4a'}
SVG_EXTS = {'.svg'}
SVG_CATEGORIES = {'corpse', 'acid', 'debris', 'particles'}
SPRITE_REGISTRY_FILE = DATA_DIR / 'sprite_registry.json'
SVG_SOURCE_ROOT = Path('assets/svg')
SVG_RASTER_ROOT = Path('assets/sprites/scaled/svg')


def scan_graphics():
    """Scan src/graphics/ and /assets/ subdirectories, return sprite/asset list."""
    sprites = []

    # Scan game-engine graphics
    if GRAPHICS_DIR.exists():
        try:
            for file in sorted(GRAPHICS_DIR.rglob('*')):
                if not file.is_file():
                    continue
                if file.suffix.lower() not in IMAGE_EXTS:
                    continue

                rel_path = f'/src/graphics/{file.relative_to(GRAPHICS_DIR)}'.replace('\\', '/')
                name = file.stem
                category = categorize_sprite(name, file)
                dir_rel = str(file.parent).replace('\\', '/')

                sprites.append({
                    'name': name,
                    'path': rel_path,
                    'dir': dir_rel,
                    'category': category,
                })
        except Exception as e:
            print(f'Error scanning graphics: {e}')

    # Scan asset directories used by the map editor
    for asset_cat, asset_dir in ASSETS_DIRS.items():
        if not asset_dir.exists():
            continue
        try:
            for file in sorted(asset_dir.rglob('*')):
                if not file.is_file():
                    continue
                if file.suffix.lower() not in IMAGE_EXTS:
                    continue

                rel_path = f'/{asset_dir}/{file.relative_to(asset_dir)}'.replace('\\', '/')
                name = file.stem
                dir_rel = str(file.parent).replace('\\', '/')

                sprites.append({
                    'name': name,
                    'path': rel_path,
                    'dir': dir_rel,
                    'category': asset_cat,
                })
        except Exception as e:
            print(f'Error scanning {asset_dir}: {e}')

    return sprites


def scan_sounds():
    """Scan src/music/, src/audio/, and root for audio files."""
    sounds = []

    # Directories to scan with their web-accessible prefixes
    dirs_to_scan = [
        (MUSIC_DIR,                    '/src/music'),
        (AUDIO_DIR,                    '/src/audio'),
        (ASSETS_AUDIO_DIR / 'sfx',     '/assets/audio/sfx'),
        (ASSETS_AUDIO_DIR / 'ui',      '/assets/audio/ui'),
        (ASSETS_AUDIO_DIR / 'ambient', '/assets/audio/ambient'),
        (ASSETS_AUDIO_DIR / 'music',   '/assets/audio/music'),
    ]

    for scan_dir, prefix in dirs_to_scan:
        if not scan_dir.exists():
            continue
        try:
            for file in sorted(scan_dir.rglob('*')):
                if not file.is_file():
                    continue
                if file.suffix.lower() not in AUDIO_EXTS:
                    continue

                # Web-accessible path
                rel_path = f'{prefix}/{file.relative_to(scan_dir)}'.replace('\\', '/')
                # Directory label shown in the sidebar
                dir_label = '/'.join(rel_path.split('/')[1:-1])
                name = file.stem
                category = categorize_sound(name, file)

                sounds.append({
                    'name': name,
                    'path': rel_path,
                    'dir': dir_label,
                    'category': category,
                })
        except Exception as e:
            print(f'Error scanning {scan_dir}: {e}')

    # Also check root directory for audio files
    try:
        for file in sorted(ROOT_AUDIO.glob('*.mp3')) + sorted(ROOT_AUDIO.glob('*.ogg')) + sorted(ROOT_AUDIO.glob('*.wav')) + sorted(ROOT_AUDIO.glob('*.flac')) + sorted(ROOT_AUDIO.glob('*.m4a')):
            if not file.is_file():
                continue
            # Skip if in subdirectories
            if file.parent != ROOT_AUDIO:
                continue

            rel_path = f'/{file.name}'
            name = file.stem
            category = categorize_sound(name, file)

            sounds.append({
                'name': name,
                'path': rel_path,
                'dir': '',
                'category': category,
            })
    except Exception as e:
        print(f'Error scanning root audio: {e}')

    return sounds


def categorize_sprite(name, path):
    """Guess sprite category from filename."""
    name_lower = name.lower()
    if 'alien' in name_lower or 'drone' in name_lower or 'queen' in name_lower:
        return 'alien'
    if 'marine' in name_lower or 'leader' in name_lower:
        return 'marine'
    if 'floor' in name_lower or 'corridor_floor' in name_lower:
        return 'floor'
    if 'wall' in name_lower or 'corridor_wall' in name_lower:
        return 'wall'
    if 'tile' in name_lower:
        return 'tile'
    if 'prop' in name_lower:
        return 'prop'
    return 'game'


def categorize_sound(name, path):
    """Guess sound category from filename (check specific patterns first)."""
    name_lower = name.lower()
    # UI / Tracker (check before alien since "aliens-motion-radar" contains "alien")
    if 'motion' in name_lower or 'tracker' in name_lower or 'beep' in name_lower or 'click' in name_lower or 'radar' in name_lower:
        return 'ui'
    # Music (check before alien since some could have "alien" in name)
    if 'music' in name_lower or 'theme' in name_lower or 'score' in name_lower or 'colony' in name_lower or 'bg_' in name_lower:
        return 'music'
    # Weapons / SFX
    if 'weapon' in name_lower or 'rifle' in name_lower or 'shotgun' in name_lower or 'bullet' in name_lower or 'sound_effect' in name_lower or 'sfx' in name_lower:
        return 'weapon'
    # Doors
    if 'door' in name_lower or 'weld' in name_lower:
        return 'door'
    # Ambient
    if 'ambient' in name_lower or 'steam' in name_lower or 'vent' in name_lower or 'atmosphere' in name_lower or 'hum' in name_lower:
        return 'ambient'
    # Speech / radio
    if 'speech' in name_lower or 'voice' in name_lower or 'radio' in name_lower or 'callout' in name_lower:
        return 'speech'
    # Aliens / creature sounds (check last)
    if 'alien' in name_lower or 'hiss' in name_lower or 'screech' in name_lower or 'queen' in name_lower or 'facehugger' in name_lower or 'drone' in name_lower:
        return 'alien'
    return 'other'


def scan_maps():
    """Scan maps/ directory and return map list."""
    maps = []
    if not MAPS_DIR.exists():
        return maps

    try:
        for file in sorted(MAPS_DIR.glob('*.json')):
            if not file.is_file() or file.name.endswith('.template.json'):
                continue

            mapname = file.stem
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    width = data.get('width', 0)
                    height = data.get('height', 0)
                    tilewidth = data.get('tilewidth', 64)
                    tileheight = data.get('tileheight', 64)

                    maps.append({
                        'name': mapname,
                        'label': mapname.replace('_', ' ').title(),
                        'path': f'/maps/{file.name}',
                        'width': width,
                        'height': height,
                        'tilewidth': tilewidth,
                        'tileheight': tileheight,
                        'tiles': (width * height) if width and height else 0,
                    })
            except (json.JSONDecodeError, IOError) as e:
                print(f'Error reading map {file.name}: {e}')
                continue
    except Exception as e:
        print(f'Error scanning maps: {e}')

    return maps


def _is_safe_path(target, allowed_roots):
    """Validate that resolved target is within one of the allowed root directories."""
    try:
        resolved = Path(target).resolve()
        for root in allowed_roots:
            root_resolved = Path(root).resolve()
            if resolved == root_resolved or str(resolved).startswith(str(root_resolved) + os.sep):
                return True
        return False
    except (ValueError, OSError):
        return False


def _decode_data_url(data_url):
    """Strip data URL prefix and decode base64 content."""
    if ',' in data_url:
        data_url = data_url.split(',', 1)[1]
    return base64.b64decode(data_url)


def _parse_hud_config_js(text):
    """Extract JSON object from 'export const HUD_CONFIG = {...};' ES module."""
    match = re.search(r'export\s+const\s+HUD_CONFIG\s*=\s*(\{.*\})\s*;', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    return None


def _read_sprite_registry():
    if not SPRITE_REGISTRY_FILE.exists():
        return {
            'version': 2,
            'referenceSprite': None,
            'characters': {},
            'assignments': {},
            'svgAssets': {},
        }

    try:
        raw = json.loads(SPRITE_REGISTRY_FILE.read_text(encoding='utf-8'))
    except Exception:
        return {
            'version': 2,
            'referenceSprite': None,
            'characters': {},
            'assignments': {},
            'svgAssets': {},
        }

    return {
        'version': int(raw.get('version', 2) or 2),
        'referenceSprite': raw.get('referenceSprite') if isinstance(raw.get('referenceSprite'), dict) else None,
        'characters': raw.get('characters') if isinstance(raw.get('characters'), dict) else {},
        'assignments': raw.get('assignments') if isinstance(raw.get('assignments'), dict) else {},
        'svgAssets': raw.get('svgAssets') if isinstance(raw.get('svgAssets'), dict) else {},
        'updatedAt': raw.get('updatedAt'),
    }


def _write_sprite_registry(registry):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        **registry,
        'version': int(registry.get('version', 2) or 2),
        'referenceSprite': registry.get('referenceSprite') if isinstance(registry.get('referenceSprite'), dict) else None,
        'characters': registry.get('characters') if isinstance(registry.get('characters'), dict) else {},
        'assignments': registry.get('assignments') if isinstance(registry.get('assignments'), dict) else {},
        'svgAssets': registry.get('svgAssets') if isinstance(registry.get('svgAssets'), dict) else {},
        'updatedAt': datetime.now(timezone.utc).isoformat(),
    }
    SPRITE_REGISTRY_FILE.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding='utf-8')


def _normalize_svg_category(value):
    category = str(value or '').strip().lower()
    return category if category in SVG_CATEGORIES else None


def _normalize_svg_filename(value):
    cleaned = re.sub(r'[^a-zA-Z0-9_.-]', '_', str(value or '').strip())
    if not cleaned:
        return None
    return cleaned if cleaned.lower().endswith('.svg') else f'{cleaned}.svg'


def _svg_asset_response(category, filename, meta):
    name = Path(filename).stem
    return {
        'category': category,
        'name': name,
        'filename': filename,
        'sourcePath': f'/assets/svg/{category}/{filename}',
        'rasterPath': meta.get('rasterPath'),
        'width': int(meta['width']) if meta.get('width') is not None else None,
        'height': int(meta['height']) if meta.get('height') is not None else None,
        'viewBox': meta.get('viewBox'),
        'brightness': int(meta.get('brightness', 0) or 0),
        'contrast': int(meta.get('contrast', 0) or 0),
        'overlayColor': meta.get('overlayColor') or '#4aa4d8',
        'overlayAlpha': int(meta.get('overlayAlpha', 0) or 0),
        'usage': meta.get('usage'),
        'target': meta.get('target'),
        'notes': meta.get('notes') or '',
        'updatedAt': meta.get('updatedAt'),
    }


class Handler(SimpleHTTPRequestHandler):
    def _send_json(self, payload, status=HTTPStatus.OK):
        raw = json.dumps(payload, ensure_ascii=True).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_json_body(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return None
        if length <= 0 or length > 50_000_000:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except json.JSONDecodeError:
            return None

    def do_POST(self):
        parsed_url = urlparse(self.path)
        route_path = parsed_url.path
        query = parse_qs(parsed_url.query)

        # ── Error notes ────────────────────────────────────────────────
        if route_path == '/api/error-notes':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            title = str(data.get('title', '')).strip()[:160]
            body = str(data.get('body', '')).strip()[:20000]
            url = str(data.get('url', '')).strip()[:500]
            source_time = str(data.get('time', '')).strip()[:120]

            if not body:
                self._send_json({'ok': False, 'error': 'Empty body'}, HTTPStatus.BAD_REQUEST)
                return

            record = {
                'server_time_utc': datetime.now(timezone.utc).isoformat(),
                'title': title or 'Untitled',
                'body': body,
                'url': url,
                'source_time': source_time,
                'remote_addr': self.client_address[0] if self.client_address else '',
            }

            LOG_DIR.mkdir(parents=True, exist_ok=True)
            with LOG_FILE.open('a', encoding='utf-8') as f:
                f.write(json.dumps(record, ensure_ascii=True) + '\n')

            self._send_json({'ok': True, 'saved_to': str(LOG_FILE)})

        # ── Maps save ──────────────────────────────────────────────────
        elif route_path.startswith('/api/maps/'):
            mapname = unquote(route_path[len('/api/maps/'):])

            mapdata = self._read_json_body()
            if not isinstance(mapdata, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                MAPS_DIR.mkdir(parents=True, exist_ok=True)
                mapfile = MAPS_DIR / f'{mapname}.json'
                with open(mapfile, 'w', encoding='utf-8') as f:
                    json.dump(mapdata, f, ensure_ascii=True, indent=2)
                self._send_json({'ok': True, 'saved_to': str(mapfile), 'name': mapname})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Sprites save ───────────────────────────────────────────────
        elif route_path == '/api/sprites/save':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            filename = str(data.get('filename', '') or data.get('name', '')).strip()
            directory = str(data.get('dir', '') or data.get('directory', '')).strip()
            data_url = str(data.get('dataUrl', '')).strip()

            if not filename or not data_url:
                self._send_json({'ok': False, 'error': 'Missing filename or dataUrl'}, HTTPStatus.BAD_REQUEST)
                return

            # Default directory to src/graphics
            if not directory:
                directory = 'src/graphics'

            # Ensure filename has an image extension
            if not any(filename.lower().endswith(ext) for ext in IMAGE_EXTS):
                filename += '.png'

            # Sanitize filename
            filename = filename.replace('..', '').replace('/', '').replace('\\', '')

            target = Path(directory) / filename
            if not _is_safe_path(target, [GRAPHICS_DIR, Path('assets')]):
                self._send_json({'ok': False, 'error': 'Invalid path'}, HTTPStatus.FORBIDDEN)
                return

            try:
                raw = _decode_data_url(data_url)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
                web_path = '/' + str(target).replace('\\', '/')
                self._send_json({'ok': True, 'path': web_path})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Sounds save ────────────────────────────────────────────────
        elif route_path == '/api/sounds/save':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            file_path = str(data.get('filePath', '')).strip()
            data_b64 = str(data.get('data', '') or data.get('dataUrl', '')).strip()

            if not file_path or not data_b64:
                self._send_json({'ok': False, 'error': 'Missing filePath or data'}, HTTPStatus.BAD_REQUEST)
                return

            # Strip leading slash for filesystem path
            fs_path = file_path.lstrip('/')
            target = Path(fs_path)

            if not _is_safe_path(target, [AUDIO_DIR, MUSIC_DIR, Path('assets')]):
                self._send_json({'ok': False, 'error': 'Invalid path'}, HTTPStatus.FORBIDDEN)
                return

            try:
                raw = _decode_data_url(data_b64)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
                web_path = '/' + str(target).replace('\\', '/')
                self._send_json({'ok': True, 'path': web_path})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Legacy sound save ────────────────────────────────────────
        elif route_path == '/api/save-sound':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            save_path = str(data.get('path', '')).strip()
            data_b64 = str(data.get('data', '')).strip()
            if not save_path or not data_b64:
                self._send_json({'ok': False, 'error': 'Missing path or data'}, HTTPStatus.BAD_REQUEST)
                return

            normalized_path = save_path[1:] if save_path.startswith('/') else save_path
            allowed_prefixes = ('src/audio/', 'src/music/', 'assets/')
            allowed_extensions = ('.wav', '.ogg')
            if '..' in normalized_path or not normalized_path.startswith(allowed_prefixes) or not normalized_path.endswith(allowed_extensions):
                self._send_json({'ok': False, 'error': 'Invalid or disallowed path'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                target = Path(normalized_path)
                if not _is_safe_path(target, [AUDIO_DIR, MUSIC_DIR, Path('assets')]):
                    self._send_json({'ok': False, 'error': 'Path escape detected'}, HTTPStatus.FORBIDDEN)
                    return
                raw = base64.b64decode(data_b64)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
                self._send_json({'ok': True, 'path': normalized_path, 'size': len(raw)})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Legacy raw audio upload ──────────────────────────────────
        elif route_path == '/api/audio-upload':
            target = str(query.get('target', [''])[0]).strip()
            allowed_prefixes = ('src/audio/', 'src/music/')
            if not target or '..' in target or target.startswith('/') or not target.startswith(allowed_prefixes):
                self._send_json({'ok': False, 'error': 'Invalid path'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            if length <= 0 or length > 50_000_000:
                self._send_json({'ok': False, 'error': 'File too large or empty (max 50 MB)'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                raw = self.rfile.read(length)
                target_path = Path(target)
                if not _is_safe_path(target_path, [AUDIO_DIR, MUSIC_DIR]):
                    self._send_json({'ok': False, 'error': 'Path escape detected'}, HTTPStatus.FORBIDDEN)
                    return
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_bytes(raw)
                self._send_json({'ok': True, 'path': target, 'size': len(raw)})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Sounds upload (multipart form) ─────────────────────────────
        elif route_path == '/api/sounds/upload':
            self._handle_sound_upload()

        # ── HUD config save ────────────────────────────────────────────
        elif route_path == '/api/hud-config':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                js_content = '// Auto-generated by HUD Editor — do not edit manually\nexport const HUD_CONFIG = ' + json.dumps(data, indent=2, ensure_ascii=True) + ';\n'
                HUD_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
                HUD_CONFIG_FILE.write_text(js_content, encoding='utf-8')
                self._send_json({'ok': True})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Legacy HUD config save ───────────────────────────────────
        elif route_path == '/api/save-hud-config':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Expected JSON object'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                js_content = '// Auto-generated by HUD Editor — do not edit manually\nexport const HUD_CONFIG = ' + json.dumps(data, indent=2, ensure_ascii=True) + ';\n'
                HUD_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
                HUD_CONFIG_FILE.write_text(js_content, encoding='utf-8')
                self._send_json({'ok': True, 'path': 'src/data/hudConfig.js'})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Editor state save ──────────────────────────────────────────
        elif route_path == '/api/editor-state':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                state_file = DATA_DIR / 'editor_state.json'
                state = _unwrap_editor_state_payload(data)
                with open(state_file, 'w', encoding='utf-8') as f:
                    json.dump(state, f, ensure_ascii=True, indent=2)
                self._send_json({'ok': True})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Mission package save ───────────────────────────────────────
        elif route_path == '/api/mission-package':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                pkg_file = DATA_DIR / 'mission_package.json'
                with open(pkg_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=True, indent=2)
                self._send_json({'ok': True})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Story editor save ────────────────────────────────────────
        elif route_path.startswith('/api/stories/'):
            story_id = unquote(route_path[len('/api/stories/'):])
            if not story_id or not all(c.isalnum() or c in '_-' for c in story_id):
                self._send_json({'ok': False, 'error': 'Invalid story ID'}, HTTPStatus.BAD_REQUEST)
                return
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return
            try:
                stories_dir = DATA_DIR / 'stories'
                stories_dir.mkdir(parents=True, exist_ok=True)
                story_file = stories_dir / f'{story_id}.json'
                with open(story_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=True, indent=2)
                self._send_json({'ok': True, 'path': f'data/stories/{story_id}.json'})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── SVG action graph save ────────────────────────────────────
        elif route_path.startswith('/api/svg-actions/'):
            graph_id = unquote(route_path[len('/api/svg-actions/'):])
            if not graph_id or not all(c.isalnum() or c in '_-' for c in graph_id):
                self._send_json({'ok': False, 'error': 'Invalid graph ID'}, HTTPStatus.BAD_REQUEST)
                return
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return
            try:
                actions_dir = DATA_DIR / 'svg_actions'
                actions_dir.mkdir(parents=True, exist_ok=True)
                graph_file = actions_dir / f'{graph_id}.json'
                with open(graph_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=True, indent=2)
                self._send_json({'ok': True, 'path': f'data/svg_actions/{graph_id}.json'})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Sprite registry save ─────────────────────────────────────
        elif route_path == '/api/svg-assets/save':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            category = _normalize_svg_category(data.get('category'))
            filename = _normalize_svg_filename(data.get('filename'))
            svg_text = str(data.get('svgText', '')).strip()
            if not category or not filename or not svg_text:
                self._send_json({'ok': False, 'error': 'Invalid SVG save payload'}, HTTPStatus.BAD_REQUEST)
                return

            base_name = Path(filename).stem
            source_path = SVG_SOURCE_ROOT / category / filename
            raster_path = SVG_RASTER_ROOT / category / f'{base_name}.png'

            if not _is_safe_path(source_path, [SVG_SOURCE_ROOT]) or not _is_safe_path(raster_path, [SVG_RASTER_ROOT]):
                self._send_json({'ok': False, 'error': 'Invalid SVG asset destination'}, HTTPStatus.FORBIDDEN)
                return

            try:
                source_path.parent.mkdir(parents=True, exist_ok=True)
                source_path.write_text(svg_text, encoding='utf-8')

                png_data = str(data.get('pngDataUrl', '')).strip()
                if png_data:
                    raster_path.parent.mkdir(parents=True, exist_ok=True)
                    raster_path.write_bytes(_decode_data_url(png_data))

                registry = _read_sprite_registry()
                registry.setdefault('svgAssets', {})
                registry['svgAssets'].setdefault(category, {})
                registry['svgAssets'][category][base_name] = {
                    'sourcePath': f'/assets/svg/{category}/{filename}',
                    'rasterPath': f'/assets/sprites/scaled/svg/{category}/{base_name}.png' if raster_path.exists() else None,
                    'width': int(data['width']) if data.get('width') is not None else None,
                    'height': int(data['height']) if data.get('height') is not None else None,
                    'viewBox': str(data.get('viewBox', '')).strip() or None,
                    'brightness': int(data.get('brightness', 0) or 0),
                    'contrast': int(data.get('contrast', 0) or 0),
                    'overlayColor': str(data.get('overlayColor') or '#4aa4d8'),
                    'overlayAlpha': int(data.get('overlayAlpha', 0) or 0),
                    'usage': str(data.get('usage', '')).strip() or None,
                    'target': str(data.get('target', '')).strip() or None,
                    'notes': str(data.get('notes', '')).strip(),
                    'updatedAt': datetime.now(timezone.utc).isoformat(),
                }
                _write_sprite_registry(registry)

                self._send_json({
                    'ok': True,
                    'asset': {
                        'category': category,
                        'name': base_name,
                        'filename': filename,
                        'sourcePath': f'/assets/svg/{category}/{filename}',
                        'rasterPath': f'/assets/sprites/scaled/svg/{category}/{base_name}.png' if raster_path.exists() else None,
                        'usage': registry['svgAssets'][category][base_name].get('usage'),
                        'target': registry['svgAssets'][category][base_name].get('target'),
                        'notes': registry['svgAssets'][category][base_name].get('notes') or '',
                    },
                })
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        elif route_path == '/api/sprites/registry':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return
            try:
                existing = _read_sprite_registry()
                payload = {
                    **existing,
                    **data,
                    'version': int(data.get('version', existing.get('version', 2)) or existing.get('version', 2) or 2),
                    'referenceSprite': data.get('referenceSprite') if isinstance(data.get('referenceSprite'), dict) else existing.get('referenceSprite'),
                    'characters': data.get('characters') if isinstance(data.get('characters'), dict) else existing.get('characters', {}),
                    'assignments': data.get('assignments') if isinstance(data.get('assignments'), dict) else existing.get('assignments', {}),
                    'svgAssets': data.get('svgAssets') if isinstance(data.get('svgAssets'), dict) else existing.get('svgAssets', {}),
                }
                _write_sprite_registry(payload)
                self._send_json({'ok': True, 'path': 'data/sprite_registry.json'})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Editor test map ────────────────────────────────────────────
        elif route_path == '/api/editor-test-map':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            try:
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                test_file = DATA_DIR / 'editor_test_map.json'
                with open(test_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=True, indent=2)
                url = '/game?mission=test&map=/data/editor_test_map.json'
                self._send_json({'ok': True, 'url': url})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Tiled build ────────────────────────────────────────────────
        elif route_path == '/api/tiled-build':
            try:
                result = subprocess.run(
                    ['npm', 'run', 'build:tiled'],
                    capture_output=True, text=True, timeout=30,
                    cwd=str(Path('.').resolve())
                )
                output = (result.stdout + '\n' + result.stderr).strip()
                if result.returncode == 0:
                    self._send_json({'ok': True, 'output': output})
                else:
                    self._send_json({'ok': False, 'error': output or 'Build failed'}, HTTPStatus.INTERNAL_SERVER_ERROR)
            except subprocess.TimeoutExpired:
                self._send_json({'ok': False, 'error': 'Build timed out'}, HTTPStatus.INTERNAL_SERVER_ERROR)
            except FileNotFoundError:
                self._send_json({'ok': False, 'error': 'npm not found'}, HTTPStatus.INTERNAL_SERVER_ERROR)
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        else:
            self.send_error(HTTPStatus.NOT_FOUND, 'Not Found')

    def _handle_sound_upload(self):
        """Handle multipart form upload for sound files."""
        content_type = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in content_type:
            self._send_json({'ok': False, 'error': 'Expected multipart/form-data'}, HTTPStatus.BAD_REQUEST)
            return

        try:
            import cgi
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type}
            )

            audio_field = form['audio']
            path_field = form.getfirst('path', '')

            if not audio_field.file or not path_field:
                self._send_json({'ok': False, 'error': 'Missing audio or path'}, HTTPStatus.BAD_REQUEST)
                return

            fs_path = path_field.lstrip('/')
            target = Path(fs_path)

            if not _is_safe_path(target, [AUDIO_DIR, MUSIC_DIR, Path('assets')]):
                self._send_json({'ok': False, 'error': 'Invalid path'}, HTTPStatus.FORBIDDEN)
                return

            raw = audio_field.file.read()
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            web_path = '/' + str(target).replace('\\', '/')
            self._send_json({'ok': True, 'path': web_path})
        except Exception as e:
            self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_GET(self):
        parsed_url = urlparse(self.path)
        route_path = parsed_url.path
        query = parse_qs(parsed_url.query)

        if route_path == '/api/error-notes':
            if not LOG_FILE.exists():
                self._send_json({'ok': True, 'entries': []})
                return
            entries = []
            with LOG_FILE.open('r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            self._send_json({'ok': True, 'entries': entries[-200:]})
            return
        # ── Editor asset endpoints ─────────────────────────────────────
        elif route_path == '/api/sprites':
            sprites = scan_graphics()
            self._send_json({'ok': True, 'sprites': sprites})
            return
        elif route_path == '/api/svg-assets':
            requested_category = _normalize_svg_category(query.get('category', [None])[0]) if 'category' in query else None
            if 'category' in query and not requested_category:
                self._send_json({'ok': False, 'error': 'Invalid SVG category'}, HTTPStatus.BAD_REQUEST)
                return

            registry = _read_sprite_registry()
            categories = [requested_category] if requested_category else sorted(SVG_CATEGORIES)
            assets = []
            for category in categories:
                category_dir = SVG_SOURCE_ROOT / category
                if not category_dir.exists():
                    continue
                for file in sorted(category_dir.iterdir()):
                    if not file.is_file() or file.suffix.lower() not in SVG_EXTS:
                        continue
                    meta = registry.get('svgAssets', {}).get(category, {}).get(file.stem, {})
                    assets.append(_svg_asset_response(category, file.name, meta))

            self._send_json({'ok': True, 'assets': assets})
            return
        elif route_path == '/api/svg-assets/list':
            requested_category = _normalize_svg_category(query.get('category', [None])[0]) if 'category' in query else None
            if 'category' in query and not requested_category:
                self._send_json({'ok': False, 'error': 'Invalid SVG category'}, HTTPStatus.BAD_REQUEST)
                return

            registry = _read_sprite_registry()
            categories = [requested_category] if requested_category else sorted(SVG_CATEGORIES)
            assets = []
            for category in categories:
                category_dir = SVG_SOURCE_ROOT / category
                if not category_dir.exists():
                    continue
                for file in sorted(category_dir.iterdir()):
                    if not file.is_file() or file.suffix.lower() not in SVG_EXTS:
                        continue
                    meta = registry.get('svgAssets', {}).get(category, {}).get(file.stem, {})
                    assets.append(_svg_asset_response(category, file.name, meta))

            self._send_json({'ok': True, 'assets': assets})
            return
        elif route_path == '/api/svg-assets/content':
            category = _normalize_svg_category(query.get('category', [None])[0])
            filename = _normalize_svg_filename(query.get('filename', [None])[0])
            if not category or not filename:
                self._send_json({'ok': False, 'error': 'Invalid SVG asset path'}, HTTPStatus.BAD_REQUEST)
                return

            source_path = SVG_SOURCE_ROOT / category / filename
            if not _is_safe_path(source_path, [SVG_SOURCE_ROOT]) or not source_path.exists():
                self._send_json({'ok': False, 'error': 'SVG asset not found'}, HTTPStatus.NOT_FOUND)
                return

            registry = _read_sprite_registry()
            meta = registry.get('svgAssets', {}).get(category, {}).get(Path(filename).stem, {})
            self._send_json({
                'ok': True,
                'asset': _svg_asset_response(category, filename, meta),
                'svgText': source_path.read_text(encoding='utf-8'),
            })
            return
        elif route_path == '/api/stories':
            stories_dir = DATA_DIR / 'stories'
            stories_dir.mkdir(parents=True, exist_ok=True)
            stories = []
            for f in sorted(stories_dir.glob('*.json')):
                try:
                    d = json.loads(f.read_text(encoding='utf-8'))
                    stories.append({'id': d.get('id', f.stem), 'name': d.get('name', f.stem)})
                except Exception:
                    pass
            self._send_json({'ok': True, 'stories': stories})
            return
        elif route_path.startswith('/api/stories/'):
            story_id = unquote(route_path[len('/api/stories/'):])
            if not story_id or not all(c.isalnum() or c in '_-' for c in story_id):
                self._send_json({'ok': False, 'error': 'Invalid story ID'}, HTTPStatus.BAD_REQUEST)
                return
            story_file = DATA_DIR / 'stories' / f'{story_id}.json'
            if not story_file.exists():
                self._send_json({'ok': False, 'error': 'Story not found'}, HTTPStatus.NOT_FOUND)
                return
            try:
                self._send_json({'ok': True, 'story': json.loads(story_file.read_text(encoding='utf-8'))})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        elif route_path == '/api/svg-actions':
            actions_dir = DATA_DIR / 'svg_actions'
            actions_dir.mkdir(parents=True, exist_ok=True)
            graph_list = []
            for f in sorted(actions_dir.glob('*.json')):
                try:
                    d = json.loads(f.read_text(encoding='utf-8'))
                    graph_list.append({'id': d.get('id', f.stem), 'name': d.get('name', f.stem)})
                except Exception:
                    pass
            self._send_json({'ok': True, 'graphs': graph_list})
            return
        elif route_path.startswith('/api/svg-actions/'):
            graph_id = unquote(route_path[len('/api/svg-actions/'):])
            if not graph_id or not all(c.isalnum() or c in '_-' for c in graph_id):
                self._send_json({'ok': False, 'error': 'Invalid graph ID'}, HTTPStatus.BAD_REQUEST)
                return
            graph_file = DATA_DIR / 'svg_actions' / f'{graph_id}.json'
            if not graph_file.exists():
                self._send_json({'ok': False, 'error': 'Action graph not found'}, HTTPStatus.NOT_FOUND)
                return
            try:
                self._send_json({'ok': True, 'graph': json.loads(graph_file.read_text(encoding='utf-8'))})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        elif route_path == '/api/mission-package':
            try:
                pkg_file = DATA_DIR / 'mission_package.json'
                if not pkg_file.exists():
                    self._send_json({'ok': True, 'package': {}})
                    return
                self._send_json({'ok': True, 'package': json.loads(pkg_file.read_text(encoding='utf-8'))})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        elif route_path == '/api/sprites/registry':
            try:
                self._send_json({'ok': True, 'registry': _read_sprite_registry()})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        elif route_path == '/api/sprites/marine-reference':
            # Read from sprite registry — Image Editor is sole authority on sizing
            ref = _read_sprite_registry().get('referenceSprite')
            if ref:
                self._send_json({
                    'ok': True,
                    'path': ref.get('path', '/assets/sprites/scaled/marine/marine_topdown.png'),
                    'frameWidth': ref.get('width', 122),
                    'frameHeight': ref.get('height', 118),
                    'frameCount': 1,
                    'gameDisplayWidth': ref.get('width', 122),
                    'gameDisplayHeight': ref.get('height', 118),
                })
            else:
                self._send_json({
                    'ok': True,
                    'path': '/assets/sprites/scaled/marine/marine_topdown.png',
                    'frameWidth': 122,
                    'frameHeight': 118,
                    'frameCount': 1,
                    'gameDisplayWidth': 122,
                    'gameDisplayHeight': 118,
                })
            return
        elif route_path == '/api/sounds':
            sounds = scan_sounds()
            self._send_json({'ok': True, 'sounds': sounds})
            return
        elif route_path == '/api/maps':
            maps = scan_maps()
            self._send_json({'ok': True, 'maps': maps})
            return
        elif route_path.startswith('/api/maps/'):
            mapname = unquote(route_path[len('/api/maps/'):])
            mapfile = MAPS_DIR / f'{mapname}.json'
            if mapfile.exists() and mapfile.is_file():
                try:
                    with open(mapfile, 'r', encoding='utf-8') as f:
                        mapdata = json.load(f)
                    self._send_json({'ok': True, 'map': mapdata, 'name': mapname})
                    return
                except Exception as e:
                    self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
                    return
            self._send_json({'ok': False, 'error': 'Map not found'}, HTTPStatus.NOT_FOUND)
            return
        elif route_path == '/api/hud-config':
            if HUD_CONFIG_FILE.exists():
                try:
                    text = HUD_CONFIG_FILE.read_text(encoding='utf-8')
                    config = _parse_hud_config_js(text)
                    if config is not None:
                        self._send_json({'ok': True, 'config': config})
                    else:
                        self._send_json({'ok': True, 'config': {}})
                except Exception as e:
                    self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            else:
                self._send_json({'ok': True, 'config': {}})
            return
        elif route_path == '/api/editor-state':
            state_file = DATA_DIR / 'editor_state.json'
            if state_file.exists():
                try:
                    with open(state_file, 'r', encoding='utf-8') as f:
                        state = _unwrap_editor_state_payload(json.load(f))
                    self._send_json({'ok': True, 'state': state})
                except Exception as e:
                    self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            else:
                self._send_json({'ok': True, 'state': {}})
            return
        elif route_path == '/api/editor-test-map':
            test_file = DATA_DIR / 'editor_test_map.json'
            if not test_file.exists():
                self._send_json({'ok': True, 'testMap': None})
                return
            try:
                with open(test_file, 'r', encoding='utf-8') as f:
                    test_map = json.load(f)
                self._send_json({'ok': True, 'testMap': test_map})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        elif route_path == '/api/health':
            self._send_json({'ok': True, 'status': 'healthy'})
            return
        super().do_GET()

    def do_DELETE(self):
        parsed_url = urlparse(self.path)
        route_path = parsed_url.path

        # ── Delete sprite ──────────────────────────────────────────────
        if route_path.startswith('/api/svg-assets/'):
            remainder = unquote(route_path[len('/api/svg-assets/'):])
            parts = remainder.split('/', 1)
            if len(parts) != 2:
                self._send_json({'ok': False, 'error': 'Invalid SVG asset path'}, HTTPStatus.BAD_REQUEST)
                return

            category = _normalize_svg_category(parts[0])
            filename = _normalize_svg_filename(parts[1])
            if not category or not filename:
                self._send_json({'ok': False, 'error': 'Invalid SVG asset path'}, HTTPStatus.BAD_REQUEST)
                return

            base_name = Path(filename).stem
            source_path = SVG_SOURCE_ROOT / category / filename
            raster_path = SVG_RASTER_ROOT / category / f'{base_name}.png'
            if not _is_safe_path(source_path, [SVG_SOURCE_ROOT]):
                self._send_json({'ok': False, 'error': 'Invalid SVG asset path'}, HTTPStatus.FORBIDDEN)
                return

            try:
                if source_path.exists():
                    source_path.unlink()
                if _is_safe_path(raster_path, [SVG_RASTER_ROOT]) and raster_path.exists():
                    raster_path.unlink()

                registry = _read_sprite_registry()
                if base_name in registry.get('svgAssets', {}).get(category, {}):
                    del registry['svgAssets'][category][base_name]
                    if not registry['svgAssets'][category]:
                        del registry['svgAssets'][category]
                    _write_sprite_registry(registry)

                self._send_json({'ok': True})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        elif route_path.startswith('/api/sprites/'):
            # Path format: /api/sprites/{dir}/{name}
            # dir may contain slashes (e.g. src/graphics/generated)
            remainder = unquote(route_path[len('/api/sprites/'):])

            # The name is the last segment; dir is everything before it
            parts = remainder.rsplit('/', 1)
            if len(parts) != 2 or not parts[0] or not parts[1]:
                self._send_json({'ok': False, 'error': 'Invalid path'}, HTTPStatus.BAD_REQUEST)
                return

            dir_part, name_part = parts

            # Find the actual file — name_part may be stem without extension
            target_dir = Path(dir_part)
            found = None
            if target_dir.exists():
                # Try exact match first (name has extension)
                exact = target_dir / name_part
                if exact.is_file():
                    found = exact
                else:
                    # Try with common image extensions
                    for ext in IMAGE_EXTS:
                        candidate = target_dir / (name_part + ext)
                        if candidate.is_file():
                            found = candidate
                            break

            if not found:
                self._send_json({'ok': False, 'error': 'File not found'}, HTTPStatus.NOT_FOUND)
                return

            if not _is_safe_path(found, [GRAPHICS_DIR, Path('assets')]):
                self._send_json({'ok': False, 'error': 'Invalid path'}, HTTPStatus.FORBIDDEN)
                return

            try:
                found.unlink()
                self._send_json({'ok': True})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Delete sound ───────────────────────────────────────────────
        elif route_path == '/api/sounds':
            data = self._read_json_body()
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'Invalid JSON body'}, HTTPStatus.BAD_REQUEST)
                return

            file_path = str(data.get('filePath', '')).strip()
            if not file_path:
                self._send_json({'ok': False, 'error': 'Missing filePath'}, HTTPStatus.BAD_REQUEST)
                return

            fs_path = file_path.lstrip('/')
            target = Path(fs_path)

            if not _is_safe_path(target, [AUDIO_DIR, MUSIC_DIR, Path('assets')]):
                self._send_json({'ok': False, 'error': 'Invalid path'}, HTTPStatus.FORBIDDEN)
                return

            if not target.exists():
                self._send_json({'ok': False, 'error': 'File not found'}, HTTPStatus.NOT_FOUND)
                return

            try:
                target.unlink()
                self._send_json({'ok': True})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Delete story ───────────────────────────────────────────────
        elif route_path.startswith('/api/stories/'):
            story_id = unquote(route_path[len('/api/stories/'):])
            if not story_id or not all(c.isalnum() or c in '_-' for c in story_id):
                self._send_json({'ok': False, 'error': 'Invalid story ID'}, HTTPStatus.BAD_REQUEST)
                return
            story_file = DATA_DIR / 'stories' / f'{story_id}.json'
            if not story_file.exists():
                self._send_json({'ok': False, 'error': 'Story not found'}, HTTPStatus.NOT_FOUND)
                return
            try:
                story_file.unlink()
                self._send_json({'ok': True})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        # ── Delete SVG action graph ────────────────────────────────────
        elif route_path.startswith('/api/svg-actions/'):
            graph_id = unquote(route_path[len('/api/svg-actions/'):])
            if not graph_id or not all(c.isalnum() or c in '_-' for c in graph_id):
                self._send_json({'ok': False, 'error': 'Invalid graph ID'}, HTTPStatus.BAD_REQUEST)
                return
            graph_file = DATA_DIR / 'svg_actions' / f'{graph_id}.json'
            if not graph_file.exists():
                self._send_json({'ok': False, 'error': 'Action graph not found'}, HTTPStatus.NOT_FOUND)
                return
            try:
                graph_file.unlink()
                self._send_json({'ok': True})
            except Exception as e:
                self._send_json({'ok': False, 'error': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        else:
            self.send_error(HTTPStatus.NOT_FOUND, 'Not Found')


def main():
    parser = argparse.ArgumentParser(description='ALIENS dev server with error log API')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8192)
    args = parser.parse_args()

    os.chdir(Path(__file__).resolve().parent)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f'Serving on http://{args.host}:{args.port} (cwd={os.getcwd()})')
    print(f'Error log endpoint: http://{args.host}:{args.port}/api/error-notes')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
