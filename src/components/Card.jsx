import React from 'react';
import './Card.css';

const Card = ({ value, suit, onClick, selected }) => {
  // Convert numeric values to card faces if needed
  const displayValue = getDisplayValue(value);
  
  // Get color based on suit
  const color = suit === '♥' || suit === '♦' ? 'red' : 'black';
  
  return (
    <div 
      className={`card ${selected ? 'selected' : ''}`} 
      onClick={onClick}
      style={{ color }}
    >
      <div className="card-corner top-left">
        <div className="card-value">{displayValue}</div>
        <div className="card-suit">{suit}</div>
      </div>
      <div className="card-center-suit">{suit}</div>
      <div className="card-corner bottom-right">
        <div className="card-value">{displayValue}</div>
        <div className="card-suit">{suit}</div>
      </div>
    </div>
  );
};

// Helper function to convert numeric values to card faces
const getDisplayValue = (value) => {
  switch (value) {
    case 1: return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return value;
  }
};

export default Card; 