import React from 'react';
import MonthTabs from './MonthTabs';
import Legend from './Legend';
import ClientPanel from './ClientPanel';
import BillingForm from './BillingForm';

// The landing page: pick a month, pick a client, fill the form. The client
// search-and-scroll panel is unchanged - it is the part the team works from.
function DataEntryPage() {
  return (
    <>
      <MonthTabs />
      <Legend />
      <div className="content-grid">
        <ClientPanel />
        <BillingForm />
      </div>
    </>
  );
}

export default DataEntryPage;
