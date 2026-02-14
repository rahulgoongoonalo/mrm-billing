import React from 'react';

function Legend() {
  return (
    <div className="legend">
      <div className="legend-item">
        <div className="swatch input"></div>
        <span>Input Field</span>
      </div>
      <div className="legend-item">
        <div className="swatch calculated"></div>
        <span>Auto-Calculated</span>
      </div>
      <div className="legend-item">
        <div className="swatch draft"></div>
        <span>Draft Entry</span>
      </div>
      <div className="legend-item">
        <div className="swatch submitted"></div>
        <span>Submitted Entry</span>
      </div>
    </div>
  );
}

export default Legend;
