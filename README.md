# MRM Royalty Commission Accounting

A full-stack billing and royalty commission management system built for **Music Rights Management (MRM)**. Track client royalties across IPRS, PRS, ISAMRA, ASCAP, SoundExchange, and PPL — with automated commission calculations, GST invoicing, receipt tracking, and outstanding balance management.

![Tech Stack](https://img.shields.io/badge/React-18-blue?logo=react) ![Node.js](https://img.shields.io/badge/Node.js-Express-green?logo=node.js) ![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen?logo=mongodb) ![License](https://img.shields.io/badge/License-ISC-yellow)

---

## Features

### Core Billing
- **Multi-source Royalty Tracking** — IPRS, PRS (GBP→INR conversion), SoundExchange, ISAMRA, ASCAP, PPL
- **Auto Commission Calculation** — Configurable per-client commission rates with automatic computation
- **GST & Invoice Management** — 18% GST calculation, current + previous outstanding invoicing
- **Receipt & TDS Tracking** — Monthly payment receipts and TDS deductions
- **Outstanding Balance** — Monthly and total outstanding with automatic carry-forward across months

### Client Management
- **216+ Client Database** — Client master with type, commission rate, and royalty source flags
- **Client Types** — Royalty clients, Retainer clients, In-House clients
- **Search & Filter** — Quick search across all clients by name or ID

### Reports & Analytics
- **Dashboard** — Summary of total commissions, outstanding, entries by status
- **Commission Report** — Detailed commission breakdown by client and month
- **GST & Invoice Report** — Invoice tracking with GST calculations
- **Receipts & TDS Report** — Payment and TDS summary
- **Outstanding Report** — Client-wise outstanding balances
- **Client Master** — Full client listing with status and rates
- **Export** — Data export functionality

### Auth & Security
- **JWT Authentication** — Access + refresh token system with auto-renewal
- **Role-based Access** — Admin and user roles
- **Email Verification** — New user email verification flow
- **Password Reset** — Secure password reset via email

### Financial Year
- **FY 2025-2026** — April to March financial year tracking
- **Month-wise Entry** — Individual billing entries per client per month
- **Draft/Submitted Status** — Entry lifecycle management with edit controls

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Context API, Axios |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB Atlas (Mongoose ODM) |
| **Auth** | JWT (Access + Refresh tokens), bcryptjs |
| **Email** | Nodemailer |
| **Deployment** | Vercel (Client), Render/Railway (Server) |

---

## Project Structure

```
mrm-billing/
├── client/                     # React Frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.jsx       # Login/Register/Forgot Password
│   │   │   ├── BillingForm.jsx     # Main billing entry form
│   │   │   ├── ClientPanel.jsx     # Client list sidebar
│   │   │   ├── Header.jsx          # App header with actions
│   │   │   ├── Legend.jsx          # Status legend
│   │   │   ├── Modals.jsx          # View entries, export modals
│   │   │   ├── MonthTabs.jsx       # April-March month navigation
│   │   │   ├── ReportsPanel.jsx    # Reports dashboard
│   │   │   ├── Toast.jsx           # Notification toasts
│   │   │   └── VerifyEmail.jsx     # Email verification page
│   │   ├── contexts/
│   │   │   ├── AppContext.js       # Global app state
│   │   │   └── AuthContext.js      # Authentication state
│   │   ├── hooks/
│   │   │   └── useBillingForm.js   # Billing form logic & calculations
│   │   ├── services/
│   │   │   └── api.js              # API client (Axios)
│   │   └── styles/
│   │       └── App.css             # Application styles
│   ├── .env                        # Local dev config
│   └── .env.production             # Production config
│
├── server/                     # Express Backend
│   ├── config/
│   │   └── db.js                   # MongoDB connection
│   ├── middleware/
│   │   └── auth.js                 # JWT authentication middleware
│   ├── models/
│   │   ├── Client.js               # Client schema
│   │   ├── RoyaltyAccounting.js    # Billing entry schema + calculations
│   │   ├── Settings.js             # App settings (FY, rates)
│   │   └── User.js                 # User schema
│   ├── routes/
│   │   ├── auth.js                 # Auth endpoints
│   │   ├── clients.js              # Client CRUD
│   │   ├── royaltyAccounting.js    # Billing entries + reports
│   │   └── settings.js             # Settings endpoints
│   ├── scripts/
│   │   ├── createAdminUser.js      # Create initial admin
│   │   ├── seedFromExcel.js        # Import data from Excel
│   │   └── syncClientNames.js      # Sync client names utility
│   ├── services/
│   │   └── emailService.js         # Email sending service
│   ├── utils/
│   │   └── jwt.js                  # JWT token utilities
│   └── .env                        # Server environment config
│
├── vercel.json                 # Vercel deployment config
└── package.json                # Root package with dev scripts
```

---

## Getting Started

### Prerequisites
- **Node.js** v18+
- **MongoDB Atlas** account (or local MongoDB)
- **npm** or **yarn**

### 1. Clone & Install

```bash
git clone https://github.com/your-username/mrm-billing.git
cd mrm-billing
npm run install:all
```

### 2. Configure Environment

**Server** (`server/.env`):
```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/mrm_billing?retryWrites=true&w=majority
PORT=5001
NODE_ENV=development
JWT_SECRET=your-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-different
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

**Client** (`client/.env`):
```env
REACT_APP_API_URL=http://localhost:5001/api
```

### 3. Create Admin User

```bash
cd server
npm run create-admin
```
Default credentials: `admin@mrm.com` / `Admin@123`

### 4. Run Development Server

```bash
# From root directory - starts both client & server
npm run dev
```

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5001
- **Health Check**: http://localhost:5001/api/health

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET` | `/api/clients` | List all clients |
| `POST` | `/api/clients` | Create client |
| `PUT` | `/api/clients/:id` | Update client |
| `DELETE` | `/api/clients/:id` | Delete client |
| `GET` | `/api/royalty-accounting` | Get billing entries |
| `POST` | `/api/royalty-accounting` | Create/update entry |
| `GET` | `/api/royalty-accounting/gst-report` | GST & Invoice report |
| `GET` | `/api/royalty-accounting/receipts-report` | Receipts & TDS report |
| `GET` | `/api/settings` | Get app settings |
| `PUT` | `/api/settings/:key` | Update setting |

---

## Deployment

### Client (Vercel)
The client is configured for Vercel via `vercel.json`. Set the production API URL in `client/.env.production`:
```env
REACT_APP_API_URL=https://your-backend-url.com/api
```

### Server (Render / Railway)
Deploy the `server/` directory with these environment variables:
```env
MONGODB_URI=your-mongodb-atlas-uri
PORT=5001
NODE_ENV=production
JWT_SECRET=your-production-jwt-secret
JWT_REFRESH_SECRET=your-production-refresh-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

---

## Data Seeding

To import client data from Excel:

```bash
cd server
node scripts/seedFromExcel.js
```

This reads the Excel file and:
- Creates all client records with IDs, names, types, and commission rates
- Imports 9 months (Apr–Dec 2025) of royalty data per client
- Auto-calculates commissions, GST, invoices, and outstanding balances
- Cascades `previousMonthOutstanding` across months

---

## License

ISC
