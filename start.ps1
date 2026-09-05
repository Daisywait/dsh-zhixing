$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $learningNode = $nodeCommand.Source }
else { throw 'Node.js 22+ is required. Install Node.js and run this script again.' }
& $learningNode (Join-Path $PSScriptRoot 'server.mjs')
