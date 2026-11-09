# Reemplaza ESTE_TOKEN por el JWT obtenido tras iniciar sesión
$TOKEN = "ESTE_TOKEN"
$CODIGO_ARTICULO = "ART-001"
$URL = "http://localhost:3001/orders"

Write-Host "Iniciando 10 solicitudes de compra concurrentes..." -ForegroundColor Yellow

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $TOKEN"
}

$body = @{
    cliente = "Tester-QA"
    codigoArticulo = $CODIGO_ARTICULO
    cantidad = 1
} | ConvertTo-Json

# Dispara 10 peticiones asincrónicas en paralelo
1..10 | ForEach-Object {
    Start-Job -ScriptBlock {
        param($url, $headers, $body)
        Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body
    } -ArgumentList $URL, $headers, $body
} | Out-Null

Get-Job | Wait-Job | Receive-Job
Get-Job | Remove-Job

Write-Host "Prueba finalizada. Verifica que el stock en la BD no sea negativo." -ForegroundColor Green