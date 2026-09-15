# Constrained Sage Complex adapter (C07)

C07 adds an exact Analyze boundary without adding a text-to-Sage or text-to-shell
path. Ordinary Complex Analysis submits a normalized, validated AST and one
allowlisted operation: derivative, limit, poles, residue, or series.

The shared protocol rejects unknown fields, non-`z` variables, unsupported AST
nodes, unsupported operations, missing points/orders, oversized inputs, and malformed
outputs. `source`, `script`, Python, shell fragments, and arbitrary Sage expressions
are not protocol fields.

The adapter runs through the F05 scientific-job service and inherits source-generation
checks, cancellation, deadline, input/output, memory, and work limits. The Sage
service executes in a fresh temporary directory. The reviewed runtime policy denies
arbitrary source and shell execution, restricts filesystem use to that ephemeral
working directory, and permits only the configured Sage service transport.

Successful output is normalized before publication through F06 and records exact
SageMath engine/version provenance. A future trusted notebook is a separate product
mode and is not enabled by this adapter.
