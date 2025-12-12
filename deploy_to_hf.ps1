# NBA Legend Simulator - 部署到 Hugging Face Space
# 使用方法: .\deploy_to_hf.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "NBA Legend Simulator - 部署到 HuggingFace" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 切换到项目目录
$projectDir = "C:\Users\lwy\Work\NBA"
Set-Location $projectDir

# 检查网络连接
Write-Host "正在检查网络连接..." -ForegroundColor Yellow
$testConnection = Test-NetConnection huggingface.co -Port 443 -WarningAction SilentlyContinue

if (-not $testConnection.TcpTestSucceeded) {
    Write-Host "❌ 无法连接到 huggingface.co" -ForegroundColor Red
    Write-Host ""
    Write-Host "可能的解决方案：" -ForegroundColor Yellow
    Write-Host "1. 检查防火墙设置" -ForegroundColor White
    Write-Host "2. 配置代理（如果需要）：" -ForegroundColor White
    Write-Host "   `$env:HTTP_PROXY = 'http://proxy:port'" -ForegroundColor Gray
    Write-Host "   `$env:HTTPS_PROXY = 'http://proxy:port'" -ForegroundColor Gray
    Write-Host "   git config --global http.proxy http://proxy:port" -ForegroundColor Gray
    Write-Host "3. 使用VPN" -ForegroundColor White
    Write-Host "4. 使用网页界面手动上传（详见 DEPLOY_TO_HF.md）" -ForegroundColor White
    Write-Host ""
    
    $continue = Read-Host "是否继续尝试推送? (y/n)"
    if ($continue -ne 'y') {
        exit
    }
}

# 检查是否有未提交的更改
Write-Host "正在检查文件状态..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "发现未提交的更改，正在提交..." -ForegroundColor Yellow
    git add .
    git commit -m "Update for Hugging Face deployment"
}

# 推送到 Hugging Face
Write-Host ""
Write-Host "正在推送到 Hugging Face Space..." -ForegroundColor Yellow
Write-Host "Space URL: https://huggingface.co/spaces/Kurokoo/NBA_Legend_Simulator" -ForegroundColor Cyan
Write-Host ""

try {
    git push huggingface main --force
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ 部署成功！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "后续步骤：" -ForegroundColor Yellow
    Write-Host "1. 访问 Space: https://huggingface.co/spaces/Kurokoo/NBA_Legend_Simulator" -ForegroundColor White
    Write-Host "2. 在 Settings 中添加环境变量：" -ForegroundColor White
    Write-Host "   - Name: DEEPSEEK_API_KEY" -ForegroundColor Gray
    Write-Host "   - Value: 您的 DeepSeek API Key" -ForegroundColor Gray
    Write-Host "3. 等待约 2-5 分钟让 Space 构建完成" -ForegroundColor White
    Write-Host "4. 测试应用功能" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "❌ 推送失败" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "错误信息: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "请查看 DEPLOY_TO_HF.md 了解其他部署方法" -ForegroundColor Yellow
}

