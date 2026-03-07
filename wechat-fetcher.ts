#!/usr/bin/env bun

const DEFAULT_PORT = 3456
const DEFAULT_TIMEOUT = 30000
const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*']

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    
    const hostname = parsed.hostname.toLowerCase()
    
    // Block localhost
    if (hostname === 'localhost') return false
    
    // Block IPv4 private ranges
    if (/^127\./.test(hostname)) return false
    if (/^10\./.test(hostname)) return false
    if (/^192\.168\./.test(hostname)) return false
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) return false
    
    // Block IPv6 localhost
    if (hostname === '::1' || hostname === '[::1]') return false
    
    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254') return false
    if (hostname === 'metadata.google.internal') return false
    if (hostname === 'instance-data') return false
    
    return true
  } catch {
    return false
  }
}

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
      const parsed = parseInt(args[++i], 10)
      timeout = isNaN(parsed) || parsed <= 0 ? DEFAULT_TIMEOUT : parsed
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
  } catch (err) {
    console.error("Failed to parse URL for slug generation:", err)
  }
  return `article-${Date.now()}`
}

async function fetchWithChrome(url: string, timeout: number): Promise<string> {
  let browser
  try {
    const { chromium } = await import("playwright")
    
    console.log("启动 Chrome...")
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    })
    
    const page = await browser.newPage()
    
    console.log(`正在加载: ${url}`)
    await page.goto(url, { waitUntil: "networkidle", timeout })
    
    const content = await page.content()
    return content
  } catch (err) {
    console.error("Playwright error:", err)
    throw new Error(`Failed to fetch page: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

async function htmlToMarkdown(html: string, url: string): Promise<string> {
  try {
    const { JSDOM } = await import("jsdom")
    const { default: Defuddle } = await import("defuddle")
    const { default: TurndownService } = await import("turndown")
    
    const dom = new JSDOM(html, { url })
    const defuddle = new Defuddle(dom.window.document, { url })
    const result = await defuddle.parseAsync()
    
    // Convert extracted HTML to Markdown using turndown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    })
    const markdown = turndownService.turndown(result.content || "")
    
    return markdown
  } catch (err) {
    console.error("Defuddle error:", err)
    console.log("Defuddle 失败，使用 Scrapling + html2text 备用...")
    
    // Validate URL before passing to subprocess
    if (!isValidUrl(url)) {
      throw new Error("Invalid URL for fallback extraction")
    }
    
    // Use Python scrapling script as fallback
    const pythonScript = `${import.meta.dir}/scrapling_fetch.py`
    const venvPython = `${import.meta.dir}/.venv/bin/python`
    const proc = Bun.spawn({
      cmd: [venvPython, pythonScript, url],
      env: { ...process.env },
      timeout: 60000, // 60 second timeout
      stderr: "pipe",
    })
    
    // Read stdout and stderr concurrently
    const [stdoutResult, stderrResult, exitCode] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      proc.stderr ? Bun.readableStreamToText(proc.stderr) : Promise.resolve(""),
      proc.exited,
    ])
    
    if (exitCode !== 0) {
      console.error("Python fallback stderr:", stderrResult)
      throw new Error(`Scrapling process failed with exit code ${exitCode}: ${stderrResult}`)
    }
    
    if (stdoutResult) {
      return stdoutResult
    }
    
    throw new Error("Scrapling 转换失败：无输出")
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
        
                  // Check content length
        
                  const contentLength = parseInt(req.headers.get("content-length") || "0", 10)
        
                  if (contentLength > MAX_BODY_SIZE) {
        
                    return new Response(JSON.stringify({ error: "Request body too large" }), {
        
                      status: 413,
        
                      headers: { 
        
                        "Content-Type": "application/json",
        
                        "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0]
        
                      }
        
                    })
        
                  }
        
                  
        
                  return req.json().then(async (body) => {
        
                    try {
        
                      const targetUrl = body.url
        
                      if (!targetUrl) {
        
                        return new Response(JSON.stringify({ error: "缺少 URL" }), {
        
                          status: 400,
        
                          headers: { 
        
                            "Content-Type": "application/json",
        
                            "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0]
        
                          }
        
                        })
        
                      }
        
                      
        
                      let fullUrl = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`
        
                      
        
                      // Validate URL to prevent SSRF
        
                      if (!isValidUrl(fullUrl)) {
        
                        return new Response(JSON.stringify({ error: "Invalid or blocked URL" }), {
        
                          status: 400,
        
                          headers: { 
        
                            "Content-Type": "application/json",
        
                            "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0]
        
                          }
        
                        })
        
                      }
        
                      
        
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
        
                        headers: { 
        
                          "Content-Type": "application/json",
        
                          "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0]
        
                        }
        
                      })
        
                    } catch (err: any) {
        
                      console.error("Fetch error:", err)
        
                      return new Response(JSON.stringify({ error: err.message }), {
        
                        status: 500,
        
                        headers: { 
        
                          "Content-Type": "application/json",
        
                          "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0]
        
                        }
        
                      })
        
                    }
        
                  })
        
                }
        
        // CORS preflight
        if (req.method === "OPTIONS") {
          return new Response(null, {
            headers: {
              "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type"
            }
          })
        }
        
        return new Response("WeChat Fetcher Server running. POST to /fetch with { url: '...' }", {
          headers: { 
            "Content-Type": "text/plain",
            "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0]
          }
        })
      }
    })
    return
  }
  
  // CLI mode
  const { url, output, outputDir, timeout } = args
  
  let targetUrl = url.startsWith("http") ? url : `https://${url}`
  
  // Validate URL to prevent SSRF
  if (!isValidUrl(targetUrl)) {
    console.error("错误: 无效的 URL 或被阻止的地址")
    process.exit(1)
  }
  
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
