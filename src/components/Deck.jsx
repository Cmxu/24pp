import React, { useState, useEffect } from 'react';

const Deck = () => {
  const [deck, setDeck] = useState([]);
  const [isShuffled, setIsShuffled] = useState(false);

  // Initialize the deck
  useEffect(() => {
    initializeDeck();
  }, []);

  // Create a standard deck of 52 cards
  const initializeDeck = () => {
    const suits = ['♥', '♦', '♣', '♠'];
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const newDeck = [];

    for (let suit of suits) {
      for (let value of values) {
        newDeck.push({
          value,
          suit,
          // Face cards are worth 10 in this game
          gameValue: value > 10 ? 10 : value
        });
      }
    }

    setDeck(newDeck);
    setIsShuffled(false);
  };

  // Shuffle the deck using Fisher-Yates algorithm
  const shuffleDeck = () => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setDeck(shuffled);
    setIsShuffled(true);
    return shuffled;
  };

  // Draw a specific number of cards from the deck
  const drawCards = (count) => {
    // Make sure deck is shuffled
    const currentDeck = isShuffled ? [...deck] : shuffleDeck();
    
    if (currentDeck.length < count) {
      console.error('Not enough cards in the deck');
      return [];
    }

    const drawnCards = currentDeck.splice(0, count);
    setDeck(currentDeck);
    return drawnCards;
  };

  // Reset the deck
  const resetDeck = () => {
    initializeDeck();
  };

  return {
    deck,
    shuffleDeck,
    drawCards,
    resetDeck,
    isShuffled,
    cardsRemaining: deck.length
  };
};

export default Deck; 