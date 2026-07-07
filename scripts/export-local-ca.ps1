# Norton (and similar antivirus) intercepts HTTPS with its own root certificate.
# Windows trusts it but Node.js does not, so live price fetches fail with
# UNABLE_TO_VERIFY_LEAF_SIGNATURE. This script exports that root certificate to
# certs\local-ca.pem, which the app passes to Node via NODE_EXTRA_CA_CERTS.
# Re-run it (npm run export-ca) if prices stop fetching after an antivirus update.
$projectRoot = Split-Path -Parent $PSScriptRoot
$certs = @(Get-ChildItem Cert:\CurrentUser\Root, Cert:\LocalMachine\Root -ErrorAction SilentlyContinue |
  Where-Object { $_.Subject -match 'Norton|Avast|AVG|Kaspersky|ESET|Bitdefender|McAfee' } |
  Sort-Object Thumbprint -Unique)
if ($certs.Count -eq 0) {
  Write-Host "No antivirus TLS-scanning root certificate found. Nothing to export."
  exit 0
}
New-Item -ItemType Directory -Force (Join-Path $projectRoot 'certs') | Out-Null
$pem = ($certs | ForEach-Object {
  "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks') + "`n-----END CERTIFICATE-----"
}) -join "`n"
[IO.File]::WriteAllText((Join-Path $projectRoot 'certs\local-ca.pem'), $pem)
$certs | ForEach-Object { Write-Host "Exported: $($_.Subject)" }
