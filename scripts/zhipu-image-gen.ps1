param(
  [Parameter(Mandatory = $true)][string]$Prompt,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Size = '768x1344',
  [string]$Model = 'cogview-3-flash'
)
$ErrorActionPreference = 'Stop'

if (-not $env:ZHIPU_API_KEY) {
  throw '未设置 ZHIPU_API_KEY 环境变量：请在运行前先执行 $env:ZHIPU_API_KEY = "你的key"'
}

$body = @{ model = $Model; prompt = $Prompt; size = $Size } | ConvertTo-Json -Compress
$r = Invoke-RestMethod -Uri 'https://open.bigmodel.cn/api/paas/v4/images/generations' `
  -Method Post `
  -Headers @{ Authorization = "Bearer $env:ZHIPU_API_KEY" } `
  -ContentType 'application/json' `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))

if (-not $r.data -or -not $r.data[0].url) {
  throw ("生图接口未返回图片 URL：{0}" -f ($r | ConvertTo-Json -Depth 4 -Compress))
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("zhipu-" + [guid]::NewGuid().ToString('N') + ".img")
Invoke-WebRequest -Uri $r.data[0].url -OutFile $tmp

# 按真实文件头判断扩展名（智谱返回的 URL 叫 .png 但内容常是 JPEG）
$bytes = [System.IO.File]::ReadAllBytes($tmp)
if ($bytes.Length -gt 3 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) {
  $ext = 'jpg'
} elseif ($bytes.Length -gt 7 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) {
  $ext = 'png'
} else {
  $ext = [System.IO.Path]::GetExtension($Out).TrimStart('.').ToLower()
  if (-not $ext) { $ext = 'png' }
}

$final = [System.IO.Path]::ChangeExtension($Out, $ext)
$dir = Split-Path $final -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
Move-Item -LiteralPath $tmp -Destination $final -Force

Write-Output ("[OK] {0} | {1} bytes | requestId={2}" -f $final, (Get-Item $final).Length, $r.request_id)
