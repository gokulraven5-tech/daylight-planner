# Accounts and multi-device sync

The planner uses Supabase email sign-in. Each account has a private planner row and a unique username. Plans and to-dos sync between devices after sign-in; signing in to an account loads that account's saved data without replacing it with another account's data.

## Existing project

The app is configured for its existing Supabase project. No database migration is needed if the `planner_data` and `planner_profiles` tables are already present. The setup SQL creates missing tables, indexes, or policies and ensures row-level security is enabled; it does not rewrite planner rows.

In Supabase Authentication settings:

1. Enable email sign-in.
2. Configure email delivery and the email link template.
3. Add the deployed site URL and local development URL to the allowed redirect URLs.

If the database tables are missing, run [`supabase-setup.sql`](./supabase-setup.sql) in the Supabase SQL editor. Row-level security restricts planner rows to their owner. The browser key in [`supabase-config.js`](./supabase-config.js) is a publishable key; never put a `service_role` or secret key in client code.

## First sign-in

On a new device, choose a planner name first. It is saved on that device and personalizes the planner; clicking the name in the header lets you change it. Sign-in is a separate step that asks only for an email address. For a new account, the current planner name is also used as the account username and saved automatically after email verification. Existing accounts keep their saved account username. Names/usernames must contain 3–20 letters, numbers, or underscores. If the account has no planner data yet and the device already has local plans, the app asks before importing them.

Planner edits are saved locally and synced to that account. UI/code deployments do not modify planner data. Use the planner's backup controls for an additional copy of your data.
