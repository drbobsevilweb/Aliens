#!/usr/bin/env python3
import argparse
import json
import os
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

LOG_DIR = Path('logs')
LOG_FILE = LOG_DIR / 'error-notes.ndjson'


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
        if length <= 0 or length > 200_000:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except json.JSONDecodeError:
            return None

    def do_POST(self):
        if self.path != '/api/error-notes':
            self.send_error(HTTPStatus.NOT_FOUND, 'Not Found')
            return

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

    def do_GET(self):
        if self.path == '/api/error-notes':
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
        super().do_GET()


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
