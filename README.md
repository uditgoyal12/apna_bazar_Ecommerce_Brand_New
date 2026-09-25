# Apna Bazar ? The everyday edit

A rebuilt React storefront with an Express API, MongoDB Atlas persistence and Cloudinary image storage. The application no longer uses JSON Server or localStorage for customer data, authentication, carts, wishlists or orders.

## Run locally

Use Node.js 22.12+ (verified with Node 24). From this directory:

```powershell
npm ci
npm run dev
```

- Storefront: http://localhost:3000
- API health: http://localhost:5000/api/health
- Store administration: http://localhost:3000/admin (administrator sign-in required)
- Start individually: `npm start` for Vite, `npm run api` for Express.

The existing `.env` is loaded by the server. Only the public API URL is injected into the frontend. MongoDB and Cloudinary credentials never enter the browser bundle. See `.env.example` for variable names. Vite proxies `/api` to the configured API_PORT in development.

The existing Windows DNS resolver failed Atlas SRV resolution on this machine. `DNS_SERVERS=1.1.1.1,8.8.8.8` enables working resolution for Node. This is optional on environments with working DNS.

## What is connected

- Server-authenticated signup/login/logout, bcrypt password hashes, expiring HttpOnly cookie sessions stored in MongoDB, account details and Cloudinary profile pictures.
- Live categories, product types, brands, product images, prices and stock. Search, category/brand filters, availability, sale filter, sorting and pagination run through the API.
- Persistent account-specific wishlist and cart; cart totals always use current database prices.
- Cash-on-delivery checkout, delivery addresses, order confirmation and order history. Orders and stock changes commit in one MongoDB transaction. Idempotency keys prevent duplicate orders; stock conditions prevent overselling.
- Admin product creation/editing/archiving, multi-image Cloudinary uploads, category/type/brand management, review moderation, order fulfilment/payment status, subscriber and contact-message management.
- Role-based access with Buyer, Admin, and Super Admin accounts. Super Admins can create and manage Admin, Super Admin, and Buyer accounts from the dashboard; regular Admins cannot access user or role management.
- Newsletter subscription and contact forms store submissions in MongoDB. They do not send email; no email delivery provider is configured.

The visual rebuild covers desktop and mobile home, catalog, product, login/signup, wishlist, cart, checkout, account, order history, about, contact, community and admin pages. Collections and product imagery come from the database. Static brand/editorial copy stays in React components.

## Data migration

`npm run migrate` imports the original `../server/data.json` and uploads local files from `../server/public`. It uses insert-only upserts, preserves existing target records, hashes legacy user passwords and rewrites stored image references to Cloudinary URLs. Source files are retained unchanged as the original backup. The runtime does not read them.

Completed import: 45 products (44 initially active), 4 collections (3 active), 4 product types, 9 brands, 4 reviews, 3 users, 10 cart rows, 7 historical orders, 1 wishlist row, 3 subscribers and 1 contact message. 77 distinct source images were uploaded to Cloudinary.

The default target database is `apna_bazar`; `MONGODB_DB` overrides it. Existing accounts use their original email and password, and supported Buyer, Admin, and Super Admin roles are preserved. Self-registration always creates a Buyer; browser storage cannot grant administrator privileges.

Migration caches image mappings in `server/.migration-images.json` (ignored by Git) and reuses deterministic Cloudinary public IDs. Do not run the migration against an unrelated database.

## Build and checks

```powershell
npm run build
npm run test:e2e
npm audit
```

Start both services before running browser tests. Tests require access to the configured cloud services. They create uniquely named temporary users/products, exercise actual Cloudinary uploads and database writes, and remove their own records/images afterwards. They do not place orders against real product inventory. Screenshots are in `artifacts/`; Playwright reports and failure traces are generated locally.

The suite covers responsive navigation, search/filters, product uploads/editing, buyer signup, profile/photo changes, wishlist, cart quantities and reload persistence, mobile checkout, order history, support/subscriber records, user/brand/category management, review moderation, access controls, price tampering, checkout idempotency and concurrent last-stock orders.

## Production hosting

`npm run build` writes `build/`. Express serves this build and `/api` from the same origin; set `NODE_ENV=production` and start `npm run api`. Set the externally reachable HTTPS URL in `FRONTEND_URL`, configure the platform's API port, and use `TRUST_PROXY=1` only behind a trusted single reverse proxy. Secure cookies require HTTPS in production. Keep `REACT_APP_API_URL=/api` for a same-origin deployment.

Cloud database/image services are live. The web server is currently running locally; no public hosting deployment or custom domain was configured. Online card/UPI payments, email delivery, courier tracking and automatic refunds are not advertised or simulated; those require corresponding service integrations.

## Source map

- `src/main.jsx`, `src/App.jsx`: active entry points.
- `src/storefront/`: rebuilt UI, API client and shared application state.
- `server/index.cjs`: API, permissions, validation, sessions and transactions.
- `server/config.cjs`: server-only environment and cloud configuration.
- `server/migrate.cjs`: one-way import of the original store.
- `tests/store.spec.cjs`: live browser/API verification.

Legacy React pages, Redux/Saga code, validators and template assets were removed after migration. The runtime now contains only the rebuilt storefront, API, migration utilities and automated tests.
