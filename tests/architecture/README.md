# Architecture Tests

Enforces layering rules via dependency-cruiser or custom scripts:

- `deny-domain-to-apps` — no `domains/*` may import `apps/*`
- `deny-domain-to-presentation` — no `domains/*` may import `apps/desktop/src/presentation`
- `deny-application-to-presentation` — no `apps/*/src/application` may import `presentation`
- `deny-foundations-to-domains` — no `foundations/*` may import `domains/*`
- `allow-domain-to-domain-ports` — domains may import `ports/` from sibling domains
