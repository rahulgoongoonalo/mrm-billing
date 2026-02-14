<<<<<<< HEAD
# MRM Billing Data Entry Application

A full-stack React application for Music Rights Management (MRM) billing data entry with MongoDB backend storage.

## Features

- **Client Management**: Add, edit, and remove clients with customizable service fees
- **Monthly Billing Entry**: Enter royalty income from various sources (IPRS, PRS, Sound Exchange, ISAMRA, ASCAP, PPL)
- **Auto-Calculations**: Automatic calculation of commissions, GST, and total invoices
- **Financial Year Support**: Configurable financial year (April to March)
- **Currency Conversion**: GBP to INR conversion with customizable exchange rates
- **Draft & Submit**: Save entries as drafts or submit them
- **Reports**: View all billing entries with status tracking

## Tech Stack

- **Frontend**: React 18 with Hooks
- **Backend**: Node.js with Express
- **Database**: MongoDB with Mongoose ODM
- **Styling**: Custom CSS (dark theme)

## Project Structure

```
mrm-billing-app/
├── client/                 # React frontend
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── Header.jsx
│   │   │   ├── MonthTabs.jsx
│   │   │   ├── ClientPanel.jsx
│   │   │   ├── BillingForm.jsx
│   │   │   ├── Toast.jsx
│   │   │   ├── Modals.jsx
│   │   │   └── Legend.jsx
│   │   ├── contexts/       # React Context
│   │   │   └── AppContext.js
│   │   ├── hooks/          # Custom hooks
│   │   │   └── useBillingForm.js
│   │   ├── services/       # API services
│   │   │   └── api.js
│   │   ├── styles/         # CSS styles
│   │   │   └── App.css
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
├── server/                 # Node.js backend
│   ├── config/
│   │   └── db.js           # MongoDB connection
│   ├── models/             # Mongoose models
│   │   ├── Client.js
│   │   ├── BillingEntry.js
│   │   └── Settings.js
│   ├── routes/             # Express routes
│   │   ├── clients.js
│   │   ├── billing.js
│   │   └── settings.js
│   ├── index.js            # Server entry point
│   ├── .env.example
│   └── package.json
├── package.json            # Root package.json
└── README.md
```

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- npm or yarn

## Installation

### 1. Clone and Install Dependencies

```bash
# Navigate to project directory
cd mrm-billing-app

# Install all dependencies (root, client, and server)
npm run install:all
```

Or install separately:

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### 2. Configure MongoDB

Create a `.env` file in the `server` directory:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your MongoDB connection string:

```env
# Local MongoDB
MONGODB_URI=mongodb://localhost:27017/mrm_billing

# OR MongoDB Atlas
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/mrm_billing?retryWrites=true&w=majority

PORT=5000
NODE_ENV=development
```

### 3. Start the Application

```bash
# From the root directory, start both frontend and backend
npm run dev
```

This will start:
- Backend server on `http://localhost:5000`
- Frontend React app on `http://localhost:3000`

## API Endpoints

### Clients

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clients` | Get all clients |
| GET | `/api/clients/:id` | Get client by ID |
| POST | `/api/clients` | Create new client |
| PUT | `/api/clients/:id` | Update client |
| DELETE | `/api/clients/:id` | Delete/deactivate client |
| POST | `/api/clients/bulk` | Bulk import clients |

### Billing Entries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing` | Get all billing entries |
| GET | `/api/billing/:clientId/:month` | Get specific entry |
| POST | `/api/billing` | Create/update billing entry |
| PUT | `/api/billing/:id` | Update entry |
| DELETE | `/api/billing/:clientId/:month` | Delete entry |
| GET | `/api/billing/reports/summary` | Get summary report |
| GET | `/api/billing/reports/client/:clientId` | Get client report |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get all settings |
| GET | `/api/settings/:key` | Get specific setting |
| PUT | `/api/settings/:key` | Update setting |
| PUT | `/api/settings/financial-year` | Update financial year |
| PUT | `/api/settings/exchange-rate` | Update exchange rate |

## MongoDB Data Models

### Client Schema

```javascript
{
  clientId: String,      // Unique identifier (e.g., "MRM001")
  name: String,          // Client name
  type: String,          // "Film Composer", "Lyricist", etc.
  fee: Number,           // Service fee (0.10 = 10%)
  email: String,
  phone: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### BillingEntry Schema

```javascript
{
  clientId: String,
  clientName: String,
  month: String,         // "apr", "may", etc.
  monthLabel: String,    // "April 2025"
  financialYear: {
    startYear: Number,
    endYear: Number
  },
  // Royalty amounts
  iprsAmt: Number,
  prsGbp: Number,
  prsAmt: Number,
  soundExAmt: Number,
  isamraAmt: Number,
  ascapAmt: Number,
  pplAmt: Number,
  // Commissions (calculated)
  serviceFee: Number,
  iprsComis: Number,
  prsComis: Number,
  // ... other commission fields
  totalCommission: Number,
  gst: Number,
  totalInvoice: Number,
  // Status
  status: String,        // "draft" or "submitted"
  invoiceStatus: String,
  invoiceDate: Date,
  gbpToInrRate: Number
}
```

### Settings Schema

```javascript
{
  key: String,           // "financialYear", "gbpToInrRate", etc.
  value: Mixed,          // Setting value
  description: String,
  updatedAt: Date
}
```

## Usage Guide

### Adding a Client

1. Click "Add Client" button in the header
2. Fill in the client details:
   - Client ID (unique identifier)
   - Client Name
   - Client Type
   - Service Fee percentage
3. Click "Add Client"

### Entering Billing Data

1. Select a client from the left panel
2. Choose the month from the tabs
3. Enter royalty amounts:
   - IPRS Amount (₹)
   - PRS Amount (£) - auto-converts to INR
   - Sound Exchange, ISAMRA, ASCAP, PPL amounts
4. Commissions are auto-calculated based on service fee
5. Add remarks if needed
6. Click "Save Draft" or "Submit Entry"

### Viewing Reports

1. Click "View Entries" to see all billing entries
2. Entries show status (Draft/Submitted), commission, and invoice totals

### Changing Settings

1. Click "Settings" button
2. Update financial year or exchange rate
3. Click "Save Settings"

## Development

### Running in Development Mode

```bash
# Start both frontend and backend with hot reload
npm run dev
```

### Building for Production

```bash
# Build the React frontend
npm run build

# Start production server
npm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/mrm_billing` |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `REACT_APP_API_URL` | API URL (client) | `/api` |

## Troubleshooting

### MongoDB Connection Issues

1. Ensure MongoDB is running locally or Atlas cluster is accessible
2. Check the connection string in `.env`
3. Verify network access settings in MongoDB Atlas

### Port Already in Use

```bash
# Kill process on port 3000 or 5000
npx kill-port 3000
npx kill-port 5000
```

### CORS Issues

The server includes CORS configuration. If issues persist, check the `cors` middleware in `server/index.js`.

## License

ISC

## Support

For issues or questions, please create an issue in the repository.
=======
# MRM-Billing-App
>>>>>>> a0c4ed66d4892eba4ac99a39cd8475161d166198

Email: admin@mrm.com
Password: Admin@123
#   m r m - b i l l i n g  
 