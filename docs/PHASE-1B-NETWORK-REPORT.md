# HANSAN — Phase 1B Network Diagnostic Report

## DNS result
- `nslookup aws-0-ap-southeast-1.pooler.supabase.com` resolved successfully.
- The target host resolves to the expected AWS ELB endpoint in the Asia Pacific region.
- Result: DNS is working.

## TCP 5432 result
- `Test-NetConnection aws-0-ap-southeast-1.pooler.supabase.com -Port 5432` returned `TcpTestSucceeded : True`.
- Result: TCP port 5432 is reachable from this machine.

## TCP 6543 result
- `Test-NetConnection aws-0-ap-southeast-1.pooler.supabase.com -Port 6543` returned `TcpTestSucceeded : True`.
- Result: TCP port 6543 is reachable from this machine.

## HTTPS 443 result
- `Test-NetConnection gnrpxqvdlxkqqlnoigmk.supabase.co -Port 443` returned `TcpTestSucceeded : True`.
- Result: HTTPS to the Supabase project endpoint is reachable.

## IPv4 / IPv6 resolution
- `Resolve-DnsName aws-0-ap-southeast-1.pooler.supabase.com -Type A` returned valid IPv4 A records.
- `Resolve-DnsName aws-0-ap-southeast-1.pooler.supabase.com -Type AAAA` returned an AAAA response from the AWS DNS chain with no failure.
- Result: IPv4 and IPv6 resolution are both available for the host.

## Likely failure layer
- DNS: OK
- TCP 5432: OK
- TCP 6543: OK
- HTTPS 443: OK
- This is not a DNS, ISP, general internet reachability, or firewall block on the network path from this environment.
- The remaining likely failure is on the database/service side: a database instance state, project-level access state, connection authorization issue, or a transient service health problem at the Supabase endpoint rather than a local network failure.

## Exact non-secret error
- `Error: P1001: Can't reach database server at aws-0-ap-southeast-1.pooler.supabase.com:5432`

## Recommended next action
- Confirm the actual Supabase project/instance is running and accepting connections for the copied Dashboard connection string.
- Verify the target database is not paused, disabled, or otherwise inaccessible from the project backend.
- Re-test Prisma connectivity only after the upstream Supabase project state is confirmed healthy.
- Do not change the database URL based on guesses.
- Do not switch to port 6543 as a workaround without confirming the upstream database service state, because network reachability is already proven.

Final status: `NETWORK_OK_DB_BLOCKED`
