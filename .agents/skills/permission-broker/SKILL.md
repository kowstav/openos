---
name: permission-broker
description: Issue and enforce scoped, expiring, revocable permission grants bound to user, app, and action.
---
# Permission broker
## Model
A grant binds {userId, appId, action, scope, expiresAt, revoked}. One camera approval ≠ indefinite camera access; default scope is single-use, default TTL 5 minutes.
## Workflow
1. App requests an action; broker checks the always-deny list first (shell, credentials, wide filesystem can never be granted).
2. User approves in a trusted OpenOS surface; broker issues the grant.
3. Execution path calls checkGrant before doing work; single-use grants are consumed after one success.
4. Users can revoke anytime; revoked/expired/foreign grants deny with a plain-language reason.
## Rules
- The AI model may request, never issue or honor, grants. Enforcement is deterministic backend code.
- Cross-user and cross-app grant use is a hard deny.
## Verification
Tests cover: unknown grant, expired grant, revoked grant, wrong user, wrong app, wrong action, single-use consumption.
## Example
Generated Markdown app: Run click → grant(execute, single-use) → execute → grant consumed.
