param(
  [Parameter(Mandatory = $true)][string]$Prompt,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Size = '1024x1024',
  [string]$Model = 'black-forest-labs/FLUX.1-schnell',
  [string]$Negative = '',
  [int]$Steps = 0
)
$ErrorActionPreference = 'Stop'

if (-not $env:SF_API_KEY) {
  throw '未设置 SF_API_KEY 环境变量：请在运行前先执行 $env:SF_API_KEY = "你的key"'
}

$bodyObj = @{ model = $Model; prompt = $Prompt; image_size = $Size }
if ($Negative) { $bodyObj.negative_prompt = $Negative }
if ($Steps -gt 0) { $bodyObj.num_inference_steps = $Steps }
$body = $bodyObj | ConvertTo-Json -Compress

$r = Invoke-RestMethod -Uri 'https://api.siliconflow.cn/v1/images/generations' `
  -Method Post `
  -Headers @{ Authorization = "Bearer $env:SF_API_KEY" } `
  -ContentType 'application/json' `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))

if (-not $r.images -or -not $r.images[0].url) {
  throw ("生图接口未返回图片 URL：{0}" -f ($r | ConvertTo-Json -Depth 4 -Compress))
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("sf-" + [guid]::NewGuid().ToString('N') + ".img")
Invoke-WebRequest -Uri $r.images[0].url -OutFile $tmp

# 按真实文件头判断扩展名
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

Write-Output ("[OK] {0} | {1} bytes | seed={2} | model={3}" -f $final, (Get-Item $final).Length, $r.seed, $Model)
