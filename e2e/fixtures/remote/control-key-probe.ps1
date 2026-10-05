Write-Output 'ASC_REMOTE_KEY_PROBE_READY'
$key = [Console]::ReadKey($true)
Write-Output "ASC_REMOTE_KEY_$($key.Key)"
