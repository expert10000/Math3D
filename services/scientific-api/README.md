# Scientific operation API

Build and start the loopback service:

```text
npm run build:scientific-api
npm run start:scientific-api
```

The default origin is `http://127.0.0.1:8772`. Override the port with
`MATH3D_SCIENTIFIC_API_PORT`. The service exposes only complete descriptors
with a verified handler in `renderer/src/scientificOperationBindings.ts`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/operations` | Complete descriptors and verified binding IDs. |
| GET | `/v1/operations/:id/docs` | Descriptor generated Markdown. |
| POST | `/v1/operations/:id/execute` | Schema checked input, parameters and output. |
| GET | `/v1/workflow-nodes` | Executable node templates. |
| POST | `/v1/workflows/execute` | Sequential verified operations with prior-output references. |

Execution request:

```json
{"input":{"mesh":{"positions":[0,0,0,1,0,0,0,1,0],"indices":[0,1,2]}},"parameters":{}}
```

Post that JSON to `/v1/operations/mesh.normals.compute/execute`.
Workflow references use `{"$from":"step1"}` for a whole prior output or
`{"$from":"step1","path":"field"}` for a named output path. A connection
must satisfy the receiving operation's input schema. The service uses the
same bound operations as the application and does not provide a public
authentication layer. Keep it on loopback or put an authenticated proxy in
front of a deployment.
