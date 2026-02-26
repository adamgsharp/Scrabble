#!/usr/bin/env python3
"""
Scrabble Word Solver — development server.

Usage:
    python server.py

Opens http://localhost:8080 in your browser.
Downloads the Scrabble word list on first run (requires internet).
"""

import http.server
import socketserver
import os
import sys
import urllib.request
import threading
import webbrowser

PORT = 8080
WORDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'words.txt')

# TWL06 Scrabble dictionary (Tournament Word List, North American Scrabble)
WORD_LIST_URL = (
    'https://raw.githubusercontent.com/redbo/scrabbletools/master/dictionary.txt'
)

# Fallback if GitHub is unavailable
FALLBACK_URL = (
    'https://raw.githubusercontent.com/zeisler/scrabble/master/db/dictionary.txt'
)


def download_word_list():
    """Download the Scrabble word list if not already present."""
    if os.path.exists(WORDS_FILE):
        size = os.path.getsize(WORDS_FILE)
        if size > 100_000:   # sanity-check: at least ~100 KB
            print(f'  Word list already present ({size:,} bytes) — skipping download.')
            return True

    print('  Downloading Scrabble word list…')
    for url in (WORD_LIST_URL, FALLBACK_URL):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            with open(WORDS_FILE, 'wb') as f:
                f.write(data)
            print(f'  Downloaded {len(data):,} bytes → words.txt')
            return True
        except Exception as e:
            print(f'  Could not download from {url}: {e}')

    print('  WARNING: Could not download word list.')
    print('  The app will try to fetch it directly from the browser instead.')
    return False


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Serve files from the script's directory; suppress access logs."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def log_message(self, fmt, *args):
        # Only show errors
        if args and len(args) >= 2 and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


def open_browser(port):
    url = f'http://localhost:{port}'
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main():
    print('=' * 50)
    print('  Scrabble Word Solver')
    print('=' * 50)

    download_word_list()

    # Allow address reuse so quick restarts work
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(('', PORT), QuietHandler) as httpd:
        url = f'http://localhost:{PORT}'
        print(f'\n  Serving at {url}')
        print('  Press Ctrl+C to stop.\n')

        # Open browser after a short delay
        threading.Timer(0.8, open_browser, args=(PORT,)).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n  Server stopped.')
            sys.exit(0)


if __name__ == '__main__':
    main()
