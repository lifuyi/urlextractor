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

### 5. 创建 Python 虚拟环境（用于 Scrapling 备用方案）

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install scrapling html2text curl_cffi playwright
playwright install chromium
```

### 6. 上传脚本

把 `wechat-fetcher.ts` 和 `scrapling_fetch.py` 上传到 `~/wechat-fetcher/` 目录。

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



const DEFAULT_PORT = 3456



interface Args {

  url: string;

  output?: string;

  outputDir?: string;

  timeout?: number;

  server?: boolean;

  port?: number;

}



function parseArgs(): Args {

  const args = process.argv.slice(2)

  let url = ""

  let output: string | undefined

  let outputDir: string | undefined

  let timeout = 30000

  let server = false

  let port = DEFAULT_PORT



  for (let i = 0; i < args.length; i++) {

    const arg = args[i]

    if (arg === "-o" && args[i + 1]) {

      output = args[++i]

    } else if (arg === "--output-dir" && args[i + 1]) {

      outputDir = args[++i]

    } else if (arg === "--timeout" && args[i + 1]) {

      timeout = parseInt(args[++i])

    } else if (arg === "--server") {

      server = true

    } else if (arg === "--port" && args[i + 1]) {

      port = parseInt(args[++i])

    } else if (!arg.startsWith("--")) {

      url = arg

    }

  }



  if (server) {

    return { url: "", server, port }

  }



  if (!url) {

    console.error("用法: wechat-fetcher <url> [-o output.md] [--output-dir dir] [--server] [--port 3456]")

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

    console.log("Defuddle 失败，使用 Scrapling + html2text 备用...")

    

    // Use Python scrapling script as fallback

    const pythonScript = `${import.meta.dir}/scrapling_fetch.py`

    const { stdout } = await Bun.spawn({

      cmd: [pythonScript, url],

      env: { ...process.env },

    })

    

    if (stdout) {

      return new TextDecoder().decode(stdout)

    }

    

    throw new Error("Scrapling 转换失败")

  }

}



async function fetchUrl(targetUrl: string, timeout: number): Promise<{ markdown: string; slug: string }> {

  const html = await fetchWithChrome(targetUrl, timeout)

  console.log("HTML 获取成功，转换为 Markdown...")

  

  const markdown = await htmlToMarkdown(html, targetUrl)

  const slug = generateSlug(targetUrl)

  

  return { markdown, slug }

}



async function main() {

  const args = parseArgs()

  

  if (args.server) {

    // Server mode

    const port = args.port || DEFAULT_PORT

    console.log(`启动服务器在 http://localhost:${port}`)

    

    Bun.serve({

      port,

      fetch(req) {

        const url = new URL(req.url)

        

        if (url.pathname === "/fetch" && req.method === "POST") {

          return req.json().then(async (body) => {

            try {

              const targetUrl = body.url

              if (!targetUrl) {

                return new Response(JSON.stringify({ error: "缺少 URL" }), {

                  status: 400,

                  headers: { "Content-Type": "application/json" }

                })

              }

              

              let fullUrl = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`

              console.log(`抓取: ${fullUrl}`)

              

              const { markdown, slug } = await fetchUrl(fullUrl, 30000)

              

              const frontmatter = `---

url: ${fullUrl}

captured_at: ${new Date().toISOString()}



---



`

              const fullContent = frontmatter + markdown

              

              return new Response(JSON.stringify({ 

                content: fullContent, 

                filename: `${slug}.md`,

                url: fullUrl 

              }), {

                headers: { "Content-Type": "application/json" }

              })

            } catch (err: any) {

              return new Response(JSON.stringify({ error: err.message }), {

                status: 500,

                headers: { "Content-Type": "application/json" }

              })

            }

          })

        }

        

        // CORS preflight

        if (req.method === "OPTIONS") {

          return new Response(null, {

            headers: {

              "Access-Control-Allow-Origin": "*",

              "Access-Control-Allow-Methods": "POST, OPTIONS",

              "Access-Control-Allow-Headers": "Content-Type"

            }

          })

        }

        

        return new Response("WeChat Fetcher Server running. POST to /fetch with { url: '...' }", {

          headers: { "Content-Type": "text/plain" }

        })

      }

    })

    return

  }

  

  // CLI mode

  const { url, output, outputDir, timeout } = args

  

  let targetUrl = url.startsWith("http") ? url : `https://${url}`

  console.log(`抓取: ${targetUrl}`)

  

  const { markdown, slug } = await fetchUrl(targetUrl, timeout)

  

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
