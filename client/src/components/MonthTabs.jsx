import React, { useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { isBeforeJoining, joiningMonthLabel } from '../utils/clientProfile';

const MONTHS = [
  { key: 'apr', label: 'April' },
  { key: 'may', label: 'May' },
  { key: 'jun', label: 'June' },
  { key: 'jul', label: 'July' },
  { key: 'aug', label: 'August' },
  { key: 'sep', label: 'September' },
  { key: 'oct', label: 'October' },
  { key: 'nov', label: 'November' },
  { key: 'dec', label: 'December' },
  { key: 'jan', label: 'January' },
  { key: 'feb', label: 'February' },
  { key: 'mar', label: 'March' },
];

function MonthTabs() {
  const { currentMonth, setCurrentMonth, billingEntries, selectedClient, settings } = useApp();
  const fy = settings?.financialYear;
  // Months before the selected client joined stay clickable (to look) but read as locked.
  const locked = (key) => !!fy && isBeforeJoining(selectedClient, { month: key, year: ['jan', 'feb', 'mar'].includes(key) ? fy.endYear : fy.startYear });

  // Calculate which months have data
  const monthsWithData = useMemo(() => {
    const months = new Set();
    Object.keys(billingEntries).forEach(key => {
      const month = key.split('_')[1];
      if (month) months.add(month);
    });
    return months;
  }, [billingEntries]);

  return (
    <div className="month-tabs">
      {MONTHS.map(month => (
        <button
          key={month.key}
          className={`month-tab ${currentMonth === month.key ? 'active' : ''} ${monthsWithData.has(month.key) ? 'has-data' : ''}${locked(month.key) ? ' before-joining' : ''}`}
          onClick={() => setCurrentMonth(month.key)}
          title={locked(month.key) ? `Locked: ${selectedClient.name} joined in ${joiningMonthLabel(selectedClient)}` : undefined}
        >
          {month.label}
          <span className="badge"></span>
        </button>
      ))}
    </div>
  );
}

export default MonthTabs;
