# Alignment Contract Source Policy

Alignment contracts are structured drafts until an authorized researcher confirms them.

Minimum fields:

- `sourceRefs`: where each contract version came from, such as user input, artifact statistics, literature evidence, or AI draft.
- `assumptionRefs`: assumptions that must be reviewed before the contract becomes official.
- `decisionAuthority`: person or role allowed to confirm the contract.
- `confirmationStatus`: `draft`, `needs-data`, or `user-confirmed`.

MVP rules:

- AI may translate, summarize, organize, and point out missing information.
- AI must not mark feasibility as final when evidence is absent.
- Feasibility cells without source data should remain `unknown` or `needs-data`.
- Saving a contract records a version, but does not make it official unless a human confirmation state is present.

