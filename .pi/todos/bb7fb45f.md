{
"id": "bb7fb45f",
"title": "Implement dashboard UI flows for auth, credentials, alarm control, and shortcuts",
"tags": [
"web",
"ui",
"dashboard"
],
"status": "open",
"created_at": "2026-06-08T16:11:30.775Z"
}

Read first:

- `INITIAL_PRD.md` User Stories
- `docs/architecture.md` sections: HTTP and RPC surface, Shortcut templates, Data model

Goal:
Build the initial TanStack Start dashboard UI using the RPC query layer.

Scope:

- Implement magic-link sign-in/session/logout UI that uses Better Auth endpoints.
- Implement credential list/create/delete/status UI.
- Implement MFA request/validate UI for credentials requiring MFA.
- Implement installation list and default installation selection UI.
- Implement basic alarm status and CRUD controls: arm away, arm home where available, disarm, toggle full.
- Implement basic device status views for door/window, climate, smart locks, and smart plugs.
- Implement shortcut export UI for Toggle Full and Choose Explicit Mode.
- Implement API token summary list and revoke action.
- Display safe error messages for auth, MFA, rate limit, Verisure upstream, and token failures.

Dependencies:

- Depends on `TODO-619fc684` for RPC client/query layer.
- Full real-data behavior depends on `TODO-532e947b` API Worker integration.

Testing/validation:

- Colocated component/route tests cover main flows with mocked query/RPC responses.
- Verify no plaintext token is displayed except immediately after export/create.
- Verify UI handles connection statuses: unchecked, connected, mfa_required, auth_failed, rate_limited, error.

Notes:

- Keep UI simple but complete. This is not a visual-design polishing task.
