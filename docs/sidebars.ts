import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // Custom sidebar for OSCT documentation
  osctSidebar: [
    {
      type: 'category',
      label: 'Introduction',
      items: ['intro'],
    },
    {
      type: 'category',
      label: 'State Management',
      items: [
        'store/game-store',
        'store/base-store',
        {
          type: 'category',
          label: 'Managers',
          items: ['store/managers/MANAGERS'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Components',
      items: ['components/example-usage'],
    },
    {
      type: 'category',
      label: 'Pages',
      items: ['pages/PAGES', 'pages/ERROR-PAGE'],
    },
    {
      type: 'category',
      label: 'Content',
      items: ['content/structure', 'content/configuration'],
    },
  ],
};

export default sidebars;
