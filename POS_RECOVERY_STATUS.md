# Purpose PV POS — recovery record (2026-11-18)

## Source of truth
- Repository: mohnishmexico-creator/Purpose-pv-website
- Development branch: `purpose-pos-prototype`
- Frozen source backup branch: `backup/purpose-pos-2026-11-18`
- POS frontend: `pos-prototype/public/index.html`
- POS Worker: `pos-prototype/src/index.js`
- D1 migration: `pos-prototype/migrations/0001_initial.sql`
- Deployment workflow: `.github/workflows/deploy-purpose-pos-test.yml`

## Confirmed requirements
- Preserve existing bilingual English/Spanish UI and menu.
- Shared POS access without PIN for prototype.
- Waiter selector: Antonio and Mohnish.
- Tables 1–9; food and bar orders; payment actions.
- Keep POS isolated from live Purpose PV website and reservation system.

## Recovery status
- Source code is present in GitHub.
- The previously provided `purpose-pos-test.mohnishmexico-creator.workers.dev` address returns DNS resolution errors. Do NOT describe it as working until verified.
- Cloudflare Worker deployment, D1 data, and printer integration are NOT independently verified.
- GitHub branch backup is **not** a separate repository, offsite backup, or database backup.

## Next actions
1. Create a **private** second GitHub repository and mirror all branches/tags from the original. The current ChatGPT GitHub connector cannot create repositories.
2. Configure automatic mirroring with a dedicated GitHub fine-grained token or deploy key stored as Actions secrets, not committed to source.
3. Back up Cloudflare D1 data independently; Git alone does not protect transactions.
4. Verify deployment via actual GitHub Actions logs and Cloudflare-assigned workers.dev hostname; test `/health` and POS UI.
5. Export a periodic full repository archive to an independently controlled location.
