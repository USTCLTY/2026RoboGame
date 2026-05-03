# 读取 Windows 系统代理并配置 Git，然后推送
$settings = Get-ItemProperty `
    -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" `
    -Name ProxyServer, ProxyEnable `
    -ErrorAction SilentlyContinue

if ($settings.ProxyEnable -eq 1 -and $settings.ProxyServer) {
    $proxyUrl = "http://$($settings.ProxyServer)"
    git config --global http.proxy $proxyUrl
    git config --global https.proxy $proxyUrl
    Write-Host "[git-push] 已设置代理: $proxyUrl"
} else {
    Write-Host "[git-push] 系统代理未启用，直接推送"
}

# 传递所有参数给 git push
git push @args
