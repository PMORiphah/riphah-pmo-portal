# Putting the demo online: step by step

You need two files, both in `portfolio-demo/dist/`:
- `index.html`: the whole demo in one file, about 6 MB;
- `vercel.json`: settings that stop other sites from showing the demo inside their own pages.

The demo opens only at **capital-projects-portal-demo.vercel.app** (and that project's own preview
addresses). Use exactly that project name, or the demo will show "runs only at its own address".

> Use your **personal** Vercel account (the "Hobby" scope), not your work team: preview addresses
> include the team's name.

---

## A. Upload to Vercel without installing anything (GitHub + Vercel, about 10 minutes)

**1. Put the two files in a private GitHub repository**
1. Go to **github.com** and sign in.
2. Top right, **+** → **New repository**.
3. Repository name: `capital-projects-portal-demo`.
4. Choose **Private**. Leave everything else as it is. Press **Create repository**.
5. On the next page, click the link **uploading an existing file**.
6. Drag `index.html` and `vercel.json` from `portfolio-demo/dist/` into the box.
7. Press **Commit changes**.

**2. Connect the repository to Vercel**
1. Go to **vercel.com** and sign in. Check the name top left: it must be your personal account, not your
   work team. If not, click the name and switch.
2. Press **Add New…** → **Project**.
3. Under **Import Git Repository**, press **Continue with GitHub** (only the first time) and allow
   Vercel to see the `capital-projects-portal-demo` repository. Choose **Only select repositories**,
   then that one.
4. Next to `capital-projects-portal-demo`, press **Import**.
5. **Project Name:** `capital-projects-portal-demo` (no organisation name in it).
6. **Framework Preset:** **Other**. Leave Build and Output Settings empty.
7. Press **Deploy**. After about 30 seconds you see "Congratulations".

**3. Check the address**
1. Press **Continue to Dashboard**. Under **Domains** you should see `capital-projects-portal-demo.vercel.app`.
2. Open it. You should see the start screen ("Run a capital projects portfolio…").

If Vercel gave a different address (for example because the name was taken), tell me the address and
I will add it to the demo's allowed list.

**4. Updating the demo later**
Upload the new `index.html` to the same GitHub repository: open the repository, **Add file** →
**Upload files**, then **Commit changes**. Vercel publishes it by itself within a minute.

---

## B. Or from a terminal (if Node.js is installed)

```
cd portfolio-demo/dist
npx vercel@latest login
npx vercel@latest deploy --prod
```

Answer the questions:
- "Set up and deploy?" **yes**.
- Scope: your **personal** account.
- "Link to existing project?" **no**.
- Project name: `capital-projects-portal-demo`.
- "In which directory is your code located?" press Enter.

To update later, run `npx vercel@latest deploy --prod` again in the same folder.

---

## C. Analytics (who used the demo, and how)

1. Sign up at **https://eu.posthog.com/signup** (EU region, free).
2. Create a project called `Capital Projects Portal demo`.
3. **Settings → Project → IP data capture:** switch on **Discard client IP data**.
4. **Settings → Project → General:** copy the **Project API key**. It starts with `phc_`.
5. Send me the key. I build the final `index.html` with it and test that sample events arrive in
   your PostHog. Then upload that file as in A.4.

Details (what is recorded, why it is anonymous) are in `ANALYTICS.md`.

## D. Opening your stats report

1. Go to **https://eu.posthog.com** and sign in.
2. The first time: open **SQL** in the left menu. Paste each query from section 5 of `ANALYTICS.md`
   and press **Run**. Press **Save as insight**, then **Add to dashboard**. Create a dashboard
   called **Demo visits** the first time, and choose it after that.
3. After that, open it any day from **Dashboards → Demo visits**. Only people you invite to your
   PostHog account can see it.
4. To see one visitor's whole visit, copy a `visit` id from "Recent visits" into the "One visit's
   full timeline" query.

## E. Links with a source tag

Always share the link with `?src=` at the end, so the report shows where visitors came from:

| Where | Link |
|---|---|
| Upwork | `https://capital-projects-portal-demo.vercel.app/?src=upwork` |
| Fiverr | `https://capital-projects-portal-demo.vercel.app/?src=fiverr` |
| LinkedIn | `https://capital-projects-portal-demo.vercel.app/?src=linkedin` |
| One client | `https://capital-projects-portal-demo.vercel.app/?src=client-name` |

To open the demo straight in a role, add the role too (this skips the start screen):
- senior management: `&role=guest`;
- project manager: `&role=pm`;
- PMO admin: `&role=pmo`.

For example: `https://capital-projects-portal-demo.vercel.app/?src=upwork&role=guest`.

## F. Screenshots for your portfolio

All screenshots are in `portfolio-demo/screenshots/`:
- `cover-1600x1200.png`: the portfolio cover;
- `desktop-1-dashboard.png` … `desktop-6-guided-tour.png`: dashboard, project detail, proposal
  checks, cash flow, monthly report, and the guided tour;
- `phone-1-dashboard.png`, `phone-2-project-wbs.png`.

## G. Good to know

- Everything a visitor changes stays in their own browser. Every visitor starts from the same
  fictional data, and **Reset demo** puts it back.
- The demo is hidden from search engines (`noindex`). Visitors arrive through your links.
- It works only at its own address and refuses to run inside another site's page.
- Copying the file is still technically possible (no web page can prevent that). The copyright
  notice and terms are in the file and on the start screen.
