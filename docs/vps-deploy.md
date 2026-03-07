# VPS 部署指南

## 环境要求

- Ubuntu 22.04+ / Debian 12+
- 2GB+ RAM（Playwright 需要内存）
- 10GB+ 磁盘空间

## 1. 连接 VPS

```bash
ssh root@your-vps-ip
```

## 2. 安装基础依赖

```bash
# 更新系统
apt update && apt upgrade -y

# 安装基本工具
apt install -y curl git python3 python3-venv python3-pip nginx

# 安装 Chrome 依赖（Playwright 需要）
apt install -y libnss3 libatk-bridge2.0-0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2
```

## 3. 安装 Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

## 4. 克隆项目

```bash
cd /opt
git clone https://github.com/lifuyi/urlextractor.git wechat-fetcher
cd wechat-fetcher
```

## 5. 安装 Node 依赖

```bash
bun install

# 安装 Playwright 浏览器
npx playwright install chromium
```

## 6. 创建 Python 虚拟环境

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install scrapling html2text curl_cffi
```

## 7. 测试运行

```bash
# 测试 CLI
bun wechat-fetcher.ts "https://mp.weixin.qq.com/s/EwVItQH4JUsONqv_Fmi4wQ"

# 测试服务器模式
bun wechat-fetcher.ts --server --port 3456
```

## 8. 配置 Systemd 服务

创建服务文件：

```bash
cat > /etc/systemd/system/wechat-fetcher.service << 'EOF'
[Unit]
Description=WeChat Article Fetcher
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wechat-fetcher
Environment=PATH=/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/root
ExecStart=/root/.bun/bin/bun wechat-fetcher.ts --server --port 3456
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

启动服务：

```bash
systemctl daemon-reload
systemctl enable wechat-fetcher
systemctl start wechat-fetcher
systemctl status wechat-fetcher
```

查看日志：

```bash
journalctl -u wechat-fetcher -f
```

## 9. 配置 Nginx 反向代理（可选）

如果你想通过域名访问，配置 Nginx：

```bash
cat > /etc/nginx/sites-available/wechat-fetcher << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/wechat-fetcher /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## 10. 配置 HTTPS（可选）

使用 Let's Encrypt：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## 11. 防火墙配置

```bash
# 允许 HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# 如果直接暴露 3456 端口
ufw allow 3456/tcp

ufw enable
```

## 12. 上传 HTML 界面

把 `url-fetcher.html` 放到 Nginx 目录：

```bash
mkdir -p /var/www/html
cp url-fetcher.html /var/www/html/index.html
```

或者直接用 Python 启动简单 HTTP 服务器：

```bash
cd /opt/wechat-fetcher
python3 -m http.server 8080 &
```

## 常用命令

```bash
# 重启服务
systemctl restart wechat-fetcher

# 查看状态
systemctl status wechat-fetcher

# 查看日志
journalctl -u wechat-fetcher -f

# 停止服务
systemctl stop wechat-fetcher
```

## 更新代码

```bash
cd /opt/wechat-fetcher
git pull
systemctl restart wechat-fetcher
```
