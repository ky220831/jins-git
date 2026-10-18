param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)][string]$Out,
    [string]$Model = "qwen-image-3.0",
    [string]$Size = "1024*1024",
    [string]$NegativePrompt = "",
    [int]$TimeoutSec = 300,
    [switch]$NoExtend,
    [string]$Endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
)

# 适配脚本：调用阿里云百炼 Qwen-Image 原生接口生成图片。
# 仅用于设计稿出图，不属于小程序运行时。key 从环境变量读取，不写入任何文件。
$key = $env:DASHSCOPE_API_KEY
if ([string]::IsNullOrEmpty($key)) { $key = $env:CODEX_API_KEY }
if ([string]::IsNullOrEmpty($key)) {
    Write-Error "缺少 API Key：请先设置环境变量 DASHSCOPE_API_KEY 或 CODEX_API_KEY"
    exit 1
}

$body = @{
    model  = $Model
    input  = @{
        messages = @(
            @{
                role    = "user"
                content = @(@{ text = $Prompt })
            }
        )
    }
    parameters = @{
        prompt_extend = (-not $NoExtend)
        size          = $Size
        watermark     = $false
    }
}

if (-not [string]::IsNullOrEmpty($NegativePrompt)) {
    $body.parameters.negative_prompt = $NegativePrompt
}

$json = $body | ConvertTo-Json -Depth 12
Write-Host "[qwen-image] 请求中... 模型=$Model size=$Size"

try {
    $resp = Invoke-RestMethod -Uri $Endpoint -Method Post -Headers @{
        Authorization  = "Bearer $key"
        "Content-Type" = "application/json"
    } -Body $json -TimeoutSec $TimeoutSec
}
catch {
    Write-Error "请求失败：$($_.Exception.Message)"
    if ($_.ErrorDetails.Message) { Write-Error $_.ErrorDetails.Message }
    exit 1
}

$imgUrl = $resp.output.choices[0].message.content[0].image
if ([string]::IsNullOrEmpty($imgUrl)) {
    Write-Error "响应中没有图片 URL：$($resp | ConvertTo-Json -Depth 8)"
    exit 1
}

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
Invoke-WebRequest -Uri $imgUrl -OutFile $Out -TimeoutSec 300
Write-Host "[qwen-image] 已保存：$Out"
