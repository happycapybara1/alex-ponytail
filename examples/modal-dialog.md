# Modal Dialog

**Task:** "Add a modal dialog for the delete confirmation."

## Without Ponytail

```bash
npm install @radix-ui/react-dialog
# or: npm install react-modal
```

```jsx
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

export function DeleteModal({ onConfirm, onCancel }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="btn-danger">Delete</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>Confirm deletion</Dialog.Title>
          <Dialog.Description>This action cannot be undone.</Dialog.Description>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button onClick={onCancel}>Cancel</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button className="btn-danger" onClick={onConfirm}>Delete</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

A dependency, a portal, an overlay, a root, a trigger, a content wrapper, to show a box with two buttons.

## With Ponytail

```html
<!-- ponytail: browser has one, with focus trapping and backdrop built in -->
<dialog id="confirm-delete" aria-labelledby="confirm-title">
  <h2 id="confirm-title">Confirm deletion</h2>
  <p>This action cannot be undone.</p>
  <button id="cancel">Cancel</button>
  <button id="confirm">Delete</button>
</dialog>
```

```js
const dialog = document.getElementById("confirm-delete");
document.getElementById("cancel").onclick = () => dialog.close();
document.getElementById("confirm").onclick = () => { onConfirm(); dialog.close(); };

// Open it:
dialog.showModal();
```

**1 dependency + 30 lines → 0 dependencies + 10 lines.** The native `<dialog>` opened with `showModal()` makes the rest of the page inert, closes on Escape, renders a backdrop via `::backdrop`, and has the dialog role built in; `aria-labelledby` gives it its accessible name. All browsers since 2022. The library was solving a problem the platform solved.
