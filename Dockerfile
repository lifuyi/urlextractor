FROM oven/bun:1.1-debian

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install Node.js dependencies
RUN bun install --frozen-lockfile

# Install Playwright browsers
RUN npx playwright install chromium

# Create Python virtual environment
RUN python3 -m venv .venv

# Copy Python requirements and install
COPY scrapling_fetch.py ./
RUN .venv/bin/pip install scrapling html2text curl_cffi

# Copy application code
COPY wechat-fetcher.ts ./
COPY url-fetcher.html ./

# Create directory for output files
RUN mkdir -p /app/output

# Expose port
EXPOSE 3456

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3456/ || exit 1

# Set environment variables
ENV PYTHON_PATH=/app/.venv/bin/python
ENV PATH="/app/.venv/bin:$PATH"

# Start the server
CMD ["bun", "run", "wechat-fetcher.ts", "--server", "--port", "3456"]