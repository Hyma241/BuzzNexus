# BuzzNexus — Fresh Supabase setup

## Do you need 6 tabs (+ button)?

**No.** Use **one** SQL Editor tab.

For each step below:
1. Open the file on your PC
2. Copy **all** of it
3. Paste into SQL Editor (replace what was there)
4. Click **Run**
5. Wait for green success
6. Repeat for the next file

You can click **+** for a new tab each time if you prefer — it works the same. **One tab is easier.**

---

## Run these **6 times** (in this exact order)

| Step | File | What it does |
|------|------|----------------|
| **0** | `migration_00_reset.sql` | Deletes all old tables/data |
| **1** | `schema.sql` | Creates base database |
| **2** | `migration_v2.sql` | Buzzer + v2 features |
| **3** | `migration_v3.sql` | Gameplay + realtime |
| **4** | `migration_v3_finish.sql` | Finishes v3 (safe to run) |
| **5** | `migration_v4_delete_fix.sql` | Quiz/arena delete fix |
| **6** | `migration_v5_profiles.sql` | Profile rows after reset (quiz save) |

**Do NOT run:** `migration_v3_hotfix_submit.sql` (already covered by steps 4–5).

---

## After SQL

1. Log out and log in on BuzzNexus (your login still exists; profile is recreated).
2. Create a new arena and quiz from the dashboard.
3. Old arenas/quizzes are gone — that is expected.

---

## Folder path

`c:\Users\userd\Downloads\BuzzNexus_v2_Complete\buzznexus\`
