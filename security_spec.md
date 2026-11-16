# Firestore Security Specification (CLS WorkHub / Hospital OS)

## 1. Data Invariants
1. **Default Deny**: No path outside explicitly matched collections (`/admins/{userId}`, `/workspaces/{workspaceId}`, and its subcollections `invites`, `members`, `buckets`, `report_archives`) may ever be read or written.
2. **Verified Identity**: Every read or write requires an authenticated Firebase user with `request.auth.token.email_verified == true`.
3. **Master Gate & Instant Revocation**: Access to `buckets` and `report_archives` under `/workspaces/{workspaceId}` is granted only if the caller is the bootstrapped/listed Admin, the Workspace Owner, or holds an `Active` document at `/workspaces/{workspaceId}/members/{request.auth.uid}`. Removing or revoking that member document immediately terminates subcollection access.
4. **No Self-Assigned Privilege Escalation**: A non-admin user cannot create their own `/members/{uid}` document unless a matching `/invites/{inviteId}` document created by the Admin explicitly exists with their verified email and exact assigned `role`.
5. **Strict Key & Size Enforcement**: Every create/update verifies `keys().hasAll(...) && keys().hasOnly(...)`, strictly enforces string lengths, array sizes (`<= 1000` for buckets, `<= 500` for report archives), alphanumeric path IDs (`^[a-zA-Z0-9_-]+$`), immutable `ownerId`/`createdAt`, and server timestamps (`request.time`).
6. **Zero O(n) List Queries & Zero PII Leaks**: No blanket `allow read: if isSignedIn()` or `get()`/`exists()` inside `allow list`. Invites list queries evaluate `resource.data` directly.
7. **SOP/ISO Files on Google Drive**: Binary documents stay on Google Drive (`googleDriveFolderId`, `driveFileId`, `driveUrl`). Firestore only stores structured operational data and Drive file metadata indexes.

## 2. Dirty Dozen Adversarial Payloads (Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Read/Write**: Read `workspaces/cls-song-thuong/buckets/tasks` with `auth == null`.
2. **Unverified Email Admin Spoof**: Sign in with `email: 'ngmha.st@gmail.com'` and `email_verified: false` and try to read `/admins/uid`.
3. **Unauthorized Random Google User Read**: Authenticated verified user `stranger@gmail.com` (not invited, not member) tries `get` on `buckets/tasks`.
4. **Self-Assigned Role Escalation**: Uninvited verified user writes `/workspaces/cls-song-thuong/members/{uid}` with `role: 'Admin'`.
5. **Shadow / Ghost Field Injection**: Member creates or updates `buckets/tasks` including an extra field `isVerified: true` or `rawFileData: 'base64...'`.
6. **OwnerId Spoofing on Create**: User `uidA` creates `buckets/tasks` with `ownerId: 'uidB'`.
7. **Immortal Field Tampering on Update**: Member updates `buckets/tasks` while altering `ownerId` or `createdAt`.
8. **Client Clock Forgery**: Member writes `updatedAt` with a client-chosen timestamp instead of `request.time`.
9. **Path Variable Poisoning**: Attempt to write `/workspaces/cls-song-thuong/buckets/invalid$key!` or 500-char ID.
10. **Invalid Bucket Key Injection**: Member writes `buckets/arbitrary_unlisted_bucket` not in the allowlist.
11. **Value Type / Size Poisoning**: Member writes `items: "not-an-array"` or `updatedByName` with 500 chars into `buckets/tasks`.
12. **Blanket List Scraping**: Non-admin user issues a collection-wide `list` query on `/workspaces/cls-song-thuong/members` or `/invites`.
