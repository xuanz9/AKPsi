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
| Pledge trainer | t1@akpsi.demo | Jamie Wilson |

These are fictional accounts intended for local testing.

## Workflow

- Pledges choose a brother, offer 1–3 future time slots, specify a duration and meeting place or video link, and send an in-app invitation.
- Brothers are directory contacts, with no sign-in or workspace. Pledges send email using their own Outlook account and record the agreed proposed time after a brother replies.
- Pledges and their trainer see the confirmed interview. Conflicting accepted interviews for either person are blocked.
- After the scheduled end time, only the pledge trainer can confirm completion.
- Pledges can cancel pending or accepted invitations. They can send a new invitation after a cancellation or decline.
- Pledge trainers can view all interviews and member progress, filter by pledge or status, inspect activity, and export filtered records as CSV. They confirm interview completion after its scheduled end.
- The chapter dashboard shows completed unique pledge–brother connections. This is not a configured interview requirement.

Dates are stored in UTC and displayed in each viewer’s browser timezone. Invitations are saved inside the app; pledges review and send emails using the Outlook compose link. Replies are recorded manually. Signed-in views refresh every 30 seconds and have a manual refresh button.

## Storage and access

Data persists in `.local/scheduler.json`, excluded from Git. Passwords are salted and hashed with scrypt. Server-side session cookies and role checks enforce access; changing a role in the browser cannot grant permissions. Sessions expire after eight hours and are invalidated when the server restarts. Writes are serialized and saved through an atomic file replacement.

The server binds only to localhost. This demo uses known sample passwords and a local JSON store. Before a real chapter rollout, use verified member identities (e.g. school SSO), a durable hosted database, HTTPS with secure cookies, backups, and production session storage. There is no roster administration or notification integration yet.

The previous interview practice app is preserved under `archive/interview-practice/`, with its question data still in `data/questions.mjs`. It is not part of the active app. The scheduler does not start or contact Ollama.

## Imported brother directory

This checkout can import profiles from the `Brother Interview Sheet` tab of a local workbook. The original workbook is read-only. Extract it with a Python environment containing `openpyxl`:

```sh
python3 scripts/extract-brothers.py '/path/to/Pledge Database Fall 26.xlsx' .local/brother-roster.json
```

Restart the app after extraction. Brother profiles merge by normalized email, with stable IDs; sample brother profiles are archived from the directory while their existing interviews remain intact. Pledge and trainer roles are unchanged. Leadership text does not grant trainer access.

The directory includes contact email, LinkedIn, education, leadership, internships, interests, and weekday availability. Availability remains source text, not bookable slots; Excel date-typed availability is flagged for confirmation. These notes have no established timezone and are not automatically enforced against proposed times.

Brother profiles cannot sign in, including historical sample brothers. Pledges can edit their own profile information; saving their contact email updates their sign-in address. The real roster and local database remain under ignored `.local/`; do not commit them or the original workbook to GitHub.
