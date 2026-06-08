# Public Hosting for Local Development

This guide exposes the local Math3D web app through a temporary public HTTPS
URL using [localhost.run](https://localhost.run/).

The public link remains active only while Math3D and the SSH tunnel are
running. Anyone with the link can access the app.

## Requirements

- Node.js 24 or newer
- Installed project dependencies
- OpenSSH client (`ssh`)

On Windows, confirm SSH is available:

```powershell
ssh -V
```

## 1. Start the Worker Proxy

From the repository root:

```powershell
node apps/web/server/worker-proxy.cjs
```

Keep this terminal open. The proxy listens on `http://127.0.0.1:8787`.

## 2. Create a Temporary Public Tunnel

Open another terminal from the repository root:

```powershell
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:127.0.0.1:5174 nokey@localhost.run
```

Keep this terminal open. The output will contain a public URL similar to:

```text
https://example123.lhr.life
```

Copy only the hostname, without `https://`. For the example above, the
hostname is:

```text
example123.lhr.life
```

## 3. Start Math3D with the Public Host Allowed

Open another PowerShell terminal from the repository root. Replace the example
hostname with the hostname generated in step 2:

```powershell
$env:MATH3D_PUBLIC_HOSTS = "example123.lhr.life"
npm --prefix renderer run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Math3D runs locally at:

```text
http://127.0.0.1:5174
```

It is also available through the temporary HTTPS URL from step 2:

```text
https://example123.lhr.life
```

Multiple public hostnames can be allowed as a comma-separated list:

```powershell
$env:MATH3D_PUBLIC_HOSTS = "first.example.com,second.example.com"
```

## 4. Verify the Public Link

Open the generated HTTPS URL in a browser. Confirm that:

1. The Math3D interface loads.
2. The browser reports an HTTPS connection.
3. Basic viewer interactions work.
4. Worker-backed actions work when the worker proxy is running.

## 5. Stop Public Access

Stop the SSH tunnel with `Ctrl+C`. The public URL should immediately stop
working.

Stop the Math3D server and worker proxy with `Ctrl+C` in their terminals.

Clear the temporary environment setting if needed:

```powershell
Remove-Item Env:MATH3D_PUBLIC_HOSTS
```

## Troubleshooting

### Public URL returns HTTP 403

The generated hostname was not included in `MATH3D_PUBLIC_HOSTS`. Stop and
restart the Math3D development server after setting the correct hostname.

### Public URL does not connect

Confirm that:

- Math3D is listening on port `5174`.
- The SSH tunnel terminal is still running.
- The tunnel forwards to `127.0.0.1:5174`.

### Worker-backed operations fail

Confirm that the worker proxy is running on port `8787`. The Vite development
server proxies `/api/worker` requests to it.

## Security Notes

- Treat the generated URL as public.
- Do not expose private data, credentials, or production secrets.
- Use this setup only for temporary development previews.
- Stop the SSH tunnel when sharing is no longer needed.
