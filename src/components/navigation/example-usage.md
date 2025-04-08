# Navigation System Usage

## Basic Implementation

Add the NavigationBar component to your main layout or app component:

```html
<navigation-bar>
  <qr-button></qr-button>
  <scene-button></scene-button>
  <index-button></index-button>
  <chapters-button></chapters-button>
</navigation-bar>
```

## Customization

You can customize the button text via attributes:

```html
<navigation-bar>
  <qr-button text="QR"></qr-button>
  <scene-button text="VR"></scene-button>
  <index-button text="Index"></index-button>
  <chapters-button text="Chapters"></chapters-button>
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
