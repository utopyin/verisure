# Verisure Context

This context describes the Cloudflare-native control surface for a user's Verisure alarm account, including credential storage, session management, alarm control, device status, and Shortcut automation.

## Language

**Verisure Upstream**:
The external Verisure system the backend authenticates with and queries to read or change alarm state. This term names the product-facing dependency as a whole, not a single code module.
_Avoid_: Verisure API

**Verisure Authentication**:
The part of Verisure Upstream concerned with logging in, refreshing sessions, MFA, trust cookies, logout, and credential connection status.
_Avoid_: Session plumbing, auth transport

**Verisure Requests**:
The part of Verisure Upstream concerned with authenticated Verisure reads and mutations such as installations, alarm state, alarm mode changes, and device status. Callers should not need to know whether these are implemented with GraphQL.
_Avoid_: GraphQL client, GraphQL service

**Verisure Transport**:
The internal low-level client for Verisure Upstream request mechanics. It owns raw HTTP requests, host failover, Verisure headers, automatic payload mapping, error parsing, and GraphQL requests built on top of the same HTTP path.
_Avoid_: Verisure Protocol, GraphQL executor
