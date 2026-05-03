# Agent 操作指南

## Git 推送规范

在 Windows 环境下执行 `git push` 前，**必须先读取系统代理设置**，自动配置给 Git 后再推送。

### 操作步骤

1. 读取 Windows 注册表中的代理配置：
   ```powershell
   Get-ItemProperty `
       -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" `
       -Name ProxyServer, ProxyEnable
   ```

2. 若 `ProxyEnable` 为 `1` 且 `ProxyServer` 有值，则配置 Git 代理：
   ```bash
   git config --global http.proxy http://<代理地址>
   git config --global https.proxy http://<代理地址>
   ```

3. 执行 `git push`

### 快捷脚本

项目中已提供 `scripts/git-push-with-proxy.ps1`，可直接运行：
```powershell
./scripts/git-push-with-proxy.ps1
```

或传递参数：
```powershell
./scripts/git-push-with-proxy.ps1 origin main
```
