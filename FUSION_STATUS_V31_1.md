# SENDWAYO Fusion A+B — V31.1 candidate (staging only)

This branch is a staging/review branch, not production. It is intentionally not merged into `main` and does not trigger the production GitHub Pages deployment.

## Candidate UI
- `index.html` is the merged single-page candidate.
- Frontend GitHub Actions check: https://github.com/sendwayo-oficial/sendwayo-express/actions/runs/38051080588
- Candidate source commit: `e355dc758e301cc8f160596345d3c801bd9406a5`.

## Important limitation
This branch currently contains the candidate frontend and its static validation workflow only. The matching Firebase Functions/Firestore rules source is in the companion review package and still must be installed/deployed to project `sendwayo-express-app-101` after integration tests. Do not merge or publish this branch as a working financial application before that step.

The hosted Punto B code previously targeted Firebase project `sendwayo-express`, not `sendwayo-express-app-101`. Do not run the pre-existing Realtime Database deployment workflow on this branch or repoint production rules without a reviewed migration.

## Safety
- No production balances or records were modified.
- No account passwords were created/reset.
- No balances are imported automatically. Proposed A/B account merges use Punto A priority, never sum balances, and require review for currency/identity conflicts.
- DOP/RD$ and HTG/GDES remain separate; agent personal balances and commissions are zero; Capital is not part of this candidate.
