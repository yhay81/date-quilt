[CmdletBinding()]
param(
    [switch]$Local
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute date-quilt $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) {
    throw "D1 metrics query failed with exit code $LASTEXITCODE"
}

$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) {
    throw "D1 metrics query returned no result"
}

function Get-Percent {
    param(
        [int]$Numerator,
        [int]$Denominator
    )

    if ($Denominator -eq 0) { return 0.0 }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
$Schedules = [int]$Row.schedules_created
$Shared = [int]$Row.shared_schedules
$WithResponses = [int]$Row.schedules_with_responses
$WithThree = [int]$Row.schedules_with_three_responses
$Finalized = [int]$Row.finalized

[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "date-quilt"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        schedules_created = $Schedules
        shared_schedules = $Shared
        responses = [int]$Row.responses
        schedules_with_responses = $WithResponses
        schedules_with_three_responses = $WithThree
        finalized = $Finalized
        calendar_adds = [int]$Row.calendar_adds
        repeat_organizers = [int]$Row.repeat_organizers
        returned = [int]$Row.returned
        users_7d = [int]$Row.users_7d
        schedules_7d = [int]$Row.schedules_7d
    }
    rates = [ordered]@{
        creation_percent = Get-Percent $Schedules $Users
        share_percent = Get-Percent $Shared $Schedules
        response_event_percent = Get-Percent $WithResponses $Schedules
        three_response_percent = Get-Percent $WithThree $Schedules
        finalization_percent = Get-Percent $Finalized $WithResponses
    }
} | ConvertTo-Json -Depth 4
