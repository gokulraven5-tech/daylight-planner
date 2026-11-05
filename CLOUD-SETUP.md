# Turn on cloud sync

The planner works locally until you configure a Supabase project. Cloud sync uses the Supabase free tier; its limits and availability can change. Each signed-in account gets a private row protected by database row-level security.

## 1. Create a Supabase project

Create a project in Supabase and copy its **Project URL** and **publishable key** (or legacy `anon` key). These browser keys are designed to be public. Never put a `service_role` or secret key in this website.

## 2. Create the private planner table

Open the Supabase SQL Editor, paste in [`supabase-setup.sql`](./supabase-setup.sql), and run it. The table policies restrict reads and writes to the authenticated user's own rows. If you already ran an earlier version of this SQL, run the updated file again to create the private username profile table.

Each account can choose a unique, case-insensitive username using 3–20 lowercase letters, numbers, or underscores. Usernames are only readable by their owner; the app does not provide public user search or sharing.

## 3. Add the public project settings

Open [`supabase-config.js`](./supabase-config.js) and fill in the two values:

```js
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'your-publishable-key';
```

Do not use a `service_role` or secret key in this file. The publishable/anon key is safe to include in a browser app because the table's row-level security is the access control.

## 4. Set up email sign-in redirects

In Supabase Authentication settings, enable email sign-in and add the website's exact URL to the allowed redirect URLs. For local testing, add `http://localhost:8765/**`. When you publish the app, add its HTTPS URL too. Set up Supabase's email provider settings if you want to use your own mail delivery service.

## 5. Try it

Serve the site over localhost or HTTPS, refresh it, then use the cloud button and request a sign-in link. Open the link in the same browser. On the first sign-in, this browser's saved plans and to-dos are merged into your cloud account; existing cloud entries are kept too. Other devices show that account's cloud data after sign-in.

Cloud sync needs an internet connection. If a cloud request fails, the browser copy is kept and the app reports that sync did not finish. Use the planner's backup controls as an extra safety copy.

## Publish with GitHub Pages

Create a **public** GitHub repository for the website files and push this project to its `main` branch. The workflow at [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) deploys the static site automatically. In the repository settings, open **Pages** and set the build source to **GitHub Actions**. After the first successful workflow run, add the Pages URL (for example, `https://your-name.github.io/repository-name/`) to Supabase Authentication's allowed redirect URLs. Request a new sign-in link from that HTTPS site; old `localhost` links will still fail on your iPhone.

The site source and browser publishable key are public in this setup. Planner data remains in the Supabase database and is protected by its row-level security policies. Do not publish secret or service-role keys, passwords, or personal backups.
