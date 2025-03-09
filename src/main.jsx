import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './components/mobile-styles.css'  // Import mobile styles

// Add passive touch listeners to improve performance on mobile
// This helps with scrolling performance while maintaining the ability to preventDefault() when needed
const setupTouchHandling = () => {
  // Detect passive event listener support
  let supportsPassive = false;
  try {
    const opts = Object.defineProperty({}, 'passive', {
      get: function() {
        supportsPassive = true;
        return true;
      }
    });
    window.addEventListener('testPassive', null, opts);
    window.removeEventListener('testPassive', null, opts);
  } catch (e) {}

  // Make touch events faster by making them passive when possible
  document.addEventListener('touchstart', function() {}, supportsPassive ? { passive: true } : false);
  document.addEventListener('touchmove', function() {}, supportsPassive ? { passive: true } : false);
  
  // Fix iOS double-tap zoom issue
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function(event) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, supportsPassive ? { passive: false } : false);
};

// Initialize touch handling
setupTouchHandling();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
) 