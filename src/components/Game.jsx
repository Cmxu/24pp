import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Parser } from 'expr-eval';
import './Game.css';

// Instead of loading solvable.json, we'll load compressed_solvable.json
let compressedSolvableData = null;
// For the classic 24 game mode
let solvable24Data = null;

// Load the compressed solvable data asynchronously
const loadSolvableData = async () => {
  try {
    // Dynamic import of the compressed JSON file
    const response = await fetch('/compressed_solvable.json');
    if (!response.ok) {
      throw new Error(`Failed to load compressed_solvable.json: ${response.status} ${response.statusText}`);
    }
    compressedSolvableData = await response.json();
    console.log('Compressed solvable data loaded successfully');
  } catch (error) {
    console.error('Error loading compressed solvable data:', error);
  }
};

// Load solvable combinations for the classic 24 game
const loadSolvable24Data = async () => {
  try {
    // Import the solvable 24 combinations
    const response = await fetch('/solvable_24.json');
    if (!response.ok) {
      throw new Error(`Failed to load solvable_24.json: ${response.status} ${response.statusText}`);
    }
    solvable24Data = await response.json();
    console.log('Solvable 24 data loaded successfully');
  } catch (error) {
    console.error('Error loading solvable 24 data:', error);
  }
};

// Call these functions early to start loading the data
loadSolvableData();
loadSolvable24Data();

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

// Encode a key list (sorted hand of 7 cards) into the compressed format
const encodeKey = (keyList) => {
  const counts = Array(9).fill(0);
  for (const num of keyList) {
    if (num >= 1 && num <= 9) {
      counts[num - 1]++;
    }
  }
  
  // Convert counts to a 27-bit string (3 bits per number for 9 numbers)
  let bitStr = '';
  for (const count of counts) {
    bitStr += count.toString(2).padStart(3, '0');
  }
  
  // Convert bit string to number
  const num = parseInt(bitStr, 2);
  
  // Convert to bytes and then to base64
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, num);
  
  // Create a byte array from the buffer
  const bytes = new Uint8Array(buffer);
  
  // Convert to base64
  return btoa(String.fromCharCode.apply(null, bytes));
};

// Check if a target number is in the encoded value bit array
const isTargetInEncodedValue = (encodedValue, targetNumber, possibleValues) => {
  try {
    // Decode base64 to bytes
    const binaryString = atob(encodedValue);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Find the index of the target in possible values
    const targetIndex = possibleValues.indexOf(targetNumber);
    if (targetIndex === -1) {
      console.log(`Target ${targetNumber} not found in possible values`);
      return false;
    }
    
    // Determine which byte and bit position to check
    const byteIndex = Math.floor(targetIndex / 8);
    const bitPosition = 7 - (targetIndex % 8); // Bits are stored MSB first
    
    // Check if the specific bit is set
    const result = (bytes[byteIndex] & (1 << bitPosition)) !== 0;
    console.log(`Checking if target ${targetNumber} is solvable: ${result}`);
    return result;
  } catch (error) {
    console.error("Error checking if target is in encoded value:", error);
    return false;
  }
};

// Generate all possible values (targets from 100 to 999, no zeros)
const generatePossibleValues = () => {
  const result = [];
  for (let i = 100; i < 1000; i++) {
    if (!i.toString().includes('0')) {
      result.push(i);
    }
  }
  return result;
};

// Cached possible values
const possibleValues = generatePossibleValues();

// Check if a game with given cards and target is solvable
const isGameSolvable = (playCards, targetNumber) => {
  try {
    // If compressed solvable data hasn't loaded yet, assume the game is solvable
    if (!compressedSolvableData) {
      console.warn('Compressed solvable data not loaded yet, assuming game is solvable');
      return true;
    }

    // Sort the gameValues to prepare for encoding
    const sortedCardValues = playCards.map(card => card.gameValue).sort((a, b) => a - b);
    console.log('Sorted card values:', sortedCardValues);
    
    // Encode the key
    const encodedKey = encodeKey(sortedCardValues);
    console.log('Encoded key:', encodedKey);
    
    // Check if the encoded key exists in the compressed data
    if (compressedSolvableData[encodedKey]) {
      console.log('Key found in compressed data');
      // Check if the target is in the encoded value
      return isTargetInEncodedValue(
        compressedSolvableData[encodedKey], 
        targetNumber, 
        possibleValues
      );
    } else {
      console.log('Key not found in compressed data');
    }
    
    return false;
  } catch (error) {
    console.error("Error checking if game is solvable:", error, {
      playCards,
      targetNumber
    });
    // If there's an error, return true to prevent infinite loops
    return true;
  }
};

// Check if a 24 game hand is solvable
const is24GameSolvable = (playCards) => {
  try {
    // If solvable24Data hasn't loaded yet, assume the game is solvable
    if (!solvable24Data) {
      console.warn('Solvable 24 data not loaded yet, assuming game is solvable');
      return true;
    }

    // Sort the gameValues to check against the list of solvable hands
    const sortedCardValues = playCards.map(card => card.gameValue).sort((a, b) => a - b);
    console.log('Sorted card values for 24 game:', sortedCardValues);
    
    // Check if this hand exists in our list of solvable hands
    return solvable24Data.some(hand => 
      hand.length === sortedCardValues.length && 
      hand.every((val, idx) => val === sortedCardValues[idx])
    );
  } catch (error) {
    console.error("Error checking if 24 game is solvable:", error, {
      playCards
    });
    // If there's an error, return true to prevent infinite loops
    return true;
  }
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
  const [isTouchClick, setIsTouchClick] = useState(false);
  
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

  // Add click handler for card selection
  const handleClick = (e) => {
    // If this was triggered by a touch event that we're handling separately, ignore
    if (isTouchClick) {
      setIsTouchClick(false);
      return;
    }
    
    if (window.game && typeof window.game.handleCardClick === 'function') {
      // Pass the card and index to the handleCardClick function
      window.game.handleCardClick(index, card);
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
    
    let touchStartTime = 0;
    let touchMoved = false;
    let initialTouch = null;
    
    const handleTouchStart = (e) => {
      if (isSelected) return; // Already used, can't drag
      
      // Don't immediately prevent default, so we can detect clicks
      
      // Record touch start time and reset moved flag
      touchStartTime = Date.now();
      touchMoved = false;
      initialTouch = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    };
    
    const handleTouchMove = (e) => {
      if (isSelected) return;
      
      // Calculate distance moved
      if (initialTouch) {
        const dx = e.touches[0].clientX - initialTouch.x;
        const dy = e.touches[0].clientY - initialTouch.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If we've moved significantly, it's a drag
        if (distance > 10) {
          touchMoved = true;
          e.preventDefault(); // Now prevent default to stop scrolling
          
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
        }
      }
    };
    
    const handleTouchEnd = (e) => {
      if (isSelected) return;
      
      // If touch duration was short and didn't move much, it's a tap
      const touchDuration = Date.now() - touchStartTime;
      
      if (!touchMoved && touchDuration < 300) {
        setIsTouchClick(true);
        // It's a tap/click, handle it as a click
        if (window.game && typeof window.game.handleCardClick === 'function') {
          window.game.handleCardClick(index);
        }
      }
    };
    
    // Add the event listeners with passive: false to allow preventDefault()
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    // Clean up
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [card, index, isSelected, onDragStart]);

  return (
    <div 
      ref={cardRef}
      className={`card ${isSelected ? 'selected' : ''}`}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
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
  const [isTouchClick, setIsTouchClick] = useState(false);
  
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
  
  // Add click handler for operation selection
  const handleClick = (e) => {
    // If this was triggered by a touch event that we're handling separately, ignore
    if (isTouchClick) {
      setIsTouchClick(false);
      return;
    }
    
    if (window.game && typeof window.game.handleOperationClick === 'function') {
      window.game.handleOperationClick(operation);
    }
  };
  
  // Add touch event listeners using refs instead of props
  useEffect(() => {
    const element = operationRef.current;
    if (!element) return;
    
    let touchStartTime = 0;
    let touchMoved = false;
    let initialTouch = null;
    
    const handleTouchStart = (e) => {
      // Don't immediately prevent default, so we can detect clicks
      
      // Record touch start time and reset moved flag
      touchStartTime = Date.now();
      touchMoved = false;
      initialTouch = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    };
    
    const handleTouchMove = (e) => {
      // Calculate distance moved
      if (initialTouch) {
        const dx = e.touches[0].clientX - initialTouch.x;
        const dy = e.touches[0].clientY - initialTouch.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If we've moved significantly, it's a drag
        if (distance > 10) {
          touchMoved = true;
          e.preventDefault(); // Now prevent default to stop scrolling
          
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
        }
      }
    };
    
    const handleTouchEnd = (e) => {
      // If touch duration was short and didn't move much, it's a tap
      const touchDuration = Date.now() - touchStartTime;
      
      if (!touchMoved && touchDuration < 300) {
        setIsTouchClick(true);
        // It's a tap/click, handle it as a click
        if (window.game && typeof window.game.handleOperationClick === 'function') {
          window.game.handleOperationClick(operation);
        }
      }
    };
    
    // Add the event listeners with passive: false to allow preventDefault()
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    // Clean up
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
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
      onClick={handleClick}
    >
      {operation}
    </button>
  );
};

// Equation Item Component (can be dragged)
const EquationItem = ({ item, index, onDragStart, onClick }) => {
  const itemRef = useRef(null);
  const [isTouchClick, setIsTouchClick] = useState(false);
  
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
  
  const handleClick = (e) => {
    // If this was triggered by a touch event that we're handling separately, ignore
    if (isTouchClick) {
      setIsTouchClick(false);
      return;
    }
    
    // Regular click handler
    if (onClick) {
      onClick(index);
    }
  };
  
  // Add touch event listeners using refs instead of props
  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;
    
    let touchStartTime = 0;
    let touchMoved = false;
    let initialTouch = null;
    
    const handleTouchStart = (e) => {
      // Don't immediately prevent default to allow clicks
      
      // Record touch start time and reset moved flag
      touchStartTime = Date.now();
      touchMoved = false;
      initialTouch = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    };
    
    const handleTouchMove = (e) => {
      // Calculate distance moved
      if (initialTouch) {
        const dx = e.touches[0].clientX - initialTouch.x;
        const dy = e.touches[0].clientY - initialTouch.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If we've moved significantly, it's a drag
        if (distance > 10) {
          touchMoved = true;
          e.preventDefault(); // Now prevent default to stop scrolling
          
          const touch = e.touches[0];
          const rect = element.getBoundingClientRect();
          const offsetX = touch.clientX - rect.left;
          const offsetY = touch.clientY - rect.top;
          
          // Call drag start but also pass the index in the equation
          onDragStart(item, index, 'equation-item', touch.clientX, touch.clientY, offsetX, offsetY, index);
        }
      }
    };
    
    const handleTouchEnd = (e) => {
      // If touch duration was short and didn't move much, it's a tap
      const touchDuration = Date.now() - touchStartTime;
      
      if (!touchMoved && touchDuration < 300) {
        setIsTouchClick(true);
        // It's a tap/click, handle it as a click
        if (onClick) {
          onClick(index);
        }
      }
    };
    
    // Add the event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    // Clean up
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [item, index, onDragStart, onClick]);
  
  return (
    <span 
      ref={itemRef}
      className={`equation-item ${itemClass}`}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
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
        <h2>How to Play</h2>
        
        <div className="instructions-content">
          <section className="intro-section">
            <h3>Choose Your Game Type</h3>
            <p>You can switch between two game variants using the toggle in the header:</p>
            <div className="game-types">
              <div className="game-type">
                <h4>24 (Classic)</h4>
                <p>Draw 4 cards and use all of them to make 24 using the four basic operations.</p>
              </div>
              <div className="game-type">
                <h4>24++</h4>
                <p>A more challenging version where you use 7 cards to make a 3-digit target number.</p>
              </div>
            </div>
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
const SolvedModal = ({ isOpen, onClose, targetNumber, equation, onRedeal, gameMode, gameType, onPlayUnlimited }) => {
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

  // Get the target number based on game type
  const displayTarget = gameType === '24++' ? targetNumber : 24;

  // Convert equation to plain text
  const getEquationText = () => {
    return equation.map(item => {
      if (typeof item === 'object' && item.type === 'card') {
        return item.gameValue;
      } else if (typeof item === 'string') {
        if (item === '×') return '×';
        if (item === '÷') return '÷';
        return item;
      }
      return item;
    }).join(' ') + ' = ' + displayTarget;
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
      return `I completed the daily ${gameType} on ${formatTodayDate()} in ${countOperations()} operations!`;
    }
    return `I solved a ${gameType} puzzle using ${countOperations()} operations!`;
  };

  // Copy completion message to clipboard
  const copyToClipboard = () => {
    const message = getCompletionMessage();
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message)
        .then(() => {
          alert("Copied to clipboard!");
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
          alert("Couldn't copy to clipboard. Please copy manually.");
        });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      alert("Copied to clipboard!");
    }
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
                {equation.map(item => {
                  if (typeof item === 'object' && item.type === 'card') {
                    return item.display;
                  } else if (item === '×' || item === '÷' || item === '+' || item === '-' || item === '(' || item === ')') {
                    return ` ${item} `;
                  }
                  return item;
                }).join('')} = {gameType === '24++' ? targetNumber : 24}
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

// Settings Modal Component
const SettingsModal = ({ isOpen, onClose, darkMode, toggleDarkMode, gameType, toggleGameType }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target.className === 'modal-overlay') {
        onClose();
      }
    }}>
      <div className="modal-content settings-modal">
        <h2>Settings</h2>
        
        <div className="settings-content">
          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-icon">{darkMode ? "🌙" : "☀️"}</span>
              <span className="setting-name">Dark Mode</span>
            </div>
            <div className="setting-control">
              <div className="tooltip-container">
                <button 
                  className={`settings-switch ${darkMode ? 'active' : ''}`}
                  onClick={toggleDarkMode}
                  aria-label="Toggle dark mode"
                >
                  <span className="switch-text left">Off</span>
                  <span className="switch-text right">On</span>
                </button>
                <div className="settings-tooltip">
                  {darkMode ? "Switch to light mode" : "Switch to dark mode"}
                </div>
              </div>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-icon">🎮</span>
              <span className="setting-name">Game Mode</span>
              <span className="setting-description">Choose your game mode</span>
            </div>
            <div className="setting-control">
              <div className="tooltip-container">
                <button 
                  className={`settings-switch ${gameType === '24' ? 'active' : ''}`}
                  onClick={toggleGameType}
                  aria-label="Toggle game type"
                >
                  <span className="switch-text left">24++</span>
                  <span className="switch-text right">24</span>
                </button>
                <div className="settings-tooltip">
                  {gameType === '24' ? 
                    "Switch to 24++" : 
                    "Switch to 24"}
                </div>
              </div>
            </div>
          </div>
          
          <div className="game-mode-description">
            <h3>Game Modes Explained:</h3>
            <div className="mode-explanation-container">
              <div className={`mode-explanation ${gameType !== '24' ? 'active' : ''}`}>
                <h4>24++</h4>
                <p>In 24++, your goal is to create is to create expressions that equal a given three digit number using the seven given cards and mathematical operations.</p>
              </div>
              <div className={`mode-explanation ${gameType === '24' ? 'active' : ''}`}>
                <h4>Classic 24</h4>
                <p>In the classic 24, your goal is to create expressions that equal exactly 24 using the four given cards and mathematical operations.</p>
              </div>
            </div>
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
  const [gameType, setGameType] = useState('24++'); // New state for game type (24 or 24++)
  
  // UI state
  const [showDragPreview, setShowDragPreview] = useState(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(true);
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
  const [isSolvedModalOpen, setIsSolvedModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
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

  // Toggle game type between 24 and 24++
  const toggleGameType = useCallback(() => {
    const newGameType = gameType === '24++' ? '24' : '24++';
    
    // Reset game state first to avoid state conflicts
    setPlayCards([]);
    setTargetCards([]);
    setEquation([]);
    setSelectedCardIndices([]);
    setResult(null);
    
    // Then update the game type
    setGameType(newGameType);
    localStorage.setItem('gameType', newGameType);
    
    // Create a fresh copy of the game-starting functions to use the updated gameType
    const startFreshGame = () => {
      if (gameMode === 'daily') {
        // Create a new daily game with the new game type
        let deck, targetCards, remainingDeck, drawnCards, target;
        let isSolvable = false;
        let attempts = 0;
        const maxAttempts = 10;
        
        if (newGameType === '24++') {
          // 24++ game logic
          while (!isSolvable && attempts < maxAttempts) {
            attempts++;
            const dailySeed = getDailySeed() + attempts;
            
            // Create and shuffle deck with seed
            deck = createDeck();
            deck = shuffleDeck(deck, true, dailySeed);
            
            // Generate target cards (values 1-9 only)
            const targetResult = generateTargetCards(deck);
            targetCards = targetResult.targetCards;
            remainingDeck = targetResult.remainingDeck;
            
            // Calculate target number (3-digit number from the 3 target cards)
            target = parseInt(targetCards.map(card => card.gameValue).join(''));
            
            // Deal play cards (remaining 7 cards)
            const cardsResult = drawCards(remainingDeck, 7);
            drawnCards = cardsResult.drawnCards;
            
            // Check if the game is solvable
            isSolvable = isGameSolvable(drawnCards, target);
          }
          
          // Set the game state
          setTargetCards(targetCards);
          setTargetNumber(target);
          setPlayCards(drawnCards);
          setMessage('Daily Challenge: Use all 7 cards and operations to create the goal number!');
        } else {
          // 24 game logic
          while (!isSolvable && attempts < maxAttempts) {
            attempts++;
            const dailySeed = getDailySeed() + attempts;
            
            // Create and shuffle deck with seed
            deck = createDeck();
            // For the classic 24 game, filter out face cards
            const filteredDeck = deck.filter(card => card.value <= 10);
            deck = shuffleDeck(filteredDeck, true, dailySeed);
            
            // Deal 4 cards
            const cardsResult = drawCards(deck, 4);
            drawnCards = cardsResult.drawnCards;
            
            // Check if the game is solvable
            isSolvable = is24GameSolvable(drawnCards);
          }
          
          // Set the game state
          setTargetCards([]);
          setTargetNumber(24);
          setPlayCards(drawnCards);
          setMessage('Daily Challenge (24): Use all 4 cards and operations to make 24!');
        }
        
        setHasWon(false);
        localStorage.setItem('lastDailyDate', new Date().toDateString());
      } else {
        // Create a new unlimited game with the new game type
        let deck, targetCards, remainingDeck, drawnCards, target;
        let isSolvable = false;
        let attempts = 0;
        const maxAttempts = 10;
        
        if (newGameType === '24++') {
          // 24++ game logic
          while (!isSolvable && attempts < maxAttempts) {
            attempts++;
            
            // Create and shuffle deck
            deck = createDeck();
            deck = shuffleDeck(deck);
            
            // Generate target cards
            const targetResult = generateTargetCards(deck);
            targetCards = targetResult.targetCards;
            remainingDeck = targetResult.remainingDeck;
            
            // Calculate target number
            target = parseInt(targetCards.map(card => card.gameValue).join(''));
            
            // Deal play cards
            const cardsResult = drawCards(remainingDeck, 7);
            drawnCards = cardsResult.drawnCards;
            
            // Check if solvable
            isSolvable = isGameSolvable(drawnCards, target);
          }
          
          // Set game state
          setTargetCards(targetCards);
          setTargetNumber(target);
          setPlayCards(drawnCards);
          setMessage('Unlimited Mode: Make the target number with any combination of cards and operations!');
        } else {
          // 24 game logic
          while (!isSolvable && attempts < maxAttempts) {
            attempts++;
            
            // Create and shuffle deck
            deck = createDeck();
            const filteredDeck = deck.filter(card => card.value <= 10);
            deck = shuffleDeck(filteredDeck);
            
            // Deal 4 cards
            const cardsResult = drawCards(deck, 4);
            drawnCards = cardsResult.drawnCards;
            
            // Check if solvable
            isSolvable = is24GameSolvable(drawnCards);
          }
          
          // Set game state
          setTargetCards([]);
          setTargetNumber(24);
          setPlayCards(drawnCards);
          setMessage('Unlimited Mode (24): Use all 4 cards and operations to make 24!');
        }
        
        setHasWon(false);
      }
    };
    
    // Start fresh game with short delay
    setTimeout(startFreshGame, 50);
  }, [gameType, gameMode]);

  // Load game mode and type from localStorage and start the appropriate game
  useEffect(() => {
    const savedGameType = localStorage.getItem('gameType');
    // Only use the saved type if it's a valid option, otherwise default to '24++'
    const initialGameType = (savedGameType === '24' || savedGameType === '24++') ? savedGameType : '24++';
    setGameType(initialGameType);
    
    if (!savedGameType || savedGameType !== initialGameType) {
      localStorage.setItem('gameType', initialGameType);
    }
    
    // Check if we have a saved game mode
    const savedGameMode = localStorage.getItem('gameMode');
    if (savedGameMode) {
      setGameMode(savedGameMode);
      
      // Start the game with the appropriate mode and type
      if (savedGameMode === 'daily') {
        const lastDailyDate = localStorage.getItem('lastDailyDate');
        const today = new Date().toDateString();
        
        // Check if we've already played today's daily challenge
        if (lastDailyDate === today) {
          setDailyPlayed(true);
        }
        
        // Wait for game type to be set before starting the game
        setTimeout(() => {
          startDailyGame();
        }, 100);
      } else {
        // Wait for game type to be set before starting the game
        setTimeout(() => {
          startUnlimitedGame();
        }, 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // We're intentionally not including startDailyGame and startUnlimitedGame in the dependencies
    // because this effect should only run once on mount
  }, []);
  
  // Start a daily game with seeded randomness
  const startDailyGame = useCallback(() => {
    let deck, targetCards, remainingDeck, drawnCards, target;
    let isSolvable = false;
    let attempts = 0;
    const maxAttempts = 10; // Limit the number of attempts to prevent infinite loops
    
    if (gameType === '24++') {
      // Original 24++ game logic
      while (!isSolvable && attempts < maxAttempts) {
        attempts++;
        const dailySeed = getDailySeed() + attempts; // Modify seed slightly for each attempt
        
        // Create and shuffle deck with seed
        deck = createDeck();
        deck = shuffleDeck(deck, true, dailySeed);
        
        // Generate target cards (values 1-9 only)
        const targetResult = generateTargetCards(deck);
        targetCards = targetResult.targetCards;
        remainingDeck = targetResult.remainingDeck;
        
        // Calculate target number (3-digit number from the 3 target cards)
        target = parseInt(targetCards.map(card => card.gameValue).join(''));
        
        // Deal play cards (remaining 7 cards)
        const cardsResult = drawCards(remainingDeck, 7);
        drawnCards = cardsResult.drawnCards;
        
        // Check if the game is solvable
        isSolvable = isGameSolvable(drawnCards, target);
        
        if (isSolvable) {
          console.log(`Found solvable daily game after ${attempts} attempt(s). Target: ${target}`);
        } else if (attempts < maxAttempts) {
          console.log(`Daily game attempt ${attempts} with target ${target} is not solvable with ${drawnCards.map(card => card.gameValue).join(', ')}. Trying again...`);
        }
      }
      
      // If we couldn't find a solvable game after maxAttempts, use the last generated one anyway
      if (!isSolvable) {
        console.warn(`Could not find a solvable daily game after ${maxAttempts} attempts. Using the last generated game.`);
      }
      
      // Set the game state with the solvable game
      setTargetCards(targetCards);
      setTargetNumber(target);
      setPlayCards(drawnCards);
      
      // Reset game state
      setSelectedCardIndices([]);
      setEquation([]);
      setResult(null);
      setMessage('Daily Challenge: Use all 7 cards and operations to create the goal number!');
      setHasWon(false);
    } else {
      // Classic 24 game logic
      while (!isSolvable && attempts < maxAttempts) {
        attempts++;
        const dailySeed = getDailySeed() + attempts; // Modify seed slightly for each attempt
        
        // Create and shuffle deck with seed
        deck = createDeck();
        // For the classic 24 game, filter out face cards
        const filteredDeck = deck.filter(card => card.value <= 10);
        deck = shuffleDeck(filteredDeck, true, dailySeed);
        
        // Deal 4 cards
        const cardsResult = drawCards(deck, 4);
        drawnCards = cardsResult.drawnCards;
        
        // Check if the game is solvable
        isSolvable = is24GameSolvable(drawnCards);
        
        if (isSolvable) {
          console.log(`Found solvable daily 24 game after ${attempts} attempt(s).`);
        } else if (attempts < maxAttempts) {
          console.log(`Daily 24 game attempt ${attempts} is not solvable with ${drawnCards.map(card => card.gameValue).join(', ')}. Trying again...`);
        }
      }
      
      // If we couldn't find a solvable game after maxAttempts, use the last generated one anyway
      if (!isSolvable) {
        console.warn(`Could not find a solvable daily 24 game after ${maxAttempts} attempts. Using the last generated game.`);
      }
      
      // Set the game state with the solvable game
      setTargetCards([]);
      setTargetNumber(24);
      setPlayCards(drawnCards);
      
      // Reset game state
      setSelectedCardIndices([]);
      setEquation([]);
      setResult(null);
      setMessage('Daily Challenge (24): Use all 4 cards and operations to make 24!');
      setHasWon(false);
    }
    
    // Save today's date
    localStorage.setItem('lastDailyDate', new Date().toDateString());
  }, [gameType]);
  
  // Start an unlimited game (random)
  const startUnlimitedGame = useCallback(() => {
    let deck, targetCards, remainingDeck, drawnCards, target;
    let isSolvable = false;
    let attempts = 0;
    const maxAttempts = 10; // Limit the number of attempts to prevent infinite loops
    
    if (gameType === '24++') {
      // Original 24++ game logic
      while (!isSolvable && attempts < maxAttempts) {
        attempts++;
        
        // Create and shuffle deck randomly
        deck = createDeck();
        deck = shuffleDeck(deck);
        
        // Generate target cards (values 1-9 only)
        const targetResult = generateTargetCards(deck);
        targetCards = targetResult.targetCards;
        remainingDeck = targetResult.remainingDeck;
        
        // Calculate target number (3-digit number from the 3 target cards)
        target = parseInt(targetCards.map(card => card.gameValue).join(''));
        
        // Deal play cards (remaining 7 cards)
        const cardsResult = drawCards(remainingDeck, 7);
        drawnCards = cardsResult.drawnCards;
        
        // Check if the game is solvable
        isSolvable = isGameSolvable(drawnCards, target);
        
        if (isSolvable) {
          console.log(`Found solvable unlimited game after ${attempts} attempt(s). Target: ${target}`);
        } else if (attempts < maxAttempts) {
          console.log(`Unlimited game attempt ${attempts} with target ${target} is not solvable with ${drawnCards.map(card => card.gameValue).join(', ')}. Trying again...`);
        }
      }
      
      // If we couldn't find a solvable game after maxAttempts, use the last generated one anyway
      if (!isSolvable) {
        console.warn(`Could not find a solvable unlimited game after ${maxAttempts} attempts. Using the last generated game.`);
      }
      
      // Set the game state with the solvable game
      setTargetCards(targetCards);
      setTargetNumber(target);
      setPlayCards(drawnCards);
      
      // Reset game state
      setSelectedCardIndices([]);
      setEquation([]);
      setResult(null);
      setMessage('Unlimited Mode: Make the target number with any combination of cards and operations!');
      setHasWon(false);
    } else {
      // Classic 24 game logic
      while (!isSolvable && attempts < maxAttempts) {
        attempts++;
        
        // Create and shuffle deck randomly
        deck = createDeck();
        // For the classic 24 game, filter out face cards
        const filteredDeck = deck.filter(card => card.value <= 10);
        deck = shuffleDeck(filteredDeck);
        
        // Deal 4 cards
        const cardsResult = drawCards(deck, 4);
        drawnCards = cardsResult.drawnCards;
        
        // Check if the game is solvable
        isSolvable = is24GameSolvable(drawnCards);
        
        if (isSolvable) {
          console.log(`Found solvable unlimited 24 game after ${attempts} attempt(s).`);
        } else if (attempts < maxAttempts) {
          console.log(`Unlimited 24 game attempt ${attempts} is not solvable with ${drawnCards.map(card => card.gameValue).join(', ')}. Trying again...`);
        }
      }
      
      // If we couldn't find a solvable game after maxAttempts, use the last generated one anyway
      if (!isSolvable) {
        console.warn(`Could not find a solvable unlimited 24 game after ${maxAttempts} attempts. Using the last generated game.`);
      }
      
      // Set the game state with the solvable game
      setTargetCards([]);
      setTargetNumber(24);
      setPlayCards(drawnCards);
      
      // Reset game state
      setSelectedCardIndices([]);
      setEquation([]);
      setResult(null);
      setMessage('Unlimited Mode (24): Use all 4 cards and operations to make 24!');
      setHasWon(false);
    }
  }, [gameType]);
  
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
    setDragGhostVisible(true);
    
    // Add dragging-active class to body
    document.body.classList.add('dragging-active');
    
    // Set initial drop target and position for empty equation
    if (equation.length === 0 && equationRef.current) {
      const equationRect = equationRef.current.getBoundingClientRect();
      setDropTargetIndex(0);
      setDropPosition({
        left: equationRect.width / 2,
        top: equationRect.height / 2
      });
      setShowDragPreview(true);
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
    
    // Reset body styles
    document.body.style.pointerEvents = '';
    document.body.classList.remove('dragging-active');
    
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
        
        // Check if the player has won - value must match target AND use all cards
        const targetValue = gameType === '24++' ? targetNumber : 24;
        
        if (calculatedResult === targetValue) {
          // Count cards used in the equation
          const numberCardsUsed = selectedCardIndices.length;
          
          // Check if the right number of cards are used (7 for 24++, 4 for 24)
          const requiredCardCount = gameType === '24++' ? playCards.length : 4;
          
          if (numberCardsUsed === requiredCardCount) {
            setMessage(`You won! You created the goal number using all ${requiredCardCount} cards!`);
            setHasWon(true);
            setIsSolvedModalOpen(true);
            
            // Play win sound effect if available
            // if (winSoundRef.current) {
            //   winSoundRef.current.currentTime = 0;
            //   winSoundRef.current.play().catch(e => console.error("Error playing sound:", e));
            // }
          } else {
            setMessage(`You've found the target number, but you need to use all ${requiredCardCount} cards to win. You've used ${numberCardsUsed} cards.`);
          }
        }
      } else {
        setResult(null);
      }
    } catch (error) {
      console.error('Error evaluating equation', error);
      setResult(null);
    }
  }, [equation, targetNumber, selectedCardIndices, playCards, gameType]);
  
  // Evaluate the equation
  useEffect(() => {
    if (equation.length === 0) {
      setResult(null);
      return;
    }
    
    checkWinCondition();
  }, [equation, checkWinCondition]);

  // Handle card click - add to equation or remove if already selected
  const handleCardClick = useCallback((index, card) => {
    if (selectedCardIndices.includes(index)) {
      // Card is already selected, find it in the equation and remove it
      const newEquation = [...equation];
      let foundIndex = -1;
      
      // Find the card in the equation by its originalIndex
      for (let i = 0; i < newEquation.length; i++) {
        const item = newEquation[i];
        if (typeof item === 'object' && 
            item.type === 'card' && 
            item.originalIndex === index) {
          foundIndex = i;
          break;
        }
      }
      
      // If found, remove it from the equation
      if (foundIndex !== -1) {
        newEquation.splice(foundIndex, 1);
        setEquation(newEquation);
      }
      
      // Remove the card from the selected cards
      setSelectedCardIndices(selectedCardIndices.filter(i => i !== index));
    } else {
      // Select the card and add to equation
      const card = playCards[index];
      const cardItem = {
        type: 'card',
        value: card.value,
        gameValue: card.value > 10 ? 10 : card.value, // Face cards (J, Q, K) are worth 10
        display: getDisplayValue(card.value),
        originalIndex: index
      };
      setEquation([...equation, cardItem]);
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

  // Expose handleCardClick and handleOperationClick to window object for component access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Create game object if it doesn't exist
      if (!window.game) {
        window.game = {};
      }
      window.game.handleCardClick = handleCardClick;
      window.game.handleOperationClick = handleOperationClick;
      
      // Cleanup
      return () => {
        if (window.game) {
          delete window.game.handleCardClick;
          delete window.game.handleOperationClick;
        }
      };
    }
  }, [handleCardClick, handleOperationClick]);

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

  // Add game type toggle UI to the header
  const renderGameTypeToggle = () => {
    return (
      <div className="game-type-toggle">
        <button 
          className={`game-type-button ${gameType === '24' ? 'active' : ''}`}
          onClick={toggleGameType}
          title={gameType === '24' ? "Switch to 24++" : "Switch to 24"}
          aria-label={`Switch to ${gameType === '24' ? '24++' : '24'} game mode`}
        >
          <span className="game-type-text left">24++</span>
          <span className="game-type-text right">24</span>
        </button>
      </div>
    );
  };

  // Add touch event listeners
  useEffect(() => {
    // Touch event handlers
    const handleTouchMove = (e) => {
      if (!dragging) return;
      
      // Always prevent default to stop scrolling during drag
      e.preventDefault();
      
      // Use the first touch
      const touch = e.touches[0];
      
      // Add pointer-events: none to the body during drag to prevent touch issues
      document.body.style.pointerEvents = 'none';
      
      // Update the drag ghost position to follow the touch
      setDragPosition({ 
        x: touch.clientX, 
        y: touch.clientY 
      });
      
      // Enable drag ghost visibility explicitly
      setDragGhostVisible(true);
      
      // Rest of the touch move handling code...
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
            setShowDragPreview(true);
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
            setShowDragPreview(true);
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
          
          // Check if we're over the trash button
          const trashElem = document.querySelector('[data-trash-target="true"]');
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
      
      // Re-enable pointer events on body
      document.body.style.pointerEvents = '';
      
      // Remove dragging-active class from body
      document.body.classList.remove('dragging-active');
      
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
        
        // Process the drop
        if (dropTargetIndex !== null) {
          // Special handling for drop into equation
          if (equationRef.current) {
            const equationRect = equationRef.current.getBoundingClientRect();
            
            const isOverEquation = (
              lastTouch.clientX >= equationRect.left &&
              lastTouch.clientX <= equationRect.right &&
              lastTouch.clientY >= equationRect.top &&
              lastTouch.clientY <= equationRect.bottom
            );
            
            if (isOverEquation) {
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
                // For operations, we convert to the functional symbols
                const operationValue = (op) => {
                  switch (op) {
                    case '×': return '×';
                    case '÷': return '÷';
                    default: return op;
                  }
                };
                
                // Insert at the drop target index
                newEquation.splice(dropTargetIndex, 0, operationValue(draggedItem));
              }
              
              // Update the equation state
              setEquation(newEquation);
            }
          }
        }
        
        // Check for trash can drop
        if (dragTrashActive) {
          if (draggedType === 'equation-item') {
            handleRemoveEquationItem(draggedSourceIndex);
          } else if (draggedType === 'card' && draggedSourceIndex !== null && selectedCardIndices.includes(draggedSourceIndex)) {
            // Find the card in the equation by originalIndex
            const equationIndex = equation.findIndex(item => 
              typeof item === 'object' && 
              item.type === 'card' && 
              item.originalIndex === draggedSourceIndex
            );
            
            if (equationIndex !== -1) {
              handleRemoveEquationItem(equationIndex);
            }
          }
        }
        
        // Use the existing mouse up handler for shared logic
        handleMouseUp(syntheticEvent);
      }
      
      // Reset drag state
      setDragging(false);
      setDraggedItem(null);
      setDraggedType(null);
      setDragPosition(null);
      setDragOffset({ x: 0, y: 0 });
      setDropTargetIndex(null);
      setShowDragPreview(false);
      setDragTrashActive(false);
      setDragGhostVisible(false);
    };

    // Add the touch event listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd, { passive: false });
      window.addEventListener('touchcancel', handleTouchEnd, { passive: false });
      
      // Cleanup
      return () => {
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('touchcancel', handleTouchEnd);
        
        // Reset body style if component unmounts during drag
        document.body.style.pointerEvents = '';
      };
    }
    
    return () => {};
  }, [dragging, dragPosition, equation, handleMouseUp, draggedItem, draggedType, draggedSourceIndex, dropTargetIndex, dragTrashActive]);

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
            <span className="instructions-icon">ℹ️</span>
          </button>
          
          <button 
            className="settings-button"
            onClick={() => setIsSettingsModalOpen(true)}
            title="Settings"
          >
            <span className="settings-icon">⚙️</span>
          </button>
        </div>
      </div>
      
      {/* Win sound effect - temporarily commented out */}
      {/* <audio ref={winSoundRef} src="https://assets.mixkit.co/sfx/preview/mixkit-animated-small-group-applause-523.mp3" preload="auto"></audio> */}
      
      {/* Goal Section */}
      <div className="target-number-display">
        <p className="game-message">{message}</p>
        <div className="target-cards">
          {gameMode !== 'daily' && gameType === '24++' && (
            <div 
              className="card face-down-card"
              onClick={redealGame}
              title="Redeal cards"
            >
              <div className="card-back-pattern"></div>
              <div className="redeal-text">REDEAL</div>
            </div>
          )}
          {gameType === '24++' ? (
            targetCards.map((card, index) => (
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
            ))
          ) : (
            gameMode !== 'daily' && (
              <div 
                className="card face-down-card"
                onClick={redealGame}
                title="Redeal cards"
              >
                <div className="card-back-pattern"></div>
                <div className="redeal-text">REDEAL</div>
              </div>
            )
          )}
        </div>
        <h2 data-number={gameType === '24++' ? targetNumber : 24}>Goal: <span>{gameType === '24++' ? targetNumber : 24}</span></h2>
      </div>
      
      {/* Play Cards Section */}
      <div className="play-cards-section">
        <h3>Your Cards</h3>
        <div className="cards-container">
          {playCards.map((card, index) => (
            <DraggableCard
              key={index}
              card={card}
              index={index}
              isSelected={selectedCardIndices.includes(index)}
              onDragStart={handleDragStart}
            />
          ))}
        </div>
        
        {/* Operations Row - Now inside the play cards section */}
        <div className="operations-row">
          <h3>Operations</h3>
          <div className="operations-container">
            {OPERATIONS.map((op, index) => (
              <DraggableOperation
                key={index}
                operation={op}
                onDragStart={handleDragStart}
              />
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
                  <div style={shiftStyle} key={index}>
                    <EquationItem
                      item={item}
                      index={index}
                      onDragStart={(item, index, type, clientX, clientY, offsetX, offsetY, sourceIndex) => {
                        // Create synthetic event
                        const syntheticEvent = {
                          preventDefault: () => {},
                          stopPropagation: () => {},
                          clientX,
                          clientY,
                          currentTarget: {
                            getBoundingClientRect: () => ({
                              left: clientX - offsetX,
                              top: clientY - offsetY
                            })
                          }
                        };
                        handleDragStart(type, item, sourceIndex, syntheticEvent);
                      }}
                      onClick={() => handleRemoveEquationItem(index)}
                    />
                  </div>
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
              className={`trash-button ${dragTrashActive ? 'active' : ''}`}
              data-trash-target="true"
            >
              🗑️
            </button>
            
            {/* Hidden div for trash can detection during drag */}
            <div 
              className="trash-can" 
              style={{ 
                display: 'none', 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                pointerEvents: 'none' 
              }}
            ></div>
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
        V1.5 - Created by <a href="https://cmxu.io" target="_blank" rel="noopener noreferrer">Calvin Xu</a> with <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer">Claude</a>.
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
        gameType={gameType}
        onPlayUnlimited={() => {
          // Close the solved modal
          setIsSolvedModalOpen(false);
          // Switch to unlimited mode
          handleModeSelection('unlimited');
        }}
      />
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        gameType={gameType}
        toggleGameType={toggleGameType}
      />
    </div>
  );
};

export default Game;