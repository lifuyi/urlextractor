# 微信公众号文章抓取工具部署指南

## 简介

使用 `baoyu-url-to-markdown` skill 的 Playwright + Defuddle 技术抓取公众号文章，保存为 Markdown。

## VPS 环境要求

- Debian / Ubuntu
- 已安装 Bun

## 安装步骤

### 1. 安装 Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### 2. 安装系统依赖

```bash
apt update && apt install -y chromium chromium-driver
```

### 3. 创建项目目录

```bash
mkdir -p ~/wechat-fetcher
cd ~/wechat-fetcher
bun init -y
```

### 4. 安装 npm 依赖

```bash
bun add playwright defuddle
npx playwright install chromium
```

### 5. 上传脚本

把 `wechat-fetcher.ts` 上传到 `~/wechat-fetcher/` 目录。

## 使用方法

```bash
cd ~/wechat-fetcher

# 基本用法（输出到终端）
bun wechat-fetcher.ts "https://mp.weixin.qq.com/s/xxx"

# 保存到指定文件
bun wechat-fetcher.ts "https://mp.weixin.qq.com/s/xxx" -o article.md

# 保存到目录（自动命名）
bun wechat-fetcher.ts "https://mp.weixin.qq.com/s/xxx" --output-dir ./articles/
```

## 脚本源码

```typescript
#!/usr/bin/env bun

const JINA_FALLBACK = "https://r.jina.ai"

interface Args {
  url: string;
  output?: string;
  outputDir?: string;
  timeout?: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let url = ""
  let output: string | undefined
  let outputDir: string | undefined
  let timeout = 30000

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "-o" && args[i + 1]) {
      output = args[++i]
    } else if (arg === "--output-dir" && args[i + 1]) {
      outputDir = args[++i]
    } else if (arg === "--timeout" && args[i + 1]) {
      timeout = parseInt(args[++i])
    } else if (!arg.startsWith("--")) {
      url = arg
    }
  }

  if (!url) {
    console.error("用法: wechat-fetcher <url> [-o output.md] [--output-dir dir]")
    process.exit(1)
  }

  return { url, output, outputDir, timeout }
}

function generateSlug(url: string): string {
  try {
    const urlObj = new URL(url)
    const path = urlObj.pathname.split("/").filter(Boolean).pop() || ""
    if (path && path.length > 3) {
      return path.slice(0, 50).replace(/[^a-zA-Z0-9-]/g, "-")
    }
  } catch {}
  return `article-${Date.now()}`
}

async function fetchWithChrome(url: string, timeout: number): Promise<string> {
  const { chromium } = await import("playwright")
  
  console.log("启动 Chrome...")
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  })
  
  const page = await browser.newPage()
  
  console.log(`正在加载: ${url}`)
  await page.goto(url, { waitUntil: "networkidle", timeout })
  
  const content = await page.content()
  await browser.close()
  
  return content
}

async function htmlToMarkdown(html: string, url: string): Promise<string> {
  try {
    const { default: { convert } } = await import("defuddle")
    const result = await convert(html, { url })
    return result
  } catch {
    console.log("Defuddle 失败，使用 Jina 备用...")
    const response = await fetch(`${JINA_FALLBACK}/${url}`, {
      headers: { Accept: "text/markdown" }
    })
    if (!response.ok) throw new Error(`Jina 失败: ${response.status}`)
    return response.text()
  }
}

async function main() {
  const { url, output, outputDir, timeout } = parseArgs()
  
  let targetUrl = url.startsWith("http") ? url : `https://${url}`
  console.log(`抓取: ${targetUrl}`)
  
  const html = await fetchWithChrome(targetUrl, timeout)
  console.log("HTML 获取成功，转换为 Markdown...")
  
  const markdown = await htmlToMarkdown(html, targetUrl)
  
  const slug = generateSlug(targetUrl)
  const frontmatter = `---
url: ${targetUrl}
captured_at: ${new Date().toISOString()}
---

`
  const fullContent = frontmatter + markdown
  
  if (output) {
    await Bun.write(output, fullContent)
    console.log(`已保存到: ${output}`)
  } else if (outputDir) {
    const dir = `${outputDir}/mp.weixin.qq.com`
    await Bun.mkdir(dir, { recursive: true })
    const filePath = `${dir}/${slug}.md`
    await Bun.write(filePath, fullContent)
    console.log(`已保存到: ${filePath}`)
  } else {
    console.log(fullContent)
  }
}

main().catch(err => {
  console.error("错误:", err.message)
  process.exit(1)
})
```
