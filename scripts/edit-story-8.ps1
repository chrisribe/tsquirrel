$ErrorActionPreference = 'Stop'
$token = (Select-String -Path .env -Pattern 'HERMES_API_KEY=(.+)').Matches.Groups[1].Value.Trim()
$h = @{ Authorization = "Bearer $token" }
$base = 'http://localhost:3000/api/v1'
$id = 8

$title = @'
Altman Taps the Brakes -- Right After Declaring the Singularity Arrived
'@.Trim()

$summary = @'
OpenAI's Sam Altman spent the week talking like a man who has seen the finish line -- declaring that AI has reached "its singularity moment" and musing that the technology may already make a better CEO of OpenAI than he does. Then came the turn: after what he called "the first security incident that I have felt very viscerally," Altman signaled he is ready to decelerate. The whiplash is the story. Silicon Valley's loudest accelerationist is reaching for the brakes at the exact moment he insists the car has never gone faster, and the gap between his cosmic optimism and his sudden caution is where the real questions about AI's next year live.
'@.Trim()

$take = @'
The man who spent years shouting "faster" just found the brake pedal -- funny what a scare you feel "viscerally" will do.
'@.Trim()

$payload = @{
  title         = $title
  summary       = $summary
  squirrel_take = $take
  category      = "Technology"
  tags          = @("openai","sam-altman","ai-safety","singularity","agi")
}
$body = $payload | ConvertTo-Json

$patched = Invoke-RestMethod -Method Patch -Uri "$base/stories/$id" -Headers $h -ContentType 'application/json' -Body $body

Write-Host "=== UPDATED STORY $id ===" -ForegroundColor Green
Write-Host "TITLE:    $($patched.story.title)"
Write-Host "CATEGORY: $($patched.story.category)"
Write-Host "TAGS:     $($patched.story.tags -join ', ')"
Write-Host "TAKE:     $($patched.story.squirrel_take)"
Write-Host ""
Write-Host "SUMMARY:"
Write-Host $patched.story.summary
