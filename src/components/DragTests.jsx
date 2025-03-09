import React, { useState } from 'react';

const DragTest = () => {
  const [draggedCard, setDraggedCard] = useState(null);
  const [equationItems, setEquationItems] = useState([]);
  
  const cards = [
    { id: 1, value: 'A', suit: '♥' },
    { id: 2, value: '2', suit: '♠' },
    { id: 3, value: '5', suit: '♦' },
    { id: 4, value: 'K', suit: '♣' },
  ];
  
  const handleDragStart = (e, card) => {
    setDraggedCard(card);
    e.dataTransfer.setData('text/plain', JSON.stringify(card));
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    const card = JSON.parse(data);
    
    setEquationItems([...equationItems, card]);
    setDraggedCard(null);
  };
  
  return (
    <div className="drag-test-container">
      <h2>Drag Test</h2>
      
      <div className="card-container">
        <h3>Cards (Drag these)</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          {cards.map(card => (
            <div
              key={card.id}
              draggable
              onDragStart={(e) => handleDragStart(e, card)}
              style={{
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '8px',
                padding: '20px',
                width: '60px',
                height: '90px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                color: card.suit === '♥' || card.suit === '♦' ? 'red' : 'black',
                cursor: 'grab'
              }}
            >
              <div>{card.value}</div>
              <div style={{ fontSize: '24px' }}>{card.suit}</div>
            </div>
          ))}
        </div>
      </div>
      
      <div
        className="equation-area"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          marginTop: '20px',
          padding: '20px',
          border: '2px dashed #aaa',
          borderRadius: '8px',
          minHeight: '100px',
          backgroundColor: '#f9f9f9'
        }}
      >
        <h3>Drop Area</h3>
        
        {equationItems.length === 0 ? (
          <p>Drag cards here...</p>
        ) : (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {equationItems.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  padding: '20px',
                  width: '60px',
                  height: '90px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  color: item.suit === '♥' || item.suit === '♦' ? 'red' : 'black'
                }}
              >
                <div>{item.value}</div>
                <div style={{ fontSize: '24px' }}>{item.suit}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DragTest; 