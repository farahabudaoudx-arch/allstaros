# Release and Customer Update Runbook

## Branch policy

The approved workflow for product features is:

`feature/<name> -> QA / approval -> dev -> All Star live -> immutable customer release`

Examples already established:

- `feature/gateway`
- `feature/scorecards`
- `feature/whitelabel`

Feature branches are safe places for review and experimentation. They must not be treated as approved customer releases merely because they exist.

Another developer may perform the synchronization/merge into `dev` after approval. The feature owner should not bypass that gate by pushing directly to `dev` or `main`.

## Release creation

A customer release is identified by an exact 40-character Git commit SHA.

Release creation must record:

- source SHA;
- customer migration/schema release;
- package checksum;
- QA status;
- release approval;
- known-good rollback SHA.

Customer deployment must never mean "deploy whatever is currently at the head of main/dev".

## Customer rollout order

The intended rollout sequence is:

1. Build the change on `feature/<name>`.
2. Complete feature QA and obtain approval.
3. Synchronize the approved feature into `dev`.
4. Test the integrated `dev` state.
5. Release the approved integrated state to live All Star.
6. Freeze the exact approved source SHA as a customer release.
7. Apply customer-safe SQL required by that release.
8. Deploy that exact SHA to selected customer projects.
9. Run customer health checks.
10. Record the result in the Control Plane audit/update ledger.

Customer rollout does not trigger deployment to other customers or to All Star.

## SQL policy

- customer SQL is additive whenever possible;
- Control Plane schema never runs inside customer databases;
- migration target must be explicitly identified;
- protected All Star Preview/Production refs must be configured before remote customer mutation is allowed;
- unknown or unprotected target configuration fails closed.

## Rollback

Every rollout keeps a known-good installed SHA.

If application deployment fails after SQL has already advanced, recovery must use the release's documented compatibility path. Do not blindly roll the database backward.

The update record must show:

- attempted release;
- previous release;
- deployment result;
- schema result;
- recovery action, if any;
- operator.

## Update demonstration milestone

The client requested that the first real update demonstration use a subsequent feature after the initial customer copy is accepted.

Therefore, do not invent a throwaway product feature solely to mark this milestone complete. When the next client feature is ready:

1. customer remains on Release A;
2. feature goes through the normal feature/QA/dev/All Star flow;
3. freeze Release B;
4. roll Release B only to the disposable/test customer;
5. prove the customer changed;
6. prove the customer rollout did not deploy or mutate All Star;
7. capture the update audit record.
