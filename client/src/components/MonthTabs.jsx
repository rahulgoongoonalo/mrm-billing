import React, { useMemo } from 'react';
import { useApp } from '../contexts/AppContext';

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
  const { currentMonth, setCurrentMonth, billingEntries } = useApp();

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
          className={`month-tab ${currentMonth === month.key ? 'active' : ''} ${monthsWithData.has(month.key) ? 'has-data' : ''}`}
          onClick={() => setCurrentMonth(month.key)}
        >
          {month.label}
          <span className="badge"></span>
        </button>
      ))}
    </div>
  );
}

export default MonthTabs;
