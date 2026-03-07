# URL Extractor

A CLI tool and server for fetching web pages and converting them to Markdown. Optimized for WeChat articles but works with any URL.

## Features

- **Dual extraction engines**: Primary using Playwright + Defuddle, fallback to Python Scrapling + html2text
- **CLI mode**: Fetch and save content from command line
- **Server mode**: HTTP API for fetching content programmatically
- **HTML UI**: Browser interface for easy content extraction
- **Chrome/Playwright**: Handles JavaScript-heavy pages and CAPTCHA protection

## Installation

### Prerequisites

- [Bun](https://bun.sh/) (JavaScript runtime)
- Python 3.x (for fallback extraction)
- Chrome/Chromium (installed automatically by Playwright)

### Setup

```bash
# Clone the repository
git clone https://github.com/lifuyi/urlextractor.git
cd urlextractor

# Install Node.js dependencies
bun install
npx playwright install chromium

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install scrapling html2text curl_cffi
```

## Usage

### CLI Mode

```bash
# Basic usage (output to terminal)
bun wechat-fetcher.ts "https://mp.weixin.qq.com/s/xxx"

# Save to file
bun wechat-fetcher.ts "https://example.com/article" -o article.md

# Save to directory (auto-named)
bun wechat-fetcher.ts "https://example.com/article" --output-dir ./articles/

# Custom timeout (default: 30s)
bun wechat-fetcher.ts "https://example.com/article" --timeout 60000
```

### Server Mode

```bash
# Start server on default port (3456)
bun wechat-fetcher.ts --server

# Custom port
bun wechat-fetcher.ts --server --port 8080
```

API endpoint:
```bash
curl -X POST http://localhost:3456/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
```

Response format:
```json
{
  "content": "---\nurl: https://example.com/article\ncaptured_at: ...\n---\n\n# Article Title\n...",
  "filename": "article-xxx.md",
  "url": "https://example.com/article"
}
```

### HTML UI

Open `url-fetcher.html` in a browser while the server is running:

```bash
# Open the file directly
open url-fetcher.html

# Or serve it
python3 -m http.server 8080
# Then open http://localhost:8080/url-fetcher.html
```

The UI provides:
- URL input field
- Markdown preview
- Auto-download of fetched content
- History of saved files (stored in localStorage)

## Output Format

All fetched content includes YAML frontmatter:

```markdown
---
url: https://example.com/article
captured_at: 2026-03-07T12:34:56.789Z
---

# Article Title

Content in Markdown format...
```

## Deployment

See deployment guides in the `docs/` directory:

- [`docs/vps-deploy.md`](docs/vps-deploy.md) - Complete VPS deployment with systemd and Nginx
- [`docs/wechat-fetcher-deploy.md`](docs/wechat-fetcher-deploy.md) - Quick deployment guide

### Quick VPS Deploy

```bash
# On your VPS
cd /opt
git clone https://github.com/lifuyi/urlextractor.git wechat-fetcher
cd wechat-fetcher
bun install
npx playwright install chromium
python3 -m venv .venv
source .venv/bin/activate
pip install scrapling html2text curl_cffi

# Create systemd service
sudo cp /dev/stdin /etc/systemd/system/wechat-fetcher.service << 'EOF'
[Unit]
Description=WeChat Article Fetcher
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wechat-fetcher
Environment=PATH=/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/root/.bun/bin/bun wechat-fetcher.ts --server --port 3456
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable wechat-fetcher
sudo systemctl start wechat-fetcher
```

## How It Works

1. **Primary extraction**: Uses Playwright to launch Chrome, load the page, and extract HTML
2. **Markdown conversion**: Uses Defuddle to convert HTML to clean Markdown
3. **Fallback extraction**: If Defuddle fails, falls back to Python Scrapling + html2text
4. **Content detection**: Tries multiple CSS selectors to find main content area

## Project Structure

```
.
├── wechat-fetcher.ts    # Main TypeScript/Bun script (CLI + Server)
├── scrapling_fetch.py   # Python fallback for HTML to Markdown
├── url-fetcher.html     # Browser UI for the fetcher
├── package.json         # Node.js dependencies
├── docs/                # Documentation
│   ├── vps-deploy.md
│   └── wechat-fetcher-deploy.md
└── .venv/               # Python virtual environment
```

## License

ISC