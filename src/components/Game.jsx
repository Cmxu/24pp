import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Parser } from 'expr-eval';
import './Game.css';

const OPERATIONS = ['+', '-', '×', '÷', '(', ')'];

// Create a seeded random number generator for daily mode
const seedRandom = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// Get a seed based on the current date (resets daily)
const getDailySeed = () => {
  const date = new Date();
  const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let seed = 0;
  for (let i = 0; i < dateString.length; i++) {
    seed = ((seed << 5) - seed) + dateString.charCodeAt(i);
    seed = seed & seed; // Convert to 32bit integer
  }
  return Math.abs(seed);
};

// Create a full deck of cards
const createDeck = () => {
  const deck = [];
  const suits = ['♥', '♦', '♣', '♠'];
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  
  for (let suit of suits) {
    for (let value of values) {
      deck.push({
        value,
        suit,
        // Face cards are worth 10 in this game
        gameValue: value > 10 ? 10 : value
      });
    }
  }
  
  return deck;
};

// Shuffle the deck using Fisher-Yates algorithm
const shuffleDeck = (deck, isDaily = false, seed = null) => {
  const shuffled = [...deck];
  let randomFn = Math.random;
  
  // Use seeded random function for daily mode
  if (isDaily && seed !== null) {
    let seedValue = seed;
    randomFn = () => {
      seedValue = (seedValue * 9301 + 49297) % 233280;
      return seedValue / 233280;
    };
  }
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Draw cards from the deck
const drawCards = (deck, count) => {
  const drawnCards = deck.slice(0, count);
  const remainingDeck = deck.slice(count);
  return { drawnCards, remainingDeck };
};

// Generate target cards (values 1-9 only, no 10s)
const generateTargetCards = (deck) => {
  const targetCards = [];
  let remainingDeck = [...deck];
  
  while (targetCards.length < 3) {
    // Find first card that isn't a 10 value
    const nonTenIndex = remainingDeck.findIndex(card => card.gameValue !== 10);
    
    if (nonTenIndex !== -1) {
      targetCards.push(remainingDeck[nonTenIndex]);
      // Remove the card from the deck
      remainingDeck = [
        ...remainingDeck.slice(0, nonTenIndex),
        ...remainingDeck.slice(nonTenIndex + 1)
      ];
    } else {
      // Fallback if somehow no non-10 cards are left
      break;
    }
  }
  
  return { targetCards, remainingDeck };
};

// Simple confetti component
const Confetti = ({ active }) => {
  const [pieces, setPieces] = useState([]);
  
  useEffect(() => {
    if (active) {
      const newPieces = [];
      const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722'];
      
      for (let i = 0; i < 100; i++) {
        newPieces.push({
          id: i,
          x: Math.random() * 100,
          y: -20 - Math.random() * 100,
          size: Math.random() * 10 + 5,
          color: colors[Math.floor(Math.random() * colors.length)],
          speed: Math.random() * 3 + 2
        });
      }
      
      setPieces(newPieces);
    } else {
      setPieces([]);
    }
  }, [active]);
  
  if (!active) return null;
  
  return (
    <div className="confetti-container">
      {pieces.map(piece => (
        <div 
          key={piece.id} 
          className="confetti-piece"
          style={{
            left: `${piece.x}%`,
            top: `${piece.y}%`,
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            animation: `fall ${piece.speed}s linear forwards`
          }}
        />
      ))}
    </div>
  );
};

// Draggable Card Component
const DraggableCard = ({ card, index, isSelected, onDragStart }) => {
  const cardRef = useRef(null);
  
  // Helper function to display correct value for face cards
  const getDisplayValue = (value) => {
    switch (value) {
      case 1: return 'A';
      case 11: return 'J';
      case 12: return 'Q';
      case 13: return 'K';
      default: return value;
    }
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only accept left mouse button
    if (isSelected) return; // Already used, can't drag
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    // Call parent component's onDragStart
    onDragStart('card', card, index, e);
  };

  // Add touch event listeners using refs instead of props
  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    
    const handleTouchStart = (e) => {
      if (isSelected) return; // Already used, can't drag
      
      e.preventDefault();
      e.stopPropagation();
      
      const touch = e.touches[0];
      const rect = element.getBoundingClientRect();
      const offsetX = touch.clientX - rect.left;
      const offsetY = touch.clientY - rect.top;
      
      // Create a synthetic event with clientX and clientY from the touch
      const syntheticEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
        currentTarget: element,
        target: e.target
      };
      
      // Call parent component's onDragStart
      onDragStart('card', card, index, syntheticEvent);
    };
    
    // Add the event listener with passive: false to allow preventDefault()
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // Clean up
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
    };
  }, [card, index, isSelected, onDragStart]);

  return (
    <div 
      ref={cardRef}
      className={`card ${isSelected ? 'selected' : ''}`}
      onMouseDown={handleMouseDown}
      style={{ color: card.suit === '♥' || card.suit === '♦' ? 'red' : 'black' }}
    >
      <div className="card-corner top-left">
        <div className="card-value">{getDisplayValue(card.value)}</div>
        <div className="card-suit">{card.suit}</div>
      </div>
      <div className="card-center-suit">{card.suit}</div>
      <div className="card-corner bottom-right">
        <div className="card-value">{getDisplayValue(card.value)}</div>
        <div className="card-suit">{card.suit}</div>
      </div>
    </div>
  );
};

// Draggable Operation Button
const DraggableOperation = ({ operation, onDragStart }) => {
  const operationRef = useRef(null);
  
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only accept left mouse button
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    // Call parent component's onDragStart
    onDragStart('operation', operation, null, e);
  };
  
  // Add touch event listeners using refs instead of props
  useEffect(() => {
    const element = operationRef.current;
    if (!element) return;
    
    const handleTouchStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = e.touches[0];
      const rect = element.getBoundingClientRect();
      const offsetX = touch.clientX - rect.left;
      const offsetY = touch.clientY - rect.top;
      
      // Create a synthetic event with clientX and clientY from the touch
      const syntheticEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
        currentTarget: element,
        target: e.target
      };
      
      // Call parent component's onDragStart
      onDragStart('operation', operation, null, syntheticEvent);
    };
    
    // Add the event listener with passive: false to allow preventDefault()
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // Clean up
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
    };
  }, [operation, onDragStart]);
  
  // Map stylized symbols back to their functional counterparts
  const displayOperation = (op) => {
    switch (op) {
      case '×': return '*';
      case '÷': return '/';
      default: return op;
    }
  };
  
  return (
    <button 
      ref={operationRef}
      className="operation-button"
      onMouseDown={handleMouseDown}
    >
      {operation}
    </button>
  );
};

// Equation Item Component (can be dragged)
const EquationItem = ({ item, index, onDragStart, onClick }) => {
  const itemRef = useRef(null);
  
  let itemClass = '';
  let displayValue = item;
  
  if (typeof item === 'object' && item.type === 'card') {
    itemClass = 'number';
    displayValue = item.display;
  } else if (typeof item === 'string') {
    if (item === '(' || item === ')') {
      itemClass = 'parenthesis';
    } else {
      itemClass = 'operation';
    }
  }
  
  const handleMouseDown = (e) => {
    e.preventDefault();
    if (e.button !== 0) return; // Only left mouse button
    
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    // Call drag start but also pass the index in the equation
    onDragStart(item, index, 'equation-item', e.clientX, e.clientY, offsetX, offsetY, index);
  };
  
  // Add touch event listeners using refs instead of props
  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;
    
    const handleTouchStart = (e) => {
      e.preventDefault();
      
      const touch = e.touches[0];
      const rect = element.getBoundingClientRect();
      const offsetX = touch.clientX - rect.left;
      const offsetY = touch.clientY - rect.top;
      
      // Call drag start but also pass the index in the equation
      onDragStart(item, index, 'equation-item', touch.clientX, touch.clientY, offsetX, offsetY, index);
    };
    
    // Add the event listener with passive: false to allow preventDefault()
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // Clean up
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
    };
  }, [item, index, onDragStart]);
  
  return (
    <span 
      ref={itemRef}
      className={`equation-item ${itemClass}`}
      onMouseDown={handleMouseDown}
      onClick={onClick}
    >
      {displayValue}
    </span>
  );
};

// Ghost Element for dragging
const DragGhost = ({ type, item, position }) => {
  if (!position) return null;
  
  let itemClass = '';
  let displayValue = item;
  
  // Process the item exactly as in EquationItem
  if (typeof item === 'object' && item.type === 'card') {
    itemClass = 'number';
    displayValue = item.display || getDisplayValue(item.value);
  } else if (type === 'card') {
    itemClass = 'number';
    displayValue = typeof item === 'object' ? getDisplayValue(item.value) : item;
  } else if (type === 'operation') {
    itemClass = 'operation';
    displayValue = item;
  } else if (type === 'equation-item') {
    if (typeof item === 'object') {
      itemClass = 'number';
      displayValue = item.display || getDisplayValue(item.value);
    } else if (item === '(' || item === ')') {
      itemClass = 'parenthesis';
      displayValue = item;
    } else {
      itemClass = 'operation';
      displayValue = item;
    }
  }
  
  return (
    <div 
      className="drag-ghost-container"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        pointerEvents: 'none',
        zIndex: 1000,
        transform: 'translate(-50%, -50%)' /* Center on cursor */
      }}
    >
      <span className={`equation-item ${itemClass} ghost-item`}>
        {displayValue}
      </span>
    </div>
  );
};

// Helper function to display correct value for face cards
const getDisplayValue = (value) => {
  switch (value) {
    case 1: return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return value;
  }
};

// Info Tooltip Component
const InfoTooltip = ({ text }) => {
  return (
    <div className="info-tooltip-container">
      <span className="info-icon" aria-hidden="true">i</span>
      <div className="tooltip">{text}</div>
    </div>
  );
};

// Drop Preview Component
const DropPreview = ({ type, item, dropIndex }) => {
  if (dropIndex === null) return null;
  
  let itemClass = '';
  let displayValue = item;
  
  // Process the item exactly as in EquationItem
  if (typeof item === 'object' && item.type === 'card') {
    itemClass = 'number';
    displayValue = item.display || getDisplayValue(item.value);
  } else if (typeof item === 'string') {
    if (item === '(' || item === ')') {
      itemClass = 'parenthesis';
    } else {
      itemClass = 'operation';
    }
  } else if (type === 'card') {
    itemClass = 'number';
    displayValue = typeof item === 'object' ? getDisplayValue(item.value) : item;
  } else if (type === 'operation') {
    itemClass = 'operation';
    displayValue = item;
  }
  
  return (
    <div className={`preview-item-wrapper ${itemClass}`}>
      <span className={`equation-item ${itemClass} preview-item`}>
        {displayValue}
      </span>
    </div>
  );
};

// Welcome Modal Component
const WelcomeModal = ({ isOpen, onClose, onSelectMode, onShowInstructions }) => {
  if (!isOpen) return null;

  const handleShowInstructions = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onShowInstructions();
  };

  // Format today's date for display
  const formatTodayDate = () => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date();
    return today.toLocaleDateString('en-US', options);
  };

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target.className === 'modal-overlay') {
        // Start daily challenge when clicking outside
        onSelectMode('daily');
      }
    }}>
      <div className="modal-content welcome-modal">
        <h2>Welcome to 24++</h2>
        
        <div className="welcome-content">
          <p>Choose a game mode to get started:</p>
          
          <div className="game-mode-buttons">
            <button 
              className="game-mode-button daily-mode rectangular-btn" 
              onClick={() => onSelectMode('daily')}
            >
              <span className="mode-icon">🗓️</span>
              <span className="mode-title">Daily Challenge</span>
              <span className="mode-description">Solve today's puzzle ({formatTodayDate()})!</span>
            </button>

            <button 
              className="game-mode-button unlimited-mode rectangular-btn" 
              onClick={() => onSelectMode('unlimited')}
            >
              <span className="mode-icon">♾️</span>
              <span className="mode-title">Unlimited Play</span>
              <span className="mode-description">Play unlimited puzzles!</span>
            </button>
          </div>
          
          <button 
            className="how-to-play-button rectangular-btn"
            onClick={handleShowInstructions}
          >
            How to Play
          </button>
        </div>
      </div>
    </div>
  );
};

// Instructions Modal Component
const InstructionsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // Example cards for visualization
  const exampleCards = [
    { value: 5, suit: '♥' },
    { value: 10, suit: '♠' },
    { value: 2, suit: '♦' },
    { value: 7, suit: '♣' }
  ];

  // Helper function to render card visuals similar to the Card component
  const renderCard = (value, suit) => {
    const displayValue = getDisplayValue(value);
    const color = suit === '♥' || suit === '♦' ? 'red' : 'black';
    
    return (
      <div className="example-card" style={{ color }}>
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

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target.className === 'modal-overlay') {
        onClose();
      }
    }}>
      <div className="modal-content instructions-modal">
        <h2>How to Play 24++</h2>
        
        <div className="instructions-content">
          <section className="intro-section">
            <h3>Goal</h3>
            <p>Create the target number shown at the top using all 7 cards and mathematical operations.</p>
          </section>
          
          <section className="rules-section">
            <h3>Rules</h3>
            <div className="rules-list">
              <div>You can use the operations: <span className="equation-item operation no-hover">+</span>, <span className="equation-item operation no-hover">−</span>, <span className="equation-item operation no-hover">×</span>, <span className="equation-item operation no-hover">÷</span> and <span className="equation-item parenthesis no-hover small-paren">(</span> <span className="equation-item parenthesis no-hover small-paren">)</span></div>
              <div>Card values: <span className="equation-item number no-hover">A</span> = 1, <span className="equation-item number no-hover">J</span>/<span className="equation-item number no-hover">Q</span>/<span className="equation-item number no-hover">K</span> = 10</div>
            </div>
          </section>
          
          <section className="how-to-section">
            <h3>How to Build Equations</h3>
            <div className="instruction-rows">
              <div className="instruction-row">
                <div className="instruction-icon drag-icon">↔️</div>
                <p>Drag cards and operations to the equation area</p>
              </div>
              <div className="instruction-row">
                <div className="instruction-icon click-icon">👆</div>
                <p>Click items to add/remove them</p>
              </div>
              <div className="instruction-row">
                <div className="instruction-icon parentheses-icon">()</div>
                <p>Use parentheses to control order of operations</p>
              </div>
              <div className="instruction-row">
                <div className="instruction-icon warning-icon">⚠️</div>
                <p>Incomplete parentheses will be highlighted in red</p>
              </div>
            </div>
          </section>
          
          <section className="example-section">
            <h3>Example</h3>
            <div className="example-game">
              <div className="target-example">
                <span className="target-label">Target:</span>
                <span className="target-number">55</span>
              </div>
              <div className="example-cards">
                {renderCard(5, '♥')}
                {renderCard(10, '♠')}
                {renderCard(2, '♦')}
                {renderCard(7, '♣')}
              </div>
              <div className="example-operations">
                <span className="example-operation">+</span>
                <span className="example-operation">−</span>
                <span className="example-operation">×</span>
                <span className="example-operation">÷</span>
                <span className="example-operation">(</span>
                <span className="example-operation">)</span>
              </div>
              <div className="example-equation">
                <p>Example equation: <span className="equation-example">
                  <span className="equation-item number no-hover">5</span> 
                  <span className="equation-item operation no-hover">+</span> 
                  <span className="equation-item number no-hover">10</span> 
                  <span className="equation-item operation no-hover">×</span> 
                  <span className="equation-item parenthesis no-hover small-paren">(</span>
                  <span className="equation-item number no-hover">7</span> 
                  <span className="equation-item operation no-hover">−</span> 
                  <span className="equation-item number no-hover">2</span>
                  <span className="equation-item parenthesis no-hover small-paren">)</span> 
                  <span className="result correct">= 55</span></span></p>
              </div>
            </div>
          </section>
        </div>
        
        <button className="modal-close-x remove-item" onClick={onClose}>×</button>
      </div>
    </div>
  );
};

// Solved Modal Component
const SolvedModal = ({ isOpen, onClose, targetNumber, equation, onRedeal, gameMode, onPlayUnlimited }) => {
  if (!isOpen) return null;

  // Helper function to debug equation content
  const logEquationItems = () => {
    console.log("Equation items:", equation.map(item => {
      if (typeof item === 'object') return `object: ${JSON.stringify(item)}`;
      return `${typeof item}: ${item}`;
    }));
  };

  // Format today's date for display
  const formatTodayDate = () => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date();
    return today.toLocaleDateString('en-US', options);
  };

  // Call the debug function
  logEquationItems();

  // Convert equation to plain text
  const getEquationText = () => {
    return equation.map(item => {
      if (typeof item === 'object' && item.type === 'card') {
        return item.gameValue;
      } else if (typeof item === 'string') {
        if (item === '*') return '×';
        if (item === '/') return '÷';
        return item;
      }
      return item;
    }).join(' ') + ' = ' + targetNumber;
  };

  // Count operations used
  const countOperations = () => {
    let count = 0;
    equation.forEach(item => {
      if (typeof item === 'string' && ['+', '-', '*', '/', '×', '÷', '(', ')'].includes(item)) {
        count++;
      }
    });
    return count;
  };

  // Get the completion message for sharing
  const getCompletionMessage = () => {
    if (gameMode === 'daily') {
      return `I completed the daily 24++ on ${formatTodayDate()} in ${countOperations()} operations!`;
    }
    return `I solved a 24++ puzzle using ${countOperations()} operations!`;
  };

  // Copy completion message to clipboard
  const copyToClipboard = () => {
    const button = document.querySelector('.copy-message-btn');
    
    navigator.clipboard.writeText(getCompletionMessage())
      .then(() => {
        // Show visual feedback with a simpler, clearer checkmark
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="#4CAF50"/>
          </svg>
        `;
        
        // Reset after a short delay
        setTimeout(() => {
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.50280381,4.62704038 L5.5,6.75 L5.5,17.2542087 C5.5,19.0491342 6.95507456,20.5042087 8.75,20.5042087 L17.3662868,20.5044622 C17.057338,21.3782241 16.2239751,22.0042087 15.2444057,22.0042087 L8.75,22.0042087 C6.12664744,22.0042087 4,19.8775613 4,17.2542087 L4,6.75 C4,5.76928848 4.62744523,4.93512464 5.50280381,4.62704038 Z M17.75,2 C18.9926407,2 20,3.00735931 20,4.25 L20,17.25 C20,18.4926407 18.9926407,19.5 17.75,19.5 L8.75,19.5 C7.50735931,19.5 6.5,18.4926407 6.5,17.25 L6.5,4.25 C6.5,3.00735931 7.50735931,2 8.75,2 L17.75,2 Z M17.75,3.5 L8.75,3.5 C8.33578644,3.5 8,3.83578644 8,4.25 L8,17.25 C8,17.6642136 8.33578644,18 8.75,18 L17.75,18 C18.1642136,18 18.5,17.6642136 18.5,17.25 L18.5,4.25 C18.5,3.83578644 18.1642136,3.5 17.75,3.5 Z" />
          </svg>`;
          button.style.color = '';
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy to clipboard');
      });
  };

  // Render the equation items for display
  const renderEquationItem = (item, index) => {
    console.log(`Rendering item at index ${index}:`, item, typeof item);
    
    if (typeof item === 'object' && item.type === 'card') {
      return <span key={index} className="equation-item number">{item.gameValue}</span>;
    } else if (typeof item === 'number') {
      return <span key={index} className="equation-item number">{item}</span>;
    } else if (typeof item === 'string') {
      // Handle string operations
      let displaySymbol = item;
      
      // Explicit mapping for each symbol to ensure proper display
      switch(item) {
        case '*':
          displaySymbol = '×';
          break;
        case '/':
          displaySymbol = '÷';
          break;
        case '×':
          displaySymbol = '×';
          break;
        case '÷':
          displaySymbol = '÷';
          break;
      }
      
      return <span key={index} className="equation-item operation">{displaySymbol}</span>;
    }
    
    // Fallback for any other type
    return <span key={index} className="equation-item">{String(item)}</span>;
  };

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target.className === 'modal-overlay') {
        onClose();
      }
    }}>
      <div className="modal-content solved-modal">
        <h2>
          {gameMode === 'daily' 
            ? "Daily Completed" 
            : "Puzzle Solved! 🎉"}
        </h2>
        
        <div className="solved-content">
          <div className="solved-equation">
            <div className="equation-solution">
              <h3>Your Solution:</h3>
              <div className="equation-text">
                {getEquationText()}
              </div>
            </div>
          </div>
          
          {gameMode === 'daily' ? (
            <div className="daily-completion">
              <p className="completion-message">
                {getCompletionMessage()}
              </p>
              <button 
                className="copy-message-btn" 
                onClick={copyToClipboard}
                title="Copy to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.50280381,4.62704038 L5.5,6.75 L5.5,17.2542087 C5.5,19.0491342 6.95507456,20.5042087 8.75,20.5042087 L17.3662868,20.5044622 C17.057338,21.3782241 16.2239751,22.0042087 15.2444057,22.0042087 L8.75,22.0042087 C6.12664744,22.0042087 4,19.8775613 4,17.2542087 L4,6.75 C4,5.76928848 4.62744523,4.93512464 5.50280381,4.62704038 Z M17.75,2 C18.9926407,2 20,3.00735931 20,4.25 L20,17.25 C20,18.4926407 18.9926407,19.5 17.75,19.5 L8.75,19.5 C7.50735931,19.5 6.5,18.4926407 6.5,17.25 L6.5,4.25 C6.5,3.00735931 7.50735931,2 8.75,2 L17.75,2 Z M17.75,3.5 L8.75,3.5 C8.33578644,3.5 8,3.83578644 8,4.25 L8,17.25 C8,17.6642136 8.33578644,18 8.75,18 L17.75,18 C18.1642136,18 18.5,17.6642136 18.5,17.25 L18.5,4.25 C18.5,3.83578644 18.1642136,3.5 17.75,3.5 Z" />
                </svg>
              </button>
            </div>
          ) : (
            <p className="operations-count">
              Operations used: {countOperations()}
            </p>
          )}
          
          <div className="solved-actions">
            {gameMode === 'unlimited' && (
              <button className="action-button" onClick={onRedeal}>
                New Puzzle
              </button>
            )}
            {gameMode === 'daily' && (
              <button className="play-unlimited-btn" onClick={onPlayUnlimited}>
                Play Unlimited Mode
              </button>
            )}
            <button className="action-button continue-btn" onClick={onClose}>
              Continue
            </button>
          </div>
        </div>
        
        <button className="modal-close-x remove-item" onClick={onClose}>×</button>
      </div>
    </div>
  );
};

const Game = () => {
  // State for cards and gameplay
  const [playCards, setPlayCards] = useState([]);
  const [targetCards, setTargetCards] = useState([]);
  const [targetNumber, setTargetNumber] = useState(24);
  const [equation, setEquation] = useState([]);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedCardIndices, setSelectedCardIndices] = useState([]);
  const [unmatchedParenIndices, setUnmatchedParenIndices] = useState(new Set());
  
  // Drag and drop state
  const [dragging, setDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedType, setDraggedType] = useState(null);
  const [draggedSourceIndex, setDraggedSourceIndex] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [dropPosition, setDropPosition] = useState(null);
  const [isDropping, setIsDropping] = useState(false);
  
  // Game state
  const [hasWon, setHasWon] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [gameMode, setGameMode] = useState(null);
  
  // UI state
  const [showDragPreview, setShowDragPreview] = useState(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(true);
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
  const [isSolvedModalOpen, setIsSolvedModalOpen] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const [dailyStreak, setDailyStreak] = useState(0);
  const [streakDate, setStreakDate] = useState('');
  const [dragTrashActive, setDragTrashActive] = useState(false);
  const [dragGhostVisible, setDragGhostVisible] = useState(false);
  
  // Refs
  const equationRef = useRef(null);

  // Find unmatched parentheses in the equation
  const findUnmatchedParentheses = (equation) => {
    const stack = [];
    const unmatched = new Set();
    
    equation.forEach((item, index) => {
      if (item === '(') {
        stack.push(index);
      } else if (item === ')') {
        if (stack.length === 0) {
          // Unmatched closing parenthesis
          unmatched.add(index);
        } else {
          // Found a matching pair
          stack.pop();
        }
      }
    });
    
    // Any remaining opening parentheses are unmatched
    stack.forEach(index => unmatched.add(index));
    
    return unmatched;
  };

  // Update unmatched parentheses whenever equation changes
  useEffect(() => {
    const unmatched = findUnmatchedParentheses(equation);
    setUnmatchedParenIndices(unmatched);
  }, [equation]);
  
  // Handle mode selection
  const handleModeSelection = (mode) => {
    setGameMode(mode);
    localStorage.setItem('gameMode', mode);
    
    // Close welcome modal
    setIsWelcomeModalOpen(false);
    
    // Start the appropriate game
    if (mode === 'daily') {
      startDailyGame();
    } else {
      startUnlimitedGame();
    }
  };
  
  // Start a daily game with seeded randomness
  const startDailyGame = useCallback(() => {
    const dailySeed = getDailySeed();
    
    // Create and shuffle deck with seed
    let deck = createDeck();
    deck = shuffleDeck(deck, true, dailySeed);
    
    // Generate target cards (values 1-9 only)
    const { targetCards, remainingDeck } = generateTargetCards(deck);
    setTargetCards(targetCards);
    
    // Calculate target number (3-digit number from the 3 target cards)
    const target = parseInt(targetCards.map(card => card.gameValue).join(''));
    setTargetNumber(target);
    
    // Deal play cards (remaining 7 cards)
    const { drawnCards } = drawCards(remainingDeck, 7);
    setPlayCards(drawnCards);
    
    // Reset game state
    setSelectedCardIndices([]);
    setEquation([]);
    setResult(null);
    setMessage('Daily Challenge: Use all 7 cards and operations to create the goal number!');
    setHasWon(false);
    
    // Save today's date
    localStorage.setItem('lastDailyDate', new Date().toDateString());
  }, []);
  
  // Start an unlimited game (random)
  const startUnlimitedGame = useCallback(() => {
    // Create and shuffle deck randomly
    let deck = createDeck();
    deck = shuffleDeck(deck);
    
    // Generate target cards (values 1-9 only)
    const { targetCards, remainingDeck } = generateTargetCards(deck);
    setTargetCards(targetCards);
    
    // Calculate target number (3-digit number from the 3 target cards)
    const target = parseInt(targetCards.map(card => card.gameValue).join(''));
    setTargetNumber(target);
    
    // Deal play cards (remaining 7 cards)
    const { drawnCards } = drawCards(remainingDeck, 7);
    setPlayCards(drawnCards);
    
    // Reset game state
    setSelectedCardIndices([]);
    setEquation([]);
    setResult(null);
    setMessage('Unlimited Mode: Make the target number with any combination of cards and operations!');
    setHasWon(false);
  }, []);
  
  // Renamed original startGame
  const redealGame = useCallback(() => {
    if (gameMode === 'daily') {
      startDailyGame();
    } else {
      startUnlimitedGame();
    }

    // Reset game state
    setHasWon(false);
    setIsSolvedModalOpen(false);
    
    // Reset drag state
    setDraggedItem(null);
    setDraggedType(null);
    setDragPosition(null);
    setDropTargetIndex(null);
    setDropPosition(null);
  }, [gameMode, startDailyGame, startUnlimitedGame]);

  // Handle drag start
  const handleDragStart = (type, item, sourceIndex, e) => {
    e.preventDefault(); // Prevent default browser drag behavior
    
    // Get the initial mouse position and calculate the offset
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    // Set initial position to the mouse cursor position
    const initialX = e.clientX;
    const initialY = e.clientY;
    
    console.log("Starting drag:", type, item, sourceIndex);
    
    // Store drag information
    setDraggedType(type);
    setDraggedItem(item);
    setDraggedSourceIndex(sourceIndex);
    setDragOffset({ x: offsetX, y: offsetY });
    setDragPosition({ x: initialX, y: initialY });
    setDragging(true);
    
    // Set initial drop target and position for empty equation
    if (equation.length === 0 && equationRef.current) {
      const equationRect = equationRef.current.getBoundingClientRect();
      setDropTargetIndex(0);
      setDropPosition({
        left: equationRect.width / 2,
        top: equationRect.height / 2
      });
    }
  };
  
  // Handle mouse movement during drag
  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    
    // Update the drag ghost position to be centered on the cursor
    setDragPosition({ 
      x: e.clientX, 
      y: e.clientY 
    });
    
    // Check if we're over the equation container
    if (equationRef.current) {
      const equationRect = equationRef.current.getBoundingClientRect();
      
      if (
        e.clientX >= equationRect.left && 
        e.clientX <= equationRect.right &&
        e.clientY >= equationRect.top && 
        e.clientY <= equationRect.bottom
      ) {
        // If mouse is over the equation container
        const verticalPos = equationRect.height / 2;
        
        // If equation is empty, center the preview
        if (equation.length === 0) {
          setDropTargetIndex(0);
          setDropPosition({
            left: equationRect.width / 2,
            top: verticalPos
          });
          return;
        }
        
        // Get all equation items
        const items = Array.from(equationRef.current.querySelectorAll('.equation-item:not(.preview-item)'));
        
        if (items.length === 0) {
          setDropTargetIndex(0);
          setDropPosition({
            left: equationRect.width / 2,
            top: verticalPos
          });
          return;
        }
        
        // Find where to insert based on mouse position
        let foundPosition = false;
        
        // Check if we should insert at the beginning (before the first item)
        const firstItemRect = items[0].getBoundingClientRect();
        if (e.clientX < firstItemRect.left - 15) { // Add a bit of buffer space
          setDropTargetIndex(0);
          // Place at the beginning with more space to prevent overlap
          setDropPosition({
            left: firstItemRect.left - equationRect.left - 40,
            top: verticalPos
          });
          foundPosition = true;
        } 
        // Check if we should insert at the end (after the last item)
        else {
          const lastItemRect = items[items.length - 1].getBoundingClientRect();
          if (e.clientX > lastItemRect.right + 15) { // Add buffer space
            setDropTargetIndex(items.length);
            // Place at the end, slightly to the right of the last item
            // Ensure enough spacing to prevent overlap
            setDropPosition({
              left: lastItemRect.right - equationRect.left + 25,
              top: verticalPos
            });
            foundPosition = true;
          }
        }
        
        // If not insert at beginning or end, find the position between items
        if (!foundPosition) {
          for (let i = 0; i < items.length - 1; i++) {
            const currentRect = items[i].getBoundingClientRect();
            const nextRect = items[i + 1].getBoundingClientRect();
            
            // Calculate the gap between items and ensure we have enough space
            const gap = nextRect.left - currentRect.right;
            
            // If cursor is between these two items
            // Add buffer zones to make selection more stable
            if (e.clientX >= currentRect.right - 5 && e.clientX <= nextRect.left + 5) {
              setDropTargetIndex(i + 1);
              
              // If the gap is small, create more space; otherwise center in the gap
              const midpoint = currentRect.right + gap / 2;
              setDropPosition({
                left: midpoint - equationRect.left,
                top: verticalPos
              });
              
              foundPosition = true;
              break;
            }
          }
        }
        
        // If still no position found, find closest item
        if (!foundPosition) {
          let closestIndex = null;
          let closestDistance = Infinity;
          
          items.forEach((item, index) => {
            const rect = item.getBoundingClientRect();
            const itemCenterX = rect.left + rect.width / 2;
            const distance = Math.abs(e.clientX - itemCenterX);
            
            if (distance < closestDistance) {
              closestDistance = distance;
              closestIndex = index;
            }
          });
          
          if (closestIndex !== null) {
            const rect = items[closestIndex].getBoundingClientRect();
            
            // If cursor is to the left of the item center, insert before
            if (e.clientX < rect.left + rect.width / 2) {
              setDropTargetIndex(closestIndex);
              
              // Position to the left of this item with consistent spacing
              setDropPosition({
                left: rect.left - equationRect.left - 20,
                top: verticalPos
              });
            } else {
              // Insert after this item
              setDropTargetIndex(closestIndex + 1);
              
              // Position to the right of this item with consistent spacing
              setDropPosition({
                left: rect.right - equationRect.left + 20,
                top: verticalPos
              });
            }
          }
        }
      } else {
        // Not over the equation, clear drop target
        setDropTargetIndex(null);
        setDropPosition(null);
      }
    }
  }, [dragging, equation, equationRef]);
  
  // Handle mouse up - finish dragging
  const handleMouseUp = useCallback((e) => {
    if (!dragging) return;
    
    // Check if we're over the equation container
    if (equationRef.current) {
      const equationRect = equationRef.current.getBoundingClientRect();
      
      const isOverEquation = (
        e.clientX >= equationRect.left &&
        e.clientX <= equationRect.right &&
        e.clientY >= equationRect.top &&
        e.clientY <= equationRect.bottom
      );
      
      if (isOverEquation && dropTargetIndex !== null) {
        console.log("Mouse up over equation, index:", dropTargetIndex);
        
        // Insert the dragged item at the drop target index
        let newEquation = [...equation];
        
        // Process different drag sources
        if (draggedType === 'card') {
          console.log("Dropping card:", draggedItem);
          // For cards, we create an equation-ready card object
          const cardItem = {
            type: 'card',
            value: typeof draggedItem === 'object' ? draggedItem.value : draggedItem,
            gameValue: typeof draggedItem === 'object' ? draggedItem.gameValue : draggedItem,
            display: typeof draggedItem === 'object' ? getDisplayValue(draggedItem.value) : draggedItem,
            originalIndex: draggedSourceIndex // Store the original index for later removal
          };
          
          // Insert at the drop target index
          newEquation.splice(dropTargetIndex, 0, cardItem);
          
          // Track selected cards
          if (draggedSourceIndex !== null && !selectedCardIndices.includes(draggedSourceIndex)) {
            setSelectedCardIndices([...selectedCardIndices, draggedSourceIndex]);
          }
        } 
        else if (draggedType === 'operation') {
          console.log("Dropping operation:", draggedItem);
          // Convert operation symbols to functional operators
          const functionalOperation = (op) => {
            switch (op) {
              case '×': return '×';
              case '÷': return '÷';
              default: return op;
            }
          };
          // Insert the converted operation
          newEquation.splice(dropTargetIndex, 0, functionalOperation(draggedItem));
        }
        else if (draggedType === 'equation-item') {
          console.log("Dropping equation item:", draggedItem);
          // For rearranging equation items
          if (draggedSourceIndex !== null) {
            // Remove from original position
            const itemToMove = newEquation[draggedSourceIndex];
            newEquation.splice(draggedSourceIndex, 1);
            
            // Adjust the insert index if needed
            const adjustedIndex = draggedSourceIndex < dropTargetIndex ? dropTargetIndex - 1 : dropTargetIndex;
            
            // Insert at new position
            newEquation.splice(adjustedIndex, 0, itemToMove);
          }
        }
        
        // Update the equation
        console.log("Setting new equation:", newEquation);
        setEquation(newEquation);
      }
    }
    
    // Reset drag state
    setDragging(false);
    setDraggedItem(null);
    setDraggedType(null);
    setDraggedSourceIndex(null);
    setDragPosition(null);
    setDropTargetIndex(null);
    setDropPosition(null);
  }, [dragging, equation, dropTargetIndex, draggedType, draggedItem, draggedSourceIndex, selectedCardIndices]);

  // Set up event listeners for dragging
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);
  
  // Handle removal of equation item
  const handleRemoveEquationItem = (index) => {
    // Get the item to be deleted
    const item = equation[index];
    
    // Remove the item from the equation
    const newEquation = equation.filter((_, i) => i !== index);
    setEquation(newEquation);
    
    // If it was a card, remove it from selected cards
    if (typeof item === 'object' && item.type === 'card' && item.originalIndex !== undefined) {
      // Filter out this specific index from the selectedCardIndices
      setSelectedCardIndices(prevIndices => 
        prevIndices.filter(idx => idx !== item.originalIndex)
      );
      
      console.log("Card removed, making index available again:", item.originalIndex);
    }
  };

  // Clear the equation
  const clearEquation = () => {
    setEquation([]);
    setResult(null);
    setSelectedCardIndices([]);
  };

  // Handle backspace to remove the last equation item
  const handleBackspace = useCallback(() => {
    if (equation.length === 0) return;
    
    // Get the last item
    const lastItem = equation[equation.length - 1];
    
    // Remove the last item
    const newEquation = equation.slice(0, -1);
    setEquation(newEquation);
    
    // If it was a card, make it available again
    if (typeof lastItem === 'object' && lastItem.type === 'card' && lastItem.originalIndex !== undefined) {
      setSelectedCardIndices(prevIndices => 
        prevIndices.filter(idx => idx !== lastItem.originalIndex)
      );
      
      console.log("Card removed with backspace, making index available again:", lastItem.originalIndex);
    }
  }, [equation, setEquation, setSelectedCardIndices]);

  // Update win condition to show modal and play sound
  const checkWinCondition = useCallback(() => {
    try {
      // Skip evaluation if equation is empty
      if (equation.length === 0) {
        setResult(null);
        return;
      }
      
      // Convert equation to a string and evaluate it
      const equationString = equation.map(item => {
        if (typeof item === 'object' && item.type === 'card') {
          return item.gameValue;
        } else if (item === '×') {
          return '*';
        } else if (item === '÷') {
          return '/';
        }
        return item;
      }).join(' ');
      
      // Create a parser instance and evaluate the expression
      const parser = new Parser();
      const calculatedResult = parser.evaluate(equationString);
      
      // Check if result is valid
      if (calculatedResult !== undefined && !isNaN(calculatedResult)) {
        setResult(calculatedResult);
        
        // Check if the player has won - must match target AND use all cards
        if (calculatedResult === targetNumber) {
          // Count cards used in the equation
          const numberCardsUsed = selectedCardIndices.length;
          
          if (numberCardsUsed === playCards.length) {
            setMessage('You won! You created the goal number using all cards!');
            setHasWon(true);
            setIsSolvedModalOpen(true);
            
            // Play win sound effect if available
            // if (winSoundRef.current) {
            //   winSoundRef.current.currentTime = 0;
            //   winSoundRef.current.play().catch(e => console.error("Error playing sound:", e));
            // }
          } else {
            setMessage(`You've found the target number, but you need to use all 7 cards to win. You've used ${numberCardsUsed} cards.`);
          }
        }
      } else {
        setResult(null);
      }
    } catch (error) {
      console.error('Error evaluating equation', error);
      setResult(null);
    }
  }, [equation, targetNumber, selectedCardIndices, playCards]);
  
  // Evaluate the equation
  useEffect(() => {
    if (equation.length === 0) {
      setResult(null);
      return;
    }
    
    checkWinCondition();
  }, [equation, checkWinCondition]);

  // Add handleCardClick function
  const handleCardClick = useCallback((index) => {
    // If card is already selected, find it in the equation and remove it
    if (selectedCardIndices.includes(index)) {
      // Find the card in the equation
      const cardIndex = equation.findIndex(item => 
        typeof item === 'object' && 
        item.type === 'card' && 
        item.originalIndex === index
      );
      
      if (cardIndex !== -1) {
        // Remove the card from the equation
        const newEquation = equation.filter((_, i) => i !== cardIndex);
        setEquation(newEquation);
        
        // Remove the index from selectedCardIndices
        setSelectedCardIndices(prevIndices => 
          prevIndices.filter(idx => idx !== index)
        );
      }
    } else {
      // If card is not selected, add it to the end of the equation
      const card = playCards[index];
      
      // Create an equation-ready card object
      const cardItem = {
        type: 'card',
        value: card.value,
        gameValue: card.gameValue,
        display: getDisplayValue(card.value),
        originalIndex: index // Store the original index for later removal
      };
      
      // Add the card to the end of the equation
      setEquation([...equation, cardItem]);
      
      // Add the index to selectedCardIndices
      setSelectedCardIndices([...selectedCardIndices, index]);
    }
  }, [equation, selectedCardIndices, playCards, setEquation, setSelectedCardIndices]);

  // Handle operation button click - add to equation
  const handleOperationClick = useCallback((operation) => {
    // Map stylized symbols back to their functional counterparts
    const functionalOperation = (op) => {
      switch (op) {
        case '×': return '×';
        case '÷': return '÷';
        default: return op;
      }
    };

    // Add the operation to the end of the equation
    setEquation([...equation, functionalOperation(operation)]);
  }, [equation, setEquation]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode.toString());
  };
  
  // Apply dark mode to body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // Add keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      
      // Handle Escape key to close modals, regardless of game state
      if (key === 'escape') {
        // Close modals in order of priority
        if (isSolvedModalOpen) {
          setIsSolvedModalOpen(false);
          return;
        }
        if (isInstructionsModalOpen) {
          setIsInstructionsModalOpen(false);
          return;
        }
        if (isWelcomeModalOpen) {
          // Start daily game when escaping from welcome screen
          handleModeSelection('daily');
          return;
        }
      }
      
      // Skip other key handling if any modal is open
      if (isWelcomeModalOpen || isInstructionsModalOpen || isSolvedModalOpen) {
        return;
      }

      // Number keys (0-9)
      if (!isNaN(parseInt(key)) || key === '0') {
        // Find the first available card with the matching number
        const targetValue = key === '0' ? 10 : parseInt(key);
        
        // Look for a card that has that value and is not selected
        const availableCardIndex = playCards.findIndex((card, index) => {
          // For 0 key, match any face card (value > 10) or 10
          const matchesValue = key === '0' 
            ? (card.value === 10 || card.value > 10) 
            : card.value === targetValue;
          
          return matchesValue && !selectedCardIndices.includes(index);
        });
        
        if (availableCardIndex !== -1) {
          handleCardClick(availableCardIndex);
        }
      }
      
      // Face card keys (t, j, q, k)
      else if (key === 't') {
        // Find the first available 10 card
        const availableCardIndex = playCards.findIndex((card, index) => 
          card.value === 10 && !selectedCardIndices.includes(index)
        );
        
        if (availableCardIndex !== -1) {
          handleCardClick(availableCardIndex);
        }
      }
      else if (key === 'j') {
        // Find the first available Jack (11)
        const availableCardIndex = playCards.findIndex((card, index) => 
          card.value === 11 && !selectedCardIndices.includes(index)
        );
        
        if (availableCardIndex !== -1) {
          handleCardClick(availableCardIndex);
        }
      }
      else if (key === 'q') {
        // Find the first available Queen (12)
        const availableCardIndex = playCards.findIndex((card, index) => 
          card.value === 12 && !selectedCardIndices.includes(index)
        );
        
        if (availableCardIndex !== -1) {
          handleCardClick(availableCardIndex);
        }
      }
      else if (key === 'k') {
        // Find the first available King (13)
        const availableCardIndex = playCards.findIndex((card, index) => 
          card.value === 13 && !selectedCardIndices.includes(index)
        );
        
        if (availableCardIndex !== -1) {
          handleCardClick(availableCardIndex);
        }
      }
      
      // Backspace key
      else if (key === 'backspace') {
        handleBackspace();
      }
      
      // Redeal in unlimited mode (r key)
      else if (key === 'r' && gameMode === 'unlimited') {
        redealGame();
      }
      
      // Operation keys
      else if (key === '+') {
        handleOperationClick('+');
      }
      else if (key === '-') {
        handleOperationClick('-');
      }
      else if (key === '*' || key === 'x') {
        handleOperationClick('×');
      }
      else if (key === '/') {
        handleOperationClick('÷');
      }
      else if (key === '(') {
        handleOperationClick('(');
      }
      else if (key === ')') {
        handleOperationClick(')');
      }
    };
    
    // Add event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    playCards, 
    selectedCardIndices, 
    equation, 
    gameMode, 
    isWelcomeModalOpen, 
    isInstructionsModalOpen, 
    isSolvedModalOpen,
    handleCardClick,
    handleBackspace,
    redealGame,
    handleOperationClick,
    setIsWelcomeModalOpen,
    setIsInstructionsModalOpen,
    setIsSolvedModalOpen,
    handleModeSelection
  ]);

  // Add game mode UI to the header
  const renderModeIndicator = () => {
    if (!gameMode) return null;
    
    const handleModeChange = (e) => {
      const newMode = e.target.value;
      if (newMode !== gameMode) {
        setGameMode(newMode);
        localStorage.setItem('gameMode', newMode);
        
        // Start the appropriate game
        if (newMode === 'daily') {
          startDailyGame();
        } else {
          startUnlimitedGame();
        }
      }
    };
    
    return (
      <div className="game-mode-indicator">
        <div className="mode-dropdown-container">
          <select 
            className="mode-dropdown" 
            value={gameMode}
            onChange={handleModeChange}
            aria-label="Select game mode"
          >
            <option value="daily">🗓️ Daily Challenge</option>
            <option value="unlimited">♾️ Unlimited Play</option>
          </select>
          <div className="dropdown-arrow">▼</div>
        </div>
      </div>
    );
  };

  // Add touch event listeners
  useEffect(() => {
    // Touch event handlers
    const handleTouchMove = (e) => {
      if (!dragging) return;
      
      // Prevent the default touchmove action only when dragging
      // This prevents scrolling while dragging but allows normal scrolling otherwise
      e.preventDefault();
      
      // Use the first touch
      const touch = e.touches[0];
      
      // Update the drag ghost position to follow the touch
      setDragPosition({ 
        x: touch.clientX, 
        y: touch.clientY 
      });
      
      // Check if we're over the equation container
      if (equationRef.current) {
        const equationRect = equationRef.current.getBoundingClientRect();
        
        if (
          touch.clientX >= equationRect.left && 
          touch.clientX <= equationRect.right &&
          touch.clientY >= equationRect.top && 
          touch.clientY <= equationRect.bottom
        ) {
          // If touch is over the equation container
          const verticalPos = equationRect.height / 2;
          
          // If equation is empty, center the preview
          if (equation.length === 0) {
            setDropTargetIndex(0);
            setDropPosition({
              left: equationRect.width / 2,
              top: verticalPos
            });
            return;
          }
          
          // Get all equation items
          const items = Array.from(equationRef.current.querySelectorAll('.equation-item:not(.preview-item)'));
          
          if (items.length === 0) {
            setDropTargetIndex(0);
            setDropPosition({
              left: equationRect.width / 2,
              top: verticalPos
            });
            return;
          }
          
          // Find where to insert based on touch position
          let foundPosition = false;
          
          // Check if we should insert at the beginning (before the first item)
          const firstItemRect = items[0].getBoundingClientRect();
          if (touch.clientX < firstItemRect.left - 15) { // Add a bit of buffer space
            setDropTargetIndex(0);
            // Place at the beginning with more space to prevent overlap
            setDropPosition({
              left: firstItemRect.left - equationRect.left - 40,
              top: verticalPos
            });
            foundPosition = true;
          } 
          // Check if we should insert at the end (after the last item)
          else {
            const lastItemRect = items[items.length - 1].getBoundingClientRect();
            if (touch.clientX > lastItemRect.right + 15) {
              setDropTargetIndex(equation.length);
              setDropPosition({
                left: lastItemRect.right - equationRect.left + 40,
                top: verticalPos
              });
              foundPosition = true;
            }
          }
          
          // If not at beginning or end, find position between items
          if (!foundPosition) {
            for (let i = 0; i < items.length - 1; i++) {
              const currentRect = items[i].getBoundingClientRect();
              const nextRect = items[i + 1].getBoundingClientRect();
              
              // Calculate the gap between items
              const gapStart = currentRect.right;
              const gapEnd = nextRect.left;
              
              if (touch.clientX >= gapStart && touch.clientX <= gapEnd) {
                // Position is between these two items
                setDropTargetIndex(i + 1);
                setDropPosition({
                  left: (currentRect.right - equationRect.left + nextRect.left - equationRect.left) / 2,
                  top: verticalPos
                });
                foundPosition = true;
                break;
              }
            }
          }
          
          // If we determined a drop position, show the preview
          if (foundPosition) {
            setShowDragPreview(true);
          } else {
            setShowDragPreview(false);
            setDropTargetIndex(null);
          }
        } else {
          // Not over equation, hide preview
          setShowDragPreview(false);
          setDropTargetIndex(null);
          
          // Check if we're over the trash
          const trashElem = document.querySelector('.trash-can');
          if (trashElem) {
            const trashRect = trashElem.getBoundingClientRect();
            if (
              touch.clientX >= trashRect.left &&
              touch.clientX <= trashRect.right &&
              touch.clientY >= trashRect.top &&
              touch.clientY <= trashRect.bottom
            ) {
              setDragTrashActive(true);
            } else {
              setDragTrashActive(false);
            }
          }
        }
      }
    };

    const handleTouchEnd = (e) => {
      if (!dragging) return;
      
      // We'll create a synthetic mouse event with the last touch position
      let lastTouch = null;
      if (e.changedTouches && e.changedTouches.length > 0) {
        lastTouch = e.changedTouches[0];
      }
      
      if (!lastTouch && dragPosition) {
        // If we don't have a touch but have a drag position, use that
        lastTouch = { clientX: dragPosition.x, clientY: dragPosition.y };
      }
      
      if (lastTouch) {
        // Create a synthetic mouse event
        const syntheticEvent = {
          clientX: lastTouch.clientX,
          clientY: lastTouch.clientY,
          preventDefault: () => {},
          stopPropagation: () => {}
        };
        
        // Use the existing mouse up handler
        handleMouseUp(syntheticEvent);
      } else {
        // Fallback - reset drag state
        setDragging(false);
        setDraggedItem(null);
        setDraggedType(null);
        setDragPosition(null);
        setDragOffset({ x: 0, y: 0 });
        setDropTargetIndex(null);
        setShowDragPreview(false);
        setDragTrashActive(false);
      }
    };

    // Add the touch event listeners with passive: false to allow preventDefault()
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    
    // Cleanup
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragging, dragPosition, equation, handleMouseUp]);

  return (
    <div className={`game-container ${darkMode ? 'dark-mode' : ''}`}>
      {/* Header Row with Dark Mode Toggle and Navigation */}
      <div className="header-row">
        <h1 className="game-title">24++</h1>
        
        {renderModeIndicator()}
        
        <div className="header-buttons">
          <button 
            className="instructions-button"
            onClick={() => setIsInstructionsModalOpen(true)}
            title="How to Play"
          >
            <span className="instructions-icon">❓</span>
          </button>
          
          <button 
            className="theme-toggle" 
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </div>
      
      {/* Win sound effect - temporarily commented out */}
      {/* <audio ref={winSoundRef} src="https://assets.mixkit.co/sfx/preview/mixkit-animated-small-group-applause-523.mp3" preload="auto"></audio> */}
      
      {/* Goal Section */}
      <div className="target-number-display">
        <p className="game-message">{message}</p>
        <div className="target-cards">
          {gameMode !== 'daily' && (
            <div 
              className="card face-down-card"
              onClick={redealGame}
              title="Redeal cards"
            >
              <div className="card-back-pattern"></div>
              <div className="redeal-text">REDEAL</div>
            </div>
          )}
          {targetCards.map((card, index) => (
            <div 
              key={`target-${index}`}
              className="card"
              style={{ color: card.suit === '♥' || card.suit === '♦' ? 'red' : 'black' }}
            >
              <div className="card-corner top-left">
                <div className="card-value">{getDisplayValue(card.value)}</div>
                <div className="card-suit">{card.suit}</div>
              </div>
              <div className="card-center-suit">{card.suit}</div>
              <div className="card-corner bottom-right">
                <div className="card-value">{getDisplayValue(card.value)}</div>
                <div className="card-suit">{card.suit}</div>
              </div>
            </div>
          ))}
        </div>
        <h2 data-number={targetNumber}>Goal: <span>{targetNumber}</span></h2>
      </div>
      
      {/* Play Cards Section */}
      <div className="play-cards-section">
        <h3>Your Cards</h3>
        <div className="cards-container">
          {playCards.map((card, index) => (
            <div 
              key={index}
              className={`card ${selectedCardIndices.includes(index) ? 'selected' : ''}`}
              onMouseDown={(e) => !selectedCardIndices.includes(index) && handleDragStart('card', card, index, e)}
              onClick={() => handleCardClick(index)}
              style={{ color: card.suit === '♥' || card.suit === '♦' ? 'red' : 'black' }}
            >
              <div className="card-corner top-left">
                <div className="card-value">{getDisplayValue(card.value)}</div>
                <div className="card-suit">{card.suit}</div>
              </div>
              <div className="card-center-suit">{card.suit}</div>
              <div className="card-corner bottom-right">
                <div className="card-value">{getDisplayValue(card.value)}</div>
                <div className="card-suit">{card.suit}</div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Operations Row - Now inside the play cards section */}
        <div className="operations-row">
          <h3>Operations</h3>
          <div className="operations-container">
            {OPERATIONS.map((op, index) => (
              <button 
                key={index}
                className="operation-button"
                onMouseDown={(e) => handleDragStart('operation', op, null, e)}
                onClick={() => handleOperationClick(op)}
              >
                {op}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Operations and Equation Row - Now just Equation Row */}
      <div className="operations-equation-row">
        {/* Equation Display */}
        <div className="equation-display">
          <h3>Your Equation</h3>
          <div 
            className="equation" 
            ref={equationRef}
          >
            {equation.length === 0 && (!dragging || dropTargetIndex === null) ? (
              <div className="empty-equation">Drag cards and operations here...</div>
            ) : (
              equation.map((item, index) => {
                let itemClass = '';
                let displayValue = item;
                
                if (typeof item === 'object' && item.type === 'card') {
                  itemClass = 'number';
                  displayValue = item.display;
                } else if (typeof item === 'string') {
                  if (item === '(' || item === ')') {
                    itemClass = `parenthesis ${unmatchedParenIndices.has(index) ? 'unmatched' : ''}`;
                  } else {
                    itemClass = 'operation';
                  }
                }
                
                // Add dynamic shifting style for items when dragging
                let shiftStyle = {};
                if (dragging && dropTargetIndex !== null) {
                  // Only shift items if we're not inserting at the beginning
                  if (index >= dropTargetIndex && dropTargetIndex > 0) {
                    // Calculate shift amount based on the type of dragged item
                    let shiftAmount;
                    
                    if (draggedType === 'card') {
                      shiftAmount = 45; // Balanced card spacing
                    } else if (draggedType === 'operation' && (draggedItem === '(' || draggedItem === ')')) {
                      shiftAmount = 25; // Balanced parentheses spacing
                    } else {
                      shiftAmount = 35; // Balanced operation spacing
                    }
                    
                    shiftStyle = { 
                      transform: `translateX(${shiftAmount}px)`,
                      transition: 'transform 0.15s ease-out'
                    };
                  }
                }
                
                return (
                  <span
                    key={index} 
                    className={`equation-item ${itemClass}`}
                    style={shiftStyle}
                    onMouseDown={(e) => handleDragStart('equation-item', item, index, e)}
                    onClick={() => handleRemoveEquationItem(index)}
                  >
                    {displayValue}
                  </span>
                );
              })
            )}
            
            {/* Drop Preview Element */}
            {dropTargetIndex !== null && dragging && dropPosition && (
              <div 
                className="drop-preview-container"
                style={{
                  position: 'absolute',
                  left: `${dropPosition.left}px`,
                  top: `${dropPosition.top}px`,
                  pointerEvents: 'none',
                  zIndex: 10 // Ensure preview appears above shifted items
                }}
              >
                <DropPreview 
                  type={draggedType} 
                  item={draggedItem} 
                  dropIndex={dropTargetIndex} 
                />
              </div>
            )}
          </div>
          
          <div className={`result ${result === targetNumber ? 'correct' : 'incorrect'}`}>
            {result !== null ? `= ${result}` : '= ?'}
          </div>
          <div className="action-buttons">
            <button 
              onClick={handleBackspace}
              title="Backspace"
              aria-label="Remove last item"
              className="backspace-button"
            >
              ⌫
            </button>
            <button 
              onClick={clearEquation}
              title="Clear all"
              aria-label="Clear equation"
              className="trash-button"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
      
      {/* Drag Ghost Element */}
      {dragging && dragPosition && (
        <DragGhost 
          type={draggedType}
          item={draggedItem}
          position={dragPosition}
        />
      )}

      {/* Credits */}
      <div className="credits">
        Created by <a href="https://cmxu.io" target="_blank" rel="noopener noreferrer">Calvin Xu</a> and <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer">Claude</a>. V1.1 - Mobile optimizations coming soon!
      </div>

      {/* Confetti overlay - repositioned to render on top of modals */}
      <Confetti active={hasWon} />

      {/* Welcome Modal - render first (lowest in stack) */}
      <WelcomeModal 
        isOpen={isWelcomeModalOpen}
        onClose={() => setIsWelcomeModalOpen(false)}
        onSelectMode={handleModeSelection}
        onShowInstructions={() => setIsInstructionsModalOpen(true)}
      />
      
      {/* Instructions Modal - render last (highest in stack) */}
      <InstructionsModal 
        isOpen={isInstructionsModalOpen}
        onClose={() => setIsInstructionsModalOpen(false)}
      />
      
      {/* Solved Modal */}
      <SolvedModal 
        isOpen={isSolvedModalOpen}
        onClose={() => setIsSolvedModalOpen(false)}
        targetNumber={targetNumber}
        equation={equation}
        onRedeal={redealGame}
        gameMode={gameMode}
        onPlayUnlimited={() => {
          // Close the solved modal
          setIsSolvedModalOpen(false);
          // Switch to unlimited mode
          handleModeSelection('unlimited');
        }}
      />
    </div>
  );
};

export default Game;