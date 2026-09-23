# Skincare With Happy

Production-oriented skincare e-commerce starter with a separate admin area, customer authentication, MongoDB Atlas, Paystack checkout and Paystack admin transfers.

## Structure
- `frontend/` — public website, login/register, customer dashboard and separate `/admin/` dashboard.
- `backend/` — Express API, MongoDB/Mongoose models, JWT authentication, product management, Paystack payments and withdrawals.
- `frontend/images/` — products, CEO, salesperson, about and general image folders.

## MongoDB
Set `MONGODB_URI` in `backend/.env`. The supplied project `.env` contains the MongoDB Atlas connection provided for this project. Rotate the database password before production if this credential has been shared outside your private environment.

## Admin
Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `JWT_SECRET` in `backend/.env`. On startup the backend creates/updates the admin account from these environment variables.

For production, set the admin credentials and JWT secret as Vercel environment variables. Do not commit production secrets to Git.

The admin dashboard is separate from customer pages and is available at `/admin/`. It is not included in the public navigation for ordinary users, and every admin API route requires a valid admin JWT.

## Paystack
Set:
- `PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_SECRET_KEY`

The checkout flow initializes a Paystack transaction, verifies it on the backend, records the Paystack fee returned by verification, and only then marks the order as paid and reduces stock.

The admin withdrawal flow uses Paystack's bank list, account verification, transfer-recipient and transfer APIs. The application balance is calculated from verified paid orders minus recorded Paystack fees and successful withdrawals; it is not a fake wallet.

## Local development
Backend:
```bash
cd backend
npm install
npm run dev
```

Frontend:
```bash
cd frontend
npm run build
```
Then serve `frontend/dist` with your preferred static host. For local testing you can use the existing `npm run dev` script.

## Vercel deployment
Deploy `backend/` as the Vercel Node API project and `frontend/` as the Vercel static project. Configure the production environment variables in Vercel (especially `MONGODB_URI`, `JWT_SECRET`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `BACKEND_URL`, `FRONTEND_URL`, `CORS_ORIGIN`, `PAYSTACK_CALLBACK_URL`, and `PAYSTACK_WEBHOOK_URL`). The checked-in environment files are intentionally preserved unchanged; Vercel project environment variables take precedence in production. The frontend build reads `VITE_API_BASE_URL` from the Vercel environment and has no hard-coded localhost API URL.

The backend has no production localhost fallback. Production URLs must be supplied through Vercel environment variables.

## Payment and Admin Wallet

Customer payments are initialized and verified through the configured Paystack merchant account. Paystack is the payment processor, so the customer's full checkout amount does not literally enter the website database wallet first. After Paystack confirms a successful transaction, the admin dashboard records the gross sale, the actual Paystack fee returned by Paystack, and the net store amount. The dashboard's available wallet balance is the net store ledger minus successful withdrawals.

This setup allows the business owner to receive money to a normal Nigerian bank account through an admin withdrawal even if the business owner does not have a separate Paystack merchant account. The configured Paystack account must be enabled for transfers, and the admin should use the bank-account verification step before withdrawing.

Paystack fees are recorded from the actual `fees` value returned by Paystack; the application does not invent a fixed fee percentage.

## Environment files

- `backend/.env` — private backend secrets and MongoDB/Paystack configuration.
- `backend/.env.sample` — safe backend template.
- `frontend/.env` — public frontend API configuration only.
- `frontend/.env.sample` — safe frontend template.
- `app/.env` and `app/.env.sample` — retained for the legacy Flask module.

Never put `PAYSTACK_SECRET_KEY`, MongoDB passwords, or JWT secrets in frontend code.

## Footer credit

Public, customer, account, and admin pages include the requested footer credit: **Build and Designs by SP World Tech.**
