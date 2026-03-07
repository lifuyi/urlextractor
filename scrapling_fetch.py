#!/usr/bin/env python3
"""Scrapling + html2text to convert HTML to Markdown"""

import sys
import argparse
from scrapling import Fetcher
import html2text


def fetch_and_convert(url: str, max_chars: int = 0) -> str:
    """Fetch URL using Scrapling and convert to Markdown using html2text"""
    
    # Use Fetcher (defaults include stealthy behavior)
    fetcher = Fetcher()
    
    # Fetch the page
    response = fetcher.get(url)
    
    # Try selectors in priority order to find main content
    selectors = [
        'article',
        'main', 
        '.post-content',
        '[class*="content"]',
        '[class*="article"]',
        '#content',
        '.rich_media_content',
        '#js_content',
    ]
    
    html_content = None
    
    for selector in selectors:
        try:
            element = response.css(selector)
            if element and element.html_content:
                html_content = element.html_content
                print(f"Found content with selector: {selector}", file=sys.stderr)
                break
        except Exception:
            continue
    
    # If no selector matched, use the whole body
    if not html_content:
        # body is bytes, decode to string with error handling
        if isinstance(response.body, bytes):
            html_content = response.body.decode('utf-8', errors='ignore')
        else:
            html_content = response.body
        print("Using full body content", file=sys.stderr)
    
    # Convert to Markdown using html2text
    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = False
    h.body_width = 0  # Don't wrap lines
    
    markdown = h.handle(html_content)
    
    # Truncate if needed
    if max_chars > 0 and len(markdown) > max_chars:
        markdown = markdown[:max_chars] + "\n\n... [truncated]"
    
    return markdown


def main():
    parser = argparse.ArgumentParser(description='Fetch URL and convert to Markdown')
    parser.add_argument('url', help='URL to fetch')
    parser.add_argument('--max-chars', type=int, default=0, help='Max characters (0 = no limit)')
    
    args = parser.parse_args()
    
    try:
        markdown = fetch_and_convert(args.url, args.max_chars)
        print(markdown)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()