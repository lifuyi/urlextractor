# Docker 部署指南

使用 Docker 部署 WeChat Article Fetcher，简化环境配置和依赖管理。

## 前提条件

- Docker Engine 20.10+
- Docker Compose 2.0+

## 快速开始

### 1. 构建镜像

```bash
docker build -t wechat-fetcher .
```

构建过程可能需要 5-10 分钟，因为需要下载和安装 Playwright 浏览器。

### 2. 运行容器

#### 使用 Docker Compose（推荐）

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

#### 使用 Docker 命令

```bash
# 创建输出目录
mkdir -p output

# 运行容器
docker run -d \
  --name wechat-fetcher \
  -p 3456:3456 \
  -v $(pwd)/output:/app/output \
  --restart unless-stopped \
  wechat-fetcher
```

## 配置说明

### 环境变量

在 `docker-compose.yml` 中可以配置以下环境变量：

- `ALLOWED_ORIGINS`: CORS 允许的源，默认为 `*`（允许所有）
- `NODE_ENV`: 运行环境，默认为 `production`

### 端口映射

默认端口为 `3456`，可以在 `docker-compose.yml` 中修改：

```yaml
ports:
  - "8080:3456"  # 将主机的 8080 端口映射到容器的 3456 端口
```

### 数据持久化

输出文件默认挂载到主机的 `./output` 目录：

```yaml
volumes:
  - ./output:/app/output
```

## 使用 API

容器启动后，可以通过以下方式访问 API：

```bash
curl -X POST http://localhost:3456/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mp.weixin.qq.com/s/xxx"}'
```

## 查看日志

```bash
# Docker Compose
docker-compose logs -f

# Docker
docker logs -f wechat-fetcher
```

## 更新镜像

```bash
# 停止并删除旧容器
docker-compose down

# 重新构建
docker-compose build --no-cache

# 启动新容器
docker-compose up -d
```

## 部署到云平台

### Google Cloud Run

```bash
# 构建并推送镜像
docker build -t gcr.io/PROJECT_ID/wechat-fetcher .
docker push gcr.io/PROJECT_ID/wechat-fetcher

# 部署到 Cloud Run
gcloud run deploy wechat-fetcher \
  --image gcr.io/PROJECT_ID/wechat-fetcher \
  --platform managed \
  --region asia-east1 \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300 \
  --port 3456 \
  --allow-unauthenticated
```

### AWS ECS

```bash
# 构建并推送镜像到 ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
docker build -t wechat-fetcher .
docker tag wechat-fetcher:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/wechat-fetcher:latest
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/wechat-fetcher:latest
```

然后在 ECS 控制台创建任务定义和服务。

### 阿里云容器服务

```bash
# 构建并推送镜像到阿里云镜像仓库
docker build -t registry.cn-hangzhou.aliyuncs.com/namespace/wechat-fetcher .
docker push registry.cn-hangzhou.aliyuncs.com/namespace/wechat-fetcher
```

## 故障排查

### 容器无法启动

检查日志：
```bash
docker logs wechat-fetcher
```

常见问题：
- 端口被占用：修改 `docker-compose.yml` 中的端口映射
- 内存不足：增加 Docker 内存限制（建议至少 2GB）

### Playwright 启动失败

确保容器有足够的内存和 CPU 资源。在 `docker-compose.yml` 中调整：

```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '2'
```

### 构建镜像失败

检查网络连接，Playwright 需要下载浏览器二进制文件。可以添加构建参数：

```bash
docker build --build-arg PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 -t wechat-fetcher .
```

## 安全建议

1. **限制 CORS**: 在生产环境中设置 `ALLOWED_ORIGINS` 为你的域名
2. **使用 HTTPS**: 在反向代理（Nginx/Caddy）中配置 SSL
3. **资源限制**: 设置 CPU 和内存限制，防止资源耗尽
4. **定期更新**: 定期更新基础镜像和依赖包

## 性能优化

### 减小镜像体积

使用多阶段构建（需要修改 Dockerfile）：

```dockerfile
# 构建阶段
FROM oven/bun:1.1-debian AS builder
# ... 安装依赖

# 运行阶段
FROM oven/bun:1.1-debian-slim
# ... 只复制必要文件
```

### 使用缓存

构建时利用 Docker 缓存：

```bash
# 先复制依赖文件，利用缓存
docker build -t wechat-fetcher .
```

## 相关文档

- [VPS 部署指南](./vps-deploy.md)
- [快速部署指南](./wechat-fetcher-deploy.md)
