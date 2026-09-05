$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI, then run gh auth login first.' }
gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub login is required. Run gh auth login.' }
$account = gh api user --jq .login
if ($LASTEXITCODE -ne 0) { throw 'Unable to identify GitHub account.' }
$repository = "$account/dsh-zhixing"
gh repo view $repository --json name 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gh repo create $repository --public --source . --remote origin --push --description '知行：嵌入 DeepSeek Harness 的模型学习助手与渐构靶图'
  if ($LASTEXITCODE -ne 0) { throw 'Repository creation failed.' }
} else {
  throw 'Repository already exists. Check its contents and remote before pushing.'
}
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
git tag "v$version"
if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed.' }
git push origin "v$version"
if ($LASTEXITCODE -ne 0) { throw 'Tag push failed.' }
Write-Output "https://github.com/$repository"
