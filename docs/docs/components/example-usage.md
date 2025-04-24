# Navigation

## Basic Implementation

Add the NavigationBar component to your main layout or app component:

```html
<navigation-bar>
  <qr-button></qr-button>
  <index-button></index-button>
</navigation-bar>
```

## Customization

You can customize the button text via attributes:

```html
<navigation-bar>
  <qr-button text="QR"></qr-button>
  <index-button text="Index"></index-button>
</navigation-bar>
```

## Import Registration

Make sure to import the components in your main.ts or another appropriate entry point:

```typescript
// Import all navigation components at once
import "@/components/navigation";
import "@/components/buttons";
```

## Features

- **Responsive Design**: Buttons display only icons on mobile devices
- **State Management**: Button states (active/disabled) are managed automatically
- **Mutual Exclusivity**: QR and VR modes are mutually exclusive
- **Keyboard Accessibility**: Full keyboard support for accessibility
- **Consistent Styling**: Unified look and feel across all navigation components
