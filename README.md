# AKPsi Chapter Desk

A local, persistent demo for scheduling and tracking brother interviews. No AI, API key, or paid service is required.

## Run

```sh
./scripts/start-local.sh
```

Or install Node.js 22.9+ and run `npm start`. Open http://localhost:3000. Run `npm test` for server and workflow tests.

## Sample accounts

All sample accounts use `Chapter2026!`. The sign-in screen includes an account picker.

| Role | Email | Name |
| --- | --- | --- |
| Pledge | p1@akpsi.demo | Alex Morgan |
| Pledge | p2@akpsi.demo | Jordan Lee |
| Pledge | p3@akpsi.demo | Taylor Brooks |
| Brother | b1@akpsi.demo | Sam Rivera |
| Brother | b2@akpsi.demo | Casey Chen |
| Brother | b3@akpsi.demo | Morgan Patel |
| Pledge trainer | t1@akpsi.demo | Jamie Wilson |

These are fictional accounts intended for local testing.

## Workflow

- Pledges choose a brother, offer 1–3 future time slots, specify a duration and meeting place or video link, and send an in-app invitation.
- Brothers see their received invitations, select a proposed time to accept, or decline.
- Both members see the confirmed interview. Conflicting accepted interviews for either person are blocked.
- After the scheduled end time, only the invited brother can mark the interview completed.
- Pledges can cancel pending or accepted invitations. They can send a new invitation after a cancellation or decline.
- Pledge trainers can view all interviews and member progress, filter by pledge or status, inspect activity, and export filtered records as CSV. They cannot mark interviews completed on behalf of brothers.
- The chapter dashboard shows completed unique pledge–brother connections. This is not a configured interview requirement.

Dates are stored in UTC and displayed in each viewer’s browser timezone. Invitations appear inside the app; no emails or external calendar invitations are sent. Signed-in views refresh every 30 seconds and have a manual refresh button.

## Storage and access

Data persists in `.local/scheduler.json`, excluded from Git. Passwords are salted and hashed with scrypt. Server-side session cookies and role checks enforce access; changing a role in the browser cannot grant permissions. Sessions expire after eight hours and are invalidated when the server restarts. Writes are serialized and saved through an atomic file replacement.

The server binds only to localhost. This demo uses known sample passwords and a local JSON store. Before a real chapter rollout, use verified member identities (e.g. school SSO), a durable hosted database, HTTPS with secure cookies, backups, and production session storage. There is no roster administration or notification integration yet.

The previous interview practice app is preserved under `archive/interview-practice/`, with its question data still in `data/questions.mjs`. It is not part of the active app. The scheduler does not start or contact Ollama.
