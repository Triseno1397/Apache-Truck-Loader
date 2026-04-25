# Apache Truck Loader

Web app for Apache Rental Group's crew to plan gear loads for 26ft Penske box trucks and 53ft semis. Vendors send gear specs in any format; the app canonicalizes everything to linear feet and shows real-time capacity utilization.

Built by Triseno Systems. Deployed at `load.apacherentalgroup.com`.

- **Project instructions:** [CLAUDE.md](CLAUDE.md)
- **Full spec:** [docs/apache-truck-loader-spec.md](docs/apache-truck-loader-spec.md)
- **Working prototype reference:** [docs/truck-load-planner.jsx](docs/truck-load-planner.jsx)

## Stack

Next.js 16 (App Router) - TypeScript strict - Tailwind CSS v4 - Supabase (Postgres + Auth + RLS) - Vercel.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in Supabase keys
npm run dev
```

Open <http://localhost:3000>.
