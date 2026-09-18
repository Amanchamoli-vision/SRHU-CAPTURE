# Lets other devices on your local network reach the Campus Capture API.
#
# Run once, from an *Administrator* PowerShell:
#     powershell -ExecutionPolicy Bypass -File backend\scripts\allow-lan-firewall.ps1
#
# Why it is needed: Windows Firewall blocks inbound connections to a program
# unless a rule allows it. The backend usually runs from a conda env whose
# python.exe has no such rule, so phones and laptops on the Wi-Fi are refused
# on port 8000 even once the server listens on 0.0.0.0.
#
# The rule is deliberately narrow:
#   - TCP 8000 only (the API; the frontend's port 5173 is served by Node,
#     which already has a rule)
#   - Private network profile only, so it is inert on public Wi-Fi
#   - Remote address LocalSubnet, so only devices on the same network can use it
#
# MongoDB (27017) is intentionally NOT opened. Browsers never talk to the
# database; only this backend does, on the same machine, over localhost.
#
# To undo:  Remove-NetFirewallRule -DisplayName "Campus Capture API (TCP 8000, LAN)"

$name = "Campus Capture API (TCP 8000, LAN)"

$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this from an Administrator PowerShell (right-click > Run as administrator)."
    exit 1
}

# Re-running replaces the rule rather than stacking duplicates.
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule `
    -DisplayName $name `
    -Description "Lets devices on the same private network reach the Campus Capture FastAPI backend. Local subnet only, Private profile only." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8000 `
    -Profile Private `
    -RemoteAddress LocalSubnet | Out-Null

Write-Host "Added firewall rule: $name"

$category = (Get-NetConnectionProfile | Select-Object -First 1).NetworkCategory
if ($category -ne "Private") {
    Write-Warning ("This network is marked '$category'. The rule only applies on Private " +
        "networks: Settings > Network & internet > Wi-Fi > (your network) > Private.")
}
