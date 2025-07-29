/* Custom animations */
@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes glow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(255, 212, 0, 0.3);
  }
  50% {
    box-shadow: 0 0 30px rgba(255, 212, 0, 0.6);
  }
}

@keyframes twinkle {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}

.animate-glow {
  animation: glow 2s ease-in-out infinite;
}

.animate-twinkle {
  animation: twinkle 2s ease-in-out infinite;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .a-scene {
    height: 100vh !important;
  }
}

/* VR/AR specific styles */
.vr-overlay {
  pointer-events: none;
}

.vr-overlay button {
  pointer-events: all;
}

/* Smooth transitions for mode switches */
.page-transition {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Custom scrollbar for chat */
.chat-messages::-webkit-scrollbar {
  width: 4px;
}

.chat-messages::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 212, 0, 0.5);
  border-radius: 2px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 212, 0, 0.7);
}
