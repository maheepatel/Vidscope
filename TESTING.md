# Verification — 9 September 2026

## Passed in the build environment
- Standard Next.js production build (webpack), TypeScript validation and page generation.
- Search adapter tests with controlled provider responses: YouTube and five other source categories, pagination, deduplication and partial rate-limit failure.
- Source filtering, descending and ascending metric ordering, missing values last and zero preserved.
- Input validation, invalid origin rejection, missing-key handling, and ignoring browser-supplied keys.
- Export preserves the established list UI and contains a lockfile, blank key template and deployment instructions.

## Not verified
- Live YouTube/Brave responses with your keys: credentials were not supplied to this environment.
- Live thumbnail loading, cross-platform metric availability, or external playback.
- Vercel deployment: this download has not been deployed to your Vercel account.
- Browser interaction in this exported Next.js build: the available preview runner expects Vite flags and could not start this Next.js project. The earlier browser checks applied to the prior Sites version, not this export.
- Clean dependency download: an offline npm ci attempt could not finish because a package was absent from the environment cache. The successful build used the existing installed dependency set. Run npm ci with internet access as instructed.

Do not interpret these checks as complete end-to-end acceptance. Use npm run test:live and the README browser checklist after adding your keys.
