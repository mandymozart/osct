---
sidebar_position: 1
---

# Onion Skin Documentation

Welcome to the documentation for the Onion Skin (OSCT) project! This documentation will help you understand the architecture, components, and usage of the OSCT application.

## Project Overview

OSCT is an augmented reality (AR) web application built with modern web technologies. It provides a framework for creating interactive AR experiences accessible through web browsers, with a strong focus on privacy and no data tracking whatsoever.

### Live Deployments

- Staging: [https://osct.netlify.app](https://osct.netlify.app) [![Netlify Status](https://api.netlify.com/api/v1/badges/98de0d7b-4e71-4848-b987-6caa89675835/deploy-status)](https://app.netlify.com/sites/osct/deploys)
- Alternative deployment: [https://osct.glitch.me/](https://osct.glitch.me/)

## Technical Stack

- **Build System**: [Vite](https://vitejs.dev/)
- **Testing**: Vite Test
- **3D Rendering**: [A-Frame](https://aframe.io/)
- **Image Target Tracking**: [MindAR](https://hiukim.github.io/mind-ar-js-doc/) using TensorFlow
- **QR Scanning**: [jsQR](https://github.com/cozmo/jsQR)
- **State Management**: [Immer](https://immerjs.github.io/immer/)
- **Component Architecture**: Vanilla Custom Web Components
- **Deployment**: Netlify for staging, FTP for production

## Installation

```bash
cd client
npm install
```

**Known Issue**: If building on Windows with Node version >22, use `npm install --ignore-scripts` as there are canvas build scripts that have issues with GTK3. Alternatively, use Node 18 or add the following to your package.json:

```json
"canvas": {
  "skip-install": true
}
```

## Key Concepts

OSCT uses a state-based pattern for managing components and handling errors:

1. **WebAR**: Built with web standards for broad device compatibility
2. **Web Components**: Native browser technologies with no heavy frameworks
3. **Privacy First**: No data tracking whatsoever - all processing happens locally
4. **State Management**: BaseStore using immutable updates via Immer
5. **Managerial Architecture**: Specialized controllers for different app aspects

## Getting Started

To get started with OSCT, navigate through the sections in this documentation:

- [Game Store](/docs/store/game-store): Learn about the state management system
- [Base Store](/docs/store/base-store): Understand the underlying state management architecture
- [Components](/docs/components/example-usage): Discover how to use and extend the components
- [Pages](/docs/pages/PAGES): Learn about the page structure and navigation system

## Architecture Diagram

```
Onion Skin
├── State Management
│   ├── BaseStore (Immer-powered)
│   └── GameStore (AR-specific extensions)
├── Components
│   ├── Core Components
│   ├── UI Components
│   └── AR Components
└── Services
    ├── Camera & Permissions
    ├── Asset Management
    ├── QR Scanning
    └── Chapter Management
```

## Image Tracking Setup

MindAR is used for image tracking targets. Use the MindAR compiler to generate image tracking targets for your AR experiences.

Explore the documentation to learn more about each aspect of the application.
