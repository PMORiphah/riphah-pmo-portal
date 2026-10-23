-- Cron job 3 for the R2 copy (part of 20261023_r2_files.sql, scheduled only after the copy was tested by hand).

-- Job 3: copy new files to R2 every 10 minutes (same auth pattern as jobs 1 and 2).
select cron.schedule('r2-copy', '*/10 * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/files',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybXhrZWNvbXFxbmd2cm15dGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDUxNzAsImV4cCI6MjA5Nzk4MTE3MH0.4MtGQqpuv9DdPOdoyKTh-RbHG9JAgTV94TJW74apAw8',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{"action":"copy"}'::jsonb,
    timeout_milliseconds := 150000
  );
$job$);

